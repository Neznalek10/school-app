"""Tests for tools/make-public.sh, run against throwaway git repositories.

The script is copied into each temporary repository (it locates the repo root from its own path), so the real
project repository is never touched. Every git call uses its own identity and ignores global/system config,
because CI machines have no global git identity.
"""

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "tools" / "make-public.sh"
OWNER_NAME = "Jan Example"
OWNER_EMAIL = "jan.example@example.org"
NEUTRAL_IDENTITY = "School app|school-app@users.noreply.github.com"
ISOLATED_ENV = {
    **os.environ,
    "GIT_CONFIG_GLOBAL": os.devnull,
    "GIT_CONFIG_NOSYSTEM": "1",
}
for _key in ("GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE"):
    ISOLATED_ENV.pop(_key, None)


def git(cwd: Path, *args: str) -> str:
    """Runs git in `cwd` with the isolated environment and returns stripped stdout.

    Args:
        cwd: folder to run in.
        *args: git arguments.

    Raises:
        subprocess.CalledProcessError: when git exits non-zero.
    """
    result = subprocess.run(["git", *args], cwd=cwd, env=ISOLATED_ENV, check=True, capture_output=True, text=True)
    return result.stdout.strip()


class MakePublicTestCase(unittest.TestCase):
    """Base class: a temporary private repository "school-app" with data/, code and the script committed."""

    def setUp(self) -> None:
        """Creates the temp folder and the private repo with one commit."""
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = Path(self._tmp.name)
        self.repo = self.base / "school-app"
        (self.repo / "tools").mkdir(parents=True)
        (self.repo / "data").mkdir()
        git(self.repo, "init", "-q", "-b", "main")
        git(self.repo, "config", "user.name", OWNER_NAME)
        git(self.repo, "config", "user.email", OWNER_EMAIL)
        shutil.copy(SCRIPT, self.repo / "tools" / "make-public.sh")
        self.write("index.html", "<h1>School</h1>\n")
        self.write(".gitignore", ".env\n")
        self.write("data/progress.json", '{"private": true}\n')
        self.commit("first")

    def write(self, relative: str, text: str) -> None:
        """Writes a text file into the private repo, creating folders."""
        path = self.repo / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def commit(self, message: str) -> None:
        """Stages everything and commits it in the private repo."""
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "-q", "-m", message)

    def run_script(self, target: Path | None = None, **env: str) -> subprocess.CompletedProcess:
        """Runs the script from an unrelated folder; extra keyword args become environment variables."""
        args = ["bash", str(self.repo / "tools" / "make-public.sh")]
        if target is not None:
            args.append(str(target))
        return subprocess.run(args, cwd=self.base, env={**ISOLATED_ENV, **env}, capture_output=True, text=True)

    def public_files(self) -> list[str]:
        """Lists the file paths on the public branch."""
        return git(self.repo, "ls-tree", "-r", "--name-only", "public").splitlines()


