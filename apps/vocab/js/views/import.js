import { store } from '../store.js';
import { parseImport, saveDeck, swapWords, deckId, COMMON_LANGS, LANG_CODE, langName, langFlag } from '../data.js';
import { html, icon, plural, answersText, segmented, onSegmented } from '../ui.js';
import { deckHref } from './decks.js';

const EXAMPLE = `pes; dog
kočka; cat | kitty
jíst; eat`;

function langOptions(codes, selected) {
  return codes.map(c => html`<option value="${c}" ${c === selected ? 'selected' : ''}>${langFlag(c)} ${langName(c)}</option>`);
}

export function importView(app, { deck: target }) {
  const into = target ? app.deck(target) : null;
  const known = [...new Set([...app.languages(), ...COMMON_LANGS])];
  const lang = into?.lang || app.lang || app.embed.lang || 'en';
  const from = into?.from || 'cs';
  if (!known.includes(lang)) known.unshift(lang);

  const body = html`<div class="list-form">
    <section class="card">
      <header class="card-head"><h2>1. Your words</h2></header>
      ${segmented('source', [{ value: 'paste', label: 'Paste text' }, { value: 'file', label: 'Upload file' }], 'paste')}
      <div class="source source-paste">
        <textarea class="input textarea" rows="8" placeholder="${EXAMPLE}" spellcheck="false" aria-label="Words to import"></textarea>
      </div>
      <div class="source source-file" hidden>
        <label class="dropzone">
          ${icon('upload')}
          <strong>Choose a file</strong>
          <span>.json, .csv, .tsv or .txt</span>
          <input type="file" accept=".json,.csv,.tsv,.txt,application/json,text/plain,text/csv" hidden>
        </label>
        <div class="file-name muted small"></div>
      </div>
      <details class="help">
        <summary>${icon('info')}Accepted formats</summary>
        <ul>
          <li><strong>JSON list:</strong> <code>[{"q": "pes", "a": "dog"}, {"q": "kočka", "a": ["cat", "kitty"]}]</code>. The keys <code>question/answer</code>, <code>front/back</code>, <code>term/definition</code> and <code>word/translation</code> work too.</li>
          <li><strong>JSON deck:</strong> <code>{"lang": "en", "from": "cs", "title": "Animals", "words": [...]}</code> fills in the languages and name for you.</li>
          <li><strong>JSON pairs:</strong> <code>{"pes": "dog", "kočka": "cat"}</code></li>
          <li><strong>Text or CSV:</strong> one word per line, the two sides separated by <code>;</code> <code>,</code> <code>=</code> <code> - </code> or a tab. Separate several correct answers with <code>|</code>.</li>
        </ul>
      </details>
    </section>

    <section class="card">
      <header class="card-head"><h2>2. Languages and deck</h2></header>
      <div class="form-grid">
        <label class="field"><span class="field-label">Language you're learning</span>
          <select class="input" name="lang">${langOptions(known, lang)}<option value="other">Other…</option></select>
        </label>
        <label class="field field-other" hidden><span class="field-label">Language code</span>
          <input class="input" name="langCode" placeholder="e.g. hu, el, fi" maxlength="8" autocapitalize="off">
        </label>
        <label class="field"><span class="field-label">Your language (the other side)</span>
          <select class="input" name="from">${langOptions(known, from)}</select>
        </label>
        <label class="field field-wide"><span class="field-label">Deck name</span>
          <input class="input" name="title" placeholder="e.g. Unit 3 animals" maxlength="60" list="deck-names" value="${into?.title || ''}">
          <datalist id="deck-names">${app.decks.map(d => html`<option value="${d.title}">`)}</datalist>
        </label>
      </div>
      <p class="muted small deck-target"></p>
      <div class="field-label">Which side is which</div>
      ${segmented('order', [{ value: 'file', label: 'As in the file' }, { value: 'swap', label: 'Swap the sides' }], 'file')}
      <div class="field-label">Stats</div>
      ${segmented('stats', [{ value: 'auto', label: 'Automatic' }, { value: 'zero', label: 'All to 0' }], 'auto')}
      <p class="muted small stats-hint"></p>
    </section>

    <section class="card preview">
      <header class="card-head"><h2>3. Check and import</h2><span class="card-meta preview-status">Nothing to import yet</span></header>
      <div class="preview-list"></div>
      <button class="btn btn-primary btn-block btn-lg" data-import disabled>${icon('check')}Import</button>
      <p class="muted small">Decks are saved on this device under your profile. Use Download on a deck, or a backup in Settings, to move them.</p>
    </section></div>`;

  return {
    title: into ? 'Add words' : 'Import',
    back: into ? `deck/${encodeURIComponent(into.id)}` : 'decks',
    tab: 'decks',
    hideLang: true,
    body,
    mount(root) {
      const $ = sel => root.querySelector(sel);
      const field = name => root.querySelector(`[name=${name}]`);
      const textarea = $('textarea');
      let text = '';
      let filename = '';
      let parsed = parseImport('');
      let order = 'file';
      let stats = 'auto';
      let timer;

      const langValue = () => (field('lang').value === 'other' ? field('langCode').value.trim().toLowerCase() : field('lang').value);
      const words = () => (order === 'swap' ? swapWords(parsed.words) : parsed.words);

      const applyMeta = meta => {
        if (meta.lang) {
          const code = String(meta.lang).toLowerCase();
          if (LANG_CODE.test(code) && ![...field('lang').options].some(o => o.value === code)) field('lang').add(new Option(`${langFlag(code)} ${langName(code)}`, code), 0);
          if (LANG_CODE.test(code)) field('lang').value = code;
        }
        if (meta.from) {
          const code = String(meta.from).toLowerCase();
          if (LANG_CODE.test(code) && ![...field('from').options].some(o => o.value === code)) field('from').add(new Option(`${langFlag(code)} ${langName(code)}`, code), 0);
          if (LANG_CODE.test(code)) field('from').value = code;
        }
        if (meta.title && !field('title').value) field('title').value = meta.title;
        root.querySelector('.field-other').hidden = field('lang').value !== 'other';
      };

      const describe = () => {
        const title = field('title').value.trim();
        const code = langValue();
        const existing = title && LANG_CODE.test(code) ? app.deck(deckId(field('from').value, code, title)) : null;
        $('.deck-target').textContent = existing ? `Adds to your deck "${existing.title}" (${plural(existing.words.length, 'word')}). Words already in it are merged.` : title ? 'Creates a new deck.' : '';
        const withStats = order === 'file' ? parsed.words.filter(w => w.stats).length : 0;
        $('.stats-hint').textContent = stats === 'zero'
          ? 'Every imported word starts as New with 0 right and 0 wrong, even words you already practised in this deck.'
          : `New words start at 0, words already in the deck keep their stats${withStats ? `, and ${plural(withStats, 'word')} take the stats saved in the file` : ''}.`;
      };

      const renderPreview = () => {
        const status = $('.preview-status');
        const list = $('.preview-list');
        const shown = words();
        if (parsed.error) {
          status.textContent = 'Could not read this';
          list.innerHTML = html`<div class="notice notice-bad">${icon('alert')}<span>${parsed.error}</span></div>`.s;
        } else if (!shown.length) {
          status.textContent = text.trim() ? 'No words found' : 'Nothing to import yet';
          list.innerHTML = text.trim() ? html`<div class="notice notice-warn">${icon('alert')}<span>No lines with two sides were found. Check the accepted formats above.</span></div>`.s : '';
        } else {
          const extra = [parsed.duplicates && `${plural(parsed.duplicates, 'duplicate')} merged`, parsed.skipped && `${plural(parsed.skipped, 'line')} skipped`].filter(Boolean);
          status.textContent = [plural(shown.length, 'word'), ...extra].join(' · ');
          const code = langValue();
          list.innerHTML = html`<div class="preview-sides"><span>${langName(field('from').value)}</span>${icon('chevronRight')}<span>${LANG_CODE.test(code) ? langName(code) : '?'}</span></div>
            <div class="word-list">${shown.slice(0, 5).map(w => html`<div class="word-row">
            <div class="word-main"><div class="word-q">${w.q}</div><div class="word-a">${answersText(w.a)}</div></div></div>`)}</div>
            ${shown.length > 5 ? html`<p class="muted small">…and ${shown.length - 5} more</p>` : ''}`.s;
        }
        describe();
        validate();
      };

      const update = () => {
        parsed = parseImport(text, filename);
        applyMeta(parsed.meta);
        renderPreview();
      };

      const validate = () => {
        const ok = parsed.words.length > 0 && field('title').value.trim() && LANG_CODE.test(langValue()) && langValue() !== field('from').value;
        $('[data-import]').disabled = !ok;
      };

      onSegmented(root.querySelector('.list-form'), (name, value) => {
        if (name === 'source') {
          $('.source-paste').hidden = value !== 'paste';
          $('.source-file').hidden = value !== 'file';
        }
        if (name === 'order') order = value;
        if (name === 'stats') stats = value;
        renderPreview();
      });

      textarea.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          text = textarea.value;
          filename = '';
          update();
        }, 150);
      });

      $('input[type=file]').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        text = await file.text();
        filename = file.name;
        textarea.value = text;
        $('.file-name').textContent = `Loaded ${file.name}`;
        update();
      });

      field('lang').addEventListener('change', () => {
        root.querySelector('.field-other').hidden = field('lang').value !== 'other';
        renderPreview();
      });
      field('from').addEventListener('change', renderPreview);
      root.querySelectorAll('[name=langCode], [name=title]').forEach(el => el.addEventListener('input', renderPreview));
      describe();

      $('[data-import]').addEventListener('click', () => {
        const code = langValue();
        const title = field('title').value.trim();
        const existing = app.deck(deckId(field('from').value, code, title));
        const result = saveDeck(store.decks, store.progress, {
          lang: code,
          from: field('from').value,
          title: existing?.title || title,
          words: words(),
          stats,
        });
        store.save('decks');
        store.save('progress');
        app.reload();
        store.lang = code;
        store.save('lang');
        const notes = [
          result.merged && `${result.merged} already there, answers merged`,
          result.fromFile && `${plural(result.fromFile, 'word')} with stats from the file`,
          result.reset && `${plural(result.reset, 'word')} set to 0`,
        ].filter(Boolean);
        app.toast(`Added ${plural(result.added, 'word')} to "${existing?.title || title}"${notes.length ? ` (${notes.join(', ')})` : ''}`, { kind: 'success', duration: 5000 });
        location.hash = deckHref({ id: result.id });
      });
    },
  };
}
