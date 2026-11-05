// The school dashboard opens this app as ?profile=<id>&name=<name>&lang=<code>&home=<dashboard url>.
const PROFILE_ID = /^[\w-]{1,40}$/;
const LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;

// Only a link back into the same site is accepted, so a crafted URL can't send you elsewhere.
export function safeHome(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    return url.origin === new URL(base).origin ? url.href : null;
  } catch {
    return null;
  }
}

export function embedParams(search, base) {
  const p = new URLSearchParams(search);
  const id = p.get('profile') || '';
  const name = (p.get('name') || '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const lang = (p.get('lang') || '').trim().toLowerCase();
  return {
    profile: PROFILE_ID.test(id) && name ? { id, name } : null,
    lang: LANG.test(lang) ? lang : null,
    home: safeHome(p.get('home'), base),
  };
}