class BuildTests(MakePublicTestCase):
    """The public branch content, author and target clone."""

    def test_public_tree_has_no_data_and_ignores_it(self) -> None:
        """data/ is absent from the public tree and the public .gitignore lists it, keeping old entries."""
        result = self.run_script(self.base / "out")
        self.assertEqual(result.returncode, 0, result.stderr)
        files = self.public_files()
        self.assertIn("index.html", files)
        self.assertFalse([f for f in files if f.startswith("data/")])
        ignore = git(self.repo, "show", "public:.gitignore").splitlines()
        self.assertIn("data/", ignore)
        self.assertIn(".env", ignore)

    def test_commit_uses_neutral_identity(self) -> None:
        """Author and committer are the neutral defaults, never the owner's git identity."""
        self.run_script(self.base / "out")
        author = git(self.repo, "log", "-1", "--format=%an|%ae", "public")
        committer = git(self.repo, "log", "-1", "--format=%cn|%ce", "public")
        self.assertEqual(author, NEUTRAL_IDENTITY)
        self.assertEqual(committer, NEUTRAL_IDENTITY)

    def test_author_can_be_overridden(self) -> None:
        """PUBLIC_AUTHOR_NAME and PUBLIC_AUTHOR_EMAIL replace the defaults."""
        self.run_script(self.base / "out", PUBLIC_AUTHOR_NAME="Team", PUBLIC_AUTHOR_EMAIL="team@example.net")
        self.assertEqual(git(self.repo, "log", "-1", "--format=%an|%ae|%cn|%ce", "public"),
                         "Team|team@example.net|Team|team@example.net")

    def test_target_is_clone_on_main_with_remote_local(self) -> None:
        """The first run clones into the target: branch main, remote local, no data/ on disk."""
        target = self.base / "out"
        result = self.run_script(target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(git(target, "symbolic-ref", "--short", "HEAD"), "main")
        self.assertEqual(git(target, "remote"), "local")
        self.assertTrue((target / "index.html").is_file())
        self.assertFalse((target / "data").exists())
        self.assertIn("git -C", result.stdout)
        self.assertIn("push", result.stdout)

    def test_default_target_is_next_to_the_repo(self) -> None:
        """Without an argument the clone goes to <repo>/../school-app-public."""
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.base / "school-app-public" / "index.html").is_file())

    def test_exclude_file_removes_listed_paths(self) -> None:
        """Paths in tools/public-exclude.txt are left out; comments and blank lines are ignored."""
        self.write("tools/public-exclude.txt", "# internal\n\n.forge\n")
        self.write(".forge/plan.md", "plan\n")
        self.commit("exclude")
        self.run_script(self.base / "out")
        self.assertFalse([f for f in self.public_files() if f.startswith(".forge")])
        self.assertIn("index.html", self.public_files())

    def test_working_tree_and_real_index_are_untouched(self) -> None:
        """The private repo keeps data/ on disk and reports a clean status after the run."""
        self.run_script(self.base / "out")
        self.assertTrue((self.repo / "data" / "progress.json").is_file())
        self.assertEqual(git(self.repo, "status", "--porcelain"), "")


class IsolationTests(MakePublicTestCase):
    """The public clone must hold nothing from the private repo beyond the public history."""

    def private_blob(self) -> str:
        """Returns the id of a blob that exists only in the private repo's data/ (an untracked-by-public object)."""
        return git(self.repo, "rev-parse", "HEAD:data/progress.json")

    def assert_clone_is_clean(self, target: Path) -> None:
        """Checks refs are only main and local/public and the private data blob is absent."""
        refs = git(target, "for-each-ref", "--format=%(refname)").splitlines()
        self.assertEqual(sorted(refs), ["refs/heads/main", "refs/remotes/local/public"])
        missing = subprocess.run(["git", "cat-file", "-e", self.private_blob()], cwd=target,
                                 env=ISOLATED_ENV, capture_output=True)
        self.assertNotEqual(missing.returncode, 0)

    def test_clone_has_no_private_branches_tags_or_objects(self) -> None:
        """Other private branches and tags do not reach the clone, nor do blobs only data/ contains."""
        git(self.repo, "branch", "feature-private")
        git(self.repo, "tag", "private-tag")
        target = self.base / "out"
        self.assertEqual(self.run_script(target).returncode, 0)
        self.assert_clone_is_clean(target)

    def test_clone_stays_clean_after_second_run(self) -> None:
        """Updating the clone fetches only the public branch, so the private blob is still absent."""
        target = self.base / "out"
        self.run_script(target)
        git(self.repo, "branch", "feature-private")
        self.write("app.js", "x\n")
        self.commit("add app")
        self.assertEqual(self.run_script(target).returncode, 0)
        self.assert_clone_is_clean(target)


