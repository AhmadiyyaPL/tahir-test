// Pure scoring logic. Shared by the student page, the teacher page and the Node tests,
// so it must not touch the DOM or storage. Answers are keyed by item number (`n`).

export const TYPES = ['mc', 'fill', 'order', 'table', 'open'];

// Minimum share of correctly placed tiles for one partial point in `order` items.
// Integer maths on purpose: Math.ceil(10 * 0.7) is 8 because 0.7 is not exact.
export function orderPartialThreshold(len) {
  return Math.floor((len * 7 + 9) / 10);
}

// Flat list of the blanks in a `table` item; the answer array uses the same order.
export function tableBlanks(item) {
  const out = [];
  item.rows.forEach((row, r) => {
    row.blanks.forEach((b) => out.push({ row: r, col: b.col, answer: String(b.answer) }));
  });
  return out;
}

export function blankAnswer(item) {
  switch (item.type) {
    case 'mc': return null;
    case 'order': return [];
    case 'table': return tableBlanks(item).map(() => '');
    default: return '';
  }
}

// Coerce a stored answer back into the shape the item expects; anything malformed
// (old session, edited test file) becomes a blank answer instead of crashing.
export function sanitizeAnswer(item, v) {
  switch (item.type) {
    case 'mc':
      return Number.isInteger(v) && v >= 0 && v < item.options.length ? v : null;
    case 'fill':
      return typeof v === 'string' ? v.slice(0, 40) : '';
    case 'open':
      return typeof v === 'string' ? v.slice(0, 1000) : '';
    case 'order': {
      if (!Array.isArray(v)) return [];
      const ok = v.every((k) => Number.isInteger(k) && k >= 0 && k < item.tiles.length) &&
        new Set(v).size === v.length;
      return ok ? v.slice() : [];
    }
    case 'table': {
      const len = tableBlanks(item).length;
      if (!Array.isArray(v) || v.length !== len) return blankAnswer(item);
      return v.map((x) => (typeof x === 'string' ? x.slice(0, 4) : ''));
    }
    default:
      return null;
  }
}

export function isAnswered(item, v) {
  switch (item.type) {
    case 'mc': return v !== null && v !== undefined;
    case 'order': return Array.isArray(v) && v.length === item.tiles.length;
    case 'table': return Array.isArray(v) && v.every((x) => String(x).trim() !== '');
    case 'fill': return String(v == null ? '' : v).trim() !== '';
    case 'open': return String(v == null ? '' : v).trim().length >= 3;
    default: return false;
  }
}

export function normalize(x) {
  return String(x == null ? '' : x)
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!]+$/, '');
}

// Returns { got, max } plus type-specific detail. `open` items score 0 automatically
// and carry `manual: true` so the teacher page knows they need marking.
export function gradeItem(item, v) {
  switch (item.type) {
    case 'mc':
      return { got: v === item.correct ? item.points : 0, max: item.points };
    case 'fill': {
      const hit = item.accept.some((a) => normalize(a) === normalize(v));
      return { got: hit ? item.points : 0, max: item.points };
    }
    case 'table': {
      const blanks = tableBlanks(item);
      const cells = blanks.map((b, k) => Array.isArray(v) && normalize(v[k]) === normalize(b.answer));
      return { got: cells.filter(Boolean).length, max: blanks.length, cells };
    }
    case 'order': {
      const len = item.correctOrder.length;
      let hits = 0;
      item.correctOrder.forEach((tile, pos) => { if (Array.isArray(v) && v[pos] === tile) hits++; });
      const got = hits === len ? item.points : (hits >= orderPartialThreshold(len) ? 1 : 0);
      return { got, max: item.points, hits, of: len };
    }
    case 'open':
      return { got: 0, max: 0, manual: true, manualMax: item.manualMax || 0 };
    default:
      return { got: 0, max: 0 };
  }
}

export function statusOf(g) {
  if (g.manual) return 'manual';
  if (g.max > 0 && g.got === g.max) return 'full';
  return g.got > 0 ? 'part' : 'wrong';
}

export function manualMaxOf(test) {
  return test.items.reduce((s, it) => s + (it.type === 'open' ? (it.manualMax || 0) : 0), 0);
}

// Grade a whole test. `answers` is an object { [n]: answer }.
export function gradeTest(test, answers) {
  const sections = test.sections.map((s) => ({ id: s.id, got: 0, max: 0 }));
  const items = test.items.map((item) => {
    const v = sanitizeAnswer(item, answers ? answers[item.n] : undefined);
    const g = gradeItem(item, v);
    const sec = sections.find((s) => s.id === item.section);
    if (sec) { sec.got += g.got; sec.max += g.max; }
    return { n: item.n, section: item.section, type: item.type, answer: v, ...g, status: statusOf(g) };
  });
  const got = items.reduce((s, i) => s + i.got, 0);
  const max = items.reduce((s, i) => s + i.max, 0);
  return {
    got,
    max,
    pct: max ? Math.round((got / max) * 100) : 0,
    manualMax: manualMaxOf(test),
    sections,
    items,
    wrong: items.filter((i) => i.status === 'wrong' || i.status === 'part').map((i) => i.n),
  };
}

// ---- Human-readable answers (result page, teacher page, copy fallback) ----

export function describeAnswer(item, v, lang) {
  v = sanitizeAnswer(item, v);
  switch (item.type) {
    case 'mc': return v === null ? '—' : item.options[v][lang];
    case 'fill':
    case 'open': return String(v).trim() || '—';
    case 'order': return v.length ? v.map((k) => item.tiles[k][lang]).join(' → ') : '—';
    case 'table':
      return tableBlanks(item).map((b, k) =>
        `${item.rows[b.row].name[lang]} · ${item.columns[b.col][lang]} = ${v[k] || '?'}`).join('; ');
    default: return '';
  }
}

export function describeCorrect(item, lang) {
  switch (item.type) {
    case 'mc': return item.options[item.correct][lang];
    case 'fill': return item.accept[0];
    case 'order': return item.correctOrder.map((k) => item.tiles[k][lang]).join(' → ');
    case 'table':
      return tableBlanks(item).map((b) =>
        `${item.rows[b.row].name[lang]} · ${item.columns[b.col][lang]} = ${b.answer}`).join('; ');
    default: return '';
  }
}
