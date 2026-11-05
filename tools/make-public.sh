#!/usr/bin/env bash
# Builds the clean public copy of this repository and puts it in a separate folder, ready to push.
#
# Usage: tools/make-public.sh [target-dir]      (from any folder; it moves to the repository root first)
#   target-dir   where the public clone lives; default: <repo>/../school-app-public
# Environment:
#   PUBLIC_AUTHOR_NAME / PUBLIC_AUTHOR_EMAIL   author and committer of the public commits
#                                               (defaults: "School app" / "school-app@users.noreply.github.com")
#
# How it works (nothing on disk is ever deleted, the working tree and the real index are never touched):
#   1. Reads HEAD's tree into a temporary index file under .git/ and removes data/ and every path listed in
#      the optional tools/public-exclude.txt from it. The public .gitignore gets a `data/` line.
#   2. Refuses (exit 1, nothing committed) if any file of that tree contains the git user name, the git user
#      email or a line of the optional, gitignored tools/private-words.txt (case-insensitive).
#   3. Commits the tree on refs/heads/public with a neutral author, parent = the previous public commit.
#      No commit is made when the tree equals the previous public tree.
#   4. Clones the public branch into the target (first run: branch renamed to main, remote named `local`)
#      or fast-forwards an existing clone, then prints the commands that push it to GitHub.
# Used by hand by the repository owner; the tests in tests/test_make_public.py exercise it on temporary repos.
set -euo pipefail

DEFAULT_AUTHOR_NAME="School app"
DEFAULT_AUTHOR_EMAIL="school-app@users.noreply.github.com"
PUBLIC_REF="refs/heads/public"
EXCLUDE_FILE="tools/public-exclude.txt"
PRIVATE_WORDS_FILE="tools/private-words.txt"
TEMP_INDEX_NAME="make-public.index"

# Prints a one-line error to stderr and exits non-zero.
die() {
  echo "make-public: $*" >&2
  exit 1
}

# Runs git against the temporary index instead of the real one.
git_tmp() {
  GIT_INDEX_FILE="$INDEX_FILE" git "$@"
}

# Refuses to continue when the target exists but is neither empty nor our clone of this repository.
# Args: $1 target folder. Returns 0 when the target is absent, empty or a valid clone.
check_target() {
  local target="$1"
  [[ -e "$target" ]] || return 0
  [[ -d "$target" ]] || die "$target exists and is not a folder. Choose another target."
  # An empty folder is safe to clone into.
  [[ -n "$(ls -A "$target")" ]] || return 0
  local top remote_url branch
  top="$(git -C "$target" rev-parse --show-toplevel 2>/dev/null)" || top=""
  [[ -n "$top" && "$(cd "$target" && pwd -P)" == "$top" ]] ||
    die "$target exists but is not a git clone made by this script. Move it away or choose another target."
  remote_url="$(git -C "$target" remote get-url local 2>/dev/null)" || remote_url=""
  [[ -n "$remote_url" && "$(cd "$remote_url" 2>/dev/null && pwd -P)" == "$ROOT" ]] ||
    die "$target has no remote 'local' pointing to $ROOT. Move it away or choose another target."
  branch="$(git -C "$target" symbolic-ref --short -q HEAD)" || branch=""
  [[ "$branch" == "main" ]] ||
    die "$target is not on branch main. Check it out there or choose another target."
}

# Builds the public tree in the temporary index and prints its tree id.
# Side effects: overwrites the temporary index file, writes git objects (a blob and a tree).
build_public_tree() {
  local path blob
  # read-tree overwrites any index file left from an earlier run.
  git_tmp read-tree HEAD

  # Paths to drop: always data/, plus the owner's optional list (blank lines and # comments ignored).
  local -a drop=("data")
  if git cat-file -e "HEAD:$EXCLUDE_FILE" 2>/dev/null; then
    while IFS= read -r path; do
      [[ -z "$path" || "$path" == \#* ]] || drop+=("$path")
    done < <(git show "HEAD:$EXCLUDE_FILE")
  fi
  for path in "${drop[@]}"; do
    git_tmp ls-files -z -- "$path" | git_tmp update-index --force-remove -z --stdin
  done

  # Public .gitignore: the private one plus data/, written straight into the object store.
  blob="$({
    git_tmp show :.gitignore 2>/dev/null || true
    printf '\n# Personal progress data is never published\ndata/\n'
  } | git hash-object -w --stdin)"
  git_tmp update-index --add --cacheinfo "100644,$blob,.gitignore"
  git_tmp write-tree
}

