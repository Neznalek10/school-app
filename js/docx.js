// Reads the yellow-highlighted text out of a Word file in the browser, so the AI gets exactly those parts
// instead of having to spot highlighting, which chat apps often lose when they read a .docx.
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
export const MAX_DOCX_BYTES = 30 * 1024 * 1024;

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// A .docx is a zip; only word/document.xml is needed, found through the zip's central directory.
export async function readZipText(buffer, name) {
  const v = new DataView(buffer);
  let end = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i--) {
    if (u32(v, i) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error('This is not a Word (.docx) file.');
  let p = u32(v, end + 16);
  const count = u16(v, end + 10);
  for (let n = 0; n < count; n++) {
    if (u32(v, p) !== 0x02014b50) break;
    const method = u16(v, p + 10);
    const size = u32(v, p + 20);
    const nameLen = u16(v, p + 28);
    const extraLen = u16(v, p + 30);
    const commentLen = u16(v, p + 32);
    const local = u32(v, p + 42);
    const entry = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nameLen));
    if (entry === name) {
      const start = local + 30 + u16(v, local + 26) + u16(v, local + 28);
      const data = new Uint8Array(buffer, start, size);
      const raw = method === 0 ? data : method === 8 ? await inflate(data) : null;
      if (!raw) throw new Error('This Word file uses a compression the app cannot read.');
      return new TextDecoder().decode(raw);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('This file has no Word document inside. Save it as .docx and try again.');
}

// Word writes highlighting as <w:highlight w:val="yellow"/>; Google Docs exports it as yellow shading.
export function isYellow(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return false;
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16));
  return r >= 200 && g >= 180 && b <= 160 && r - b >= 90;
}

const attr = (el, name) => el?.getAttributeNS(W, name) ?? el?.getAttribute(`w:${name}`) ?? null;
const child = (el, name) => [...(el?.childNodes || [])].find(n => n.namespaceURI === W && n.localName === name) || null;
const HEADING = /^(heading|nadpis|title|titul|subtitle|podtitul)/i;

function runHighlighted(run) {
  const rPr = child(run, 'rPr');
  if (!rPr) return false;
  const hl = attr(child(rPr, 'highlight'), 'val');
  if (hl) return /^yellow$/i.test(hl);
  const shd = child(rPr, 'shd');
  return isYellow(attr(shd, 'fill'));
}

function runText(run) {
  let text = '';
  for (const n of run.childNodes) {
    if (n.namespaceURI !== W) continue;
    if (n.localName === 't') text += n.textContent;
    else if (n.localName === 'tab') text += ' ';
    else if (n.localName === 'br' || n.localName === 'cr') text += ' ';
  }
  return text;
}

// Highlighted text is wrapped in ==…==; the rest of each paragraph stays as context. Paragraphs without highlights are left out.
export function extractHighlights(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The Word document could not be read.');
  const sections = [];
  let current = { heading: '', paragraphs: [] };
  let passages = 0;
  let chars = 0;
  for (const p of doc.getElementsByTagNameNS(W, 'p')) {
    // Runs inside a text box belong to the text box's own paragraph.
    const runs = [...p.getElementsByTagNameNS(W, 'r')].filter(r => {
      let up = r.parentNode;
      while (up && !(up.namespaceURI === W && up.localName === 'p')) up = up.parentNode;
      return up === p;
    });
    const pPr = child(p, 'pPr');
    const style = attr(child(pPr, 'pStyle'), 'val') || '';
    const outline = attr(child(pPr, 'outlineLvl'), 'val');
    const plain = runs.map(runText).join('').replace(/\s+/g, ' ').trim();
    if (!plain) continue;
    // Neighbouring runs with the same highlighting are merged, so one passage gets one pair of markers.
    const segs = [];
    for (const r of runs) {
      const text = runText(r);
      if (!text) continue;
      const hl = runHighlighted(r);
      const last = segs.at(-1);
      if (last && last.hl === hl) last.text += text;
      else segs.push({ text, hl });
    }
    const marked = segs.filter(x => x.hl && x.text.trim());
    const line = segs.map(x => {
      if (!x.hl || !x.text.trim()) return x.text;
      return `${x.text.match(/^\s*/)[0]}==${x.text.trim()}==${x.text.match(/\s*$/)[0]}`;
    }).join('').replace(/\s+/g, ' ').trim();
    const found = marked.length;
    chars += marked.reduce((n, x) => n + x.text.trim().length, 0);
    if ((HEADING.test(style) || outline !== null) && plain.length < 200) {
      if (current.paragraphs.length) sections.push(current);
      current = { heading: plain, paragraphs: found ? [line] : [] };
      passages += found;
      continue;
    }
    if (!found) continue;
    passages += found;
    current.paragraphs.push(line);
  }
  if (current.paragraphs.length) sections.push(current);
  return { sections, passages, chars };
}

export function highlightsText({ sections }) {
  return sections.map(s => [s.heading ? `## ${s.heading}` : '', ...s.paragraphs.map(p => `- ${p}`)].filter(Boolean).join('\n')).join('\n\n');
}

export async function readHighlights(file) {
  if (file.size > MAX_DOCX_BYTES) throw new Error('That file is too large.');
  const xml = await readZipText(await file.arrayBuffer(), 'word/document.xml');
  return extractHighlights(xml);
}
