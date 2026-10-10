// Talking to the Google Apps Script web app.
//
// CORS: Apps Script never answers a CORS preflight (OPTIONS). A POST stays a
// "simple request" — no preflight — only with Content-Type text/plain, so we send
// JSON as text/plain and the script runs JSON.parse on e.postData.contents.
// Apps Script replies with a 302 to script.googleusercontent.com, which serves the
// body with Access-Control-Allow-Origin: *, so fetch() can follow it and read the
// JSON answer. That is why we do not need mode: 'no-cors' (which would hide the
// answer and with it any way of knowing whether the result arrived).

let configPromise = null;

export function loadConfig() {
  if (!configPromise) {
    configPromise = fetch('config.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((c) => ({ endpoint: (c.endpoint || '').trim(), token: (c.token || '').trim() }));
  }
  return configPromise;
}

export class ApiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

export async function call(endpoint, payload, timeoutMs = 20000) {
  if (!endpoint) throw new ApiError('not_configured');
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    });
  } catch (e) {
    throw new ApiError('network', e && e.message);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res.ok) throw new ApiError('http_' + res.status);
  let data;
  try { data = await res.json(); } catch (e) { throw new ApiError('bad_response'); }
  if (!data || data.ok !== true) throw new ApiError((data && data.error) || 'rejected');
  return data;
}
