// Send queue for finished tests. A result enters the outbox before the first send
// attempt and only leaves it once the server has confirmed it, so a dead network,
// a closed tab or a broken endpoint never loses a result. Retries back off from
// 5 s to 5 min and restart immediately when the device comes back online.

import * as store from './store.js';
import { call, loadConfig } from './api.js';

const OUTBOX = 'ta.outbox.v1';
const SENT = 'ta.sent.v1';
const BACKOFF = [5, 15, 30, 60, 120, 300];
// Errors that more retries cannot fix until someone changes config.json or the script.
const PERMANENT = ['bad_token', 'invalid', 'not_configured', 'unknown_test'];

const listeners = new Set();
let timer = null;
let flushing = false;

export function pending() { return store.get(OUTBOX, []); }
export function sent() { return store.get(SENT, []); }

export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => { try { fn(); } catch (e) { /* keep others running */ } }); }

export function enqueue(submission) {
  const list = pending().filter((x) => x.sid !== submission.sid);
  list.push({ sid: submission.sid, submission, tries: 0, nextAt: 0, error: null, sending: false });
  store.set(OUTBOX, list);
  emit();
  flush();
}

// 'sent' | 'sending' | 'queued' | 'retrying' | 'rejected' | 'unknown'
export function statusOf(sid) {
  const s = sent().find((x) => x.sid === sid);
  if (s) return { state: 'sent', at: s.at };
  const p = pending().find((x) => x.sid === sid);
  if (!p) return { state: 'unknown' };
  if (flushing && p.sending) return { state: 'sending' };
  if (p.error && PERMANENT.indexOf(p.error) >= 0) return { state: 'rejected', error: p.error };
  if (p.tries > 0) return { state: 'retrying', error: p.error, nextAt: p.nextAt };
  return { state: 'queued' };
}

function markSent(entry) {
  const list = sent().filter((x) => x.sid !== entry.sid);
  const s = entry.submission;
  list.unshift({ sid: entry.sid, testId: s.testId, name: s.name, at: new Date().toISOString() });
  store.set(SENT, list.slice(0, 60));
  store.set(OUTBOX, pending().filter((x) => x.sid !== entry.sid));
}

function update(sid, patch) {
  store.set(OUTBOX, pending().map((x) => (x.sid === sid ? Object.assign({}, x, patch) : x)));
}

export async function flush(force) {
  if (flushing) return;
  flushing = true;
  clearTimeout(timer);
  try {
    const config = await loadConfig();
    const now = Date.now();
    for (const entry of pending()) {
      if (!force && entry.nextAt > now) continue;
      update(entry.sid, { sending: true });
      emit();
      try {
        await call(config.endpoint, { action: 'submit', token: config.token, submission: entry.submission });
        markSent(entry);
      } catch (e) {
        const tries = entry.tries + 1;
        const wait = BACKOFF[Math.min(tries - 1, BACKOFF.length - 1)] * 1000;
        update(entry.sid, { sending: false, tries, error: e.code || 'network', nextAt: Date.now() + wait });
      }
      emit();
    }
  } finally {
    flushing = false;
    schedule();
    emit();
  }
}

function schedule() {
  clearTimeout(timer);
  const list = pending();
  if (!list.length) return;
  const next = Math.min.apply(null, list.map((x) => x.nextAt || 0));
  timer = setTimeout(flush, Math.max(1000, next - Date.now()));
}

export function start() {
  // Clear "sending" flags left over from a tab that was closed mid-request.
  store.set(OUTBOX, pending().map((x) => Object.assign({}, x, { sending: false, nextAt: 0 })));
  window.addEventListener('online', () => flush(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flush(true);
  });
  flush(true);
}