# Fails when the tree contains personal information.
# Args: $1 tree id. Terms checked: git user.name, git user.email, each line of the private words file.
# Only the kind of term and the matching files are printed, never the term itself.
check_no_personal_info() {
  local tree="$1" label term value files status
  local -a labels=() terms=()
  for label in user.name user.email; do
    value="$(git config "$label" || true)"
    [[ -z "$value" ]] || { labels+=("git $label"); terms+=("$value"); }
  done
  if [[ -f "$PRIVATE_WORDS_FILE" ]]; then
    while IFS= read -r term || [[ -n "$term" ]]; do
      [[ -z "${term//[[:space:]]/}" ]] || { labels+=("a word from $PRIVATE_WORDS_FILE"); terms+=("$term"); }
    done < "$PRIVATE_WORDS_FILE"
  fi
  local i
  for i in "${!terms[@]}"; do
    # -l lists files only, -i is case-insensitive, -F treats the term literally (no regex surprises).
    # Exit 0 = found, 1 = clean, anything else = git failed, which must not pass as "clean".
    status=0
    files="$(git grep -l -i -F -e "${terms[$i]}" "$tree" --)" || status=$?
    if [[ $status -eq 0 ]]; then
      echo "make-public: the public tree contains ${labels[$i]} in:" >&2
      echo "${files//"$tree:"/  }" >&2
      die "nothing was committed. Remove it from those files and commit again."
    elif [[ $status -ne 1 ]]; then
      die "git grep failed (exit $status); cannot verify the public tree is free of personal info."
    fi
  done
}

# Commits the tree on the public branch unless it equals the previous public tree.
# Args: $1 tree id. Prints a status line.
commit_public_tree() {
  local tree="$1" previous="" commit
  local -a parent=()
  previous="$(git rev-parse -q --verify "$PUBLIC_REF" || true)"
  if [[ -n "$previous" ]]; then
    if [[ "$(git rev-parse "$previous^{tree}")" == "$tree" ]]; then
      echo "Public branch is already up to date."
      return 0
    fi
    parent=(-p "$previous")
  fi
  local name="${PUBLIC_AUTHOR_NAME:-$DEFAULT_AUTHOR_NAME}" email="${PUBLIC_AUTHOR_EMAIL:-$DEFAULT_AUTHOR_EMAIL}"
  # The identity is set for this one command only, so the owner's own name never reaches the commit.
  commit="$(GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" GIT_COMMITTER_NAME="$name" \
    GIT_COMMITTER_EMAIL="$email" git commit-tree "$tree" ${parent[@]+"${parent[@]}"} -m "Public copy of the school app")"
  git update-ref "$PUBLIC_REF" "$commit"
  echo "Public branch updated: ${commit:0:10}"
}

# Clones the public branch into the target on the first run, otherwise merges it into the existing clone.
# A merge (not a fast-forward) keeps commits made only on GitHub, such as a LICENSE added there.
# Args: $1 target folder.
sync_target() {
  local target="$1"
  if [[ -d "$target/.git" ]]; then
    local name="${PUBLIC_AUTHOR_NAME:-$DEFAULT_AUTHOR_NAME}" email="${PUBLIC_AUTHOR_EMAIL:-$DEFAULT_AUTHOR_EMAIL}"
    GIT_AUTHOR_NAME="$name" GIT_AUTHOR_EMAIL="$email" GIT_COMMITTER_NAME="$name" \
      GIT_COMMITTER_EMAIL="$email" git -C "$target" pull --no-rebase --no-edit local public
  else
    # --no-local forces a real pack transfer (no hardlinked or copied object store), and --single-branch
    # --no-tags brings only the public history: private branches, tags and their blobs stay out of the target.
    git clone --quiet --no-local --single-branch --no-tags --branch public --origin local "$ROOT" "$target"
    git -C "$target" branch -m public main
  fi
}

# Prints the commands that publish the clone.
# Args: $1 target folder.
print_push_help() {
  cat <<HELP

Public copy ready in: $1
To publish it (first time):
  git -C "$1" remote add origin git@github.com:<your-account>/<repository>.git
  git -C "$1" push -u origin main
Later updates: run this script again, then:
  git -C "$1" push origin main
HELP
}

# Runs every step in order; the target is validated first so a refusal changes nothing.
main() {
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
  cd "$ROOT"
  local target="${1:-$ROOT/../school-app-public}"
  INDEX_FILE="$(git rev-parse --absolute-git-dir)/$TEMP_INDEX_NAME"
  check_target "$target"
  local tree
  tree="$(build_public_tree)"
  check_no_personal_info "$tree"
  commit_public_tree "$tree"
  sync_target "$target"
  print_push_help "$target"
}

main "$@"
