// localStorage with an in-memory fallback (private mode, blocked storage).
// Everything the student page must not lose goes through here.

const mem = {};

export function get(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch (e) { /* fall through to memory */ }
  return key in mem ? mem[key] : fallback;
}

export function set(key, value) {
  mem[key] = value;
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

export function remove(key) {
  delete mem[key];
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

// Random id for a submission. crypto.randomUUID is missing on older Android browsers.
export function uuid() {
  const b = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