class UpdateTests(MakePublicTestCase):
    """Re-running the script."""

    def test_second_run_fast_forwards_target(self) -> None:
        """A new private commit reaches the existing clone as a fast-forward on top of the old history."""
        target = self.base / "out"
        self.run_script(target)
        self.write("app.js", "console.log(1);\n")
        self.commit("add app")
        result = self.run_script(target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((target / "app.js").is_file())
        self.assertEqual(git(self.repo, "rev-list", "--count", "public"), "2")
        self.assertEqual(git(target, "rev-parse", "HEAD"), git(self.repo, "rev-parse", "public"))

    def test_unchanged_tree_makes_no_new_commit(self) -> None:
        """A private commit that only touches data/ leaves the public branch where it was."""
        target = self.base / "out"
        self.run_script(target)
        before = git(self.repo, "rev-parse", "public")
        self.write("data/progress.json", '{"private": false}\n')
        self.commit("data only")
        result = self.run_script(target)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(git(self.repo, "rev-parse", "public"), before)


class RefusalTests(MakePublicTestCase):
    """Cases where the script must stop and change nothing."""

    def assert_refused(self, result: subprocess.CompletedProcess, target: Path) -> None:
        """Checks exit 1, no public branch, no clone, and that the secret itself is not echoed."""
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(OWNER_EMAIL, result.stderr)
        has_public = subprocess.run(["git", "rev-parse", "-q", "--verify", "refs/heads/public"],
                                    cwd=self.repo, env=ISOLATED_ENV, capture_output=True)
        self.assertNotEqual(has_public.returncode, 0)
        self.assertFalse(target.exists())

    def test_tracked_file_with_email_is_refused(self) -> None:
        """An email in a public file stops the run, matching case-insensitively."""
        self.write("README.md", f"Contact {OWNER_EMAIL.upper()}\n")
        self.commit("readme")
        target = self.base / "out"
        result = self.run_script(target)
        self.assert_refused(result, target)
        self.assertIn("README.md", result.stderr)
        self.assertIn("user.email", result.stderr)

    def test_tracked_file_with_name_is_refused(self) -> None:
        """The owner's name in a public file stops the run."""
        self.write("docs.md", f"By {OWNER_NAME.lower()}\n")
        self.commit("docs")
        target = self.base / "out"
        self.assert_refused(self.run_script(target), target)

    def test_private_word_is_refused(self) -> None:
        """A line of the untracked tools/private-words.txt stops the run; blank lines are ignored."""
        self.write("tools/private-words.txt", "\nSecretSchool\n")
        self.write("notes.md", "I go to secretschool.\n")
        self.commit("notes")
        target = self.base / "out"
        result = self.run_script(target)
        self.assert_refused(result, target)
        self.assertIn("private-words.txt", result.stderr)

    def test_email_only_in_data_is_allowed(self) -> None:
        """Personal info inside data/ is fine because data/ never reaches the public tree."""
        self.write("data/progress.json", f'{{"mail": "{OWNER_EMAIL}"}}\n')
        self.commit("data mail")
        self.assertEqual(self.run_script(self.base / "out").returncode, 0)

    def test_foreign_target_folder_is_refused(self) -> None:
        """A non-empty folder that is not our clone is not touched."""
        target = self.base / "out"
        target.mkdir()
        (target / "mine.txt").write_text("keep\n", encoding="utf-8")
        result = self.run_script(target)
        self.assertEqual(result.returncode, 1)
        self.assertIn("not a git clone", result.stderr)
        self.assertEqual([p.name for p in target.iterdir()], ["mine.txt"])

    def test_clone_of_another_repo_is_refused(self) -> None:
        """A git clone whose remote 'local' is missing is refused."""
        target = self.base / "out"
        target.mkdir()
        git(target, "init", "-q", "-b", "main")
        (target / "x.txt").write_text("x\n", encoding="utf-8")
        result = self.run_script(target)
        self.assertEqual(result.returncode, 1)
        self.assertIn("remote 'local'", result.stderr)


if __name__ == "__main__":
    unittest.main()
