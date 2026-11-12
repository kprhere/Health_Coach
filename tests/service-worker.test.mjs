// ============================================================
// service-worker.test.mjs - the blank-screen-after-deploy bug.
// A stale page asked for a removed bundle, the host answered with
// the HTML page, and the v1 worker cached that HTML as the script.
// These run public/sw.js against an in-memory cache and network.
// ============================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://coach.test';

function harness({ network }) {
  const store = new Map(); // cacheName -> Map(url -> Response)
  const urlOf = (req) => new URL(typeof req === 'string' ? req : req.url, ORIGIN + '/').href;
  const cacheFor = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      put: async (req, res) => { m.set(urlOf(req), res); },
      match: async (req) => m.get(urlOf(req)),
      addAll: async () => {},
    };
  };
  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...store.keys()],
    delete: async (name) => store.delete(name),
    match: async (req) => {
      for (const m of store.values()) { const hit = m.get(urlOf(req)); if (hit) return hit; }
      return undefined;
    },
  };
  const calls = [];
  const fetchFn = async (req, init) => { calls.push({ url: urlOf(req), init }); return network(urlOf(req)); };
  const handlers = {};
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => {} },
  };
  new Function('self', 'caches', 'fetch', 'Response', SOURCE)(self, caches, fetchFn, Response);

  const dispatch = async (request) => {
    let responded = null;
    handlers.fetch({ request, respondWith: (p) => { responded = p; } });
    const res = await responded;
    await new Promise((r) => setTimeout(r, 0)); // let background cache writes settle
    return res;
  };
  return { store, caches, calls, dispatch, handlers };
}

const html = () => new Response('<!doctype html><div id="root"></div>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
const js = () => new Response('console.log(1)', { status: 200, headers: { 'content-type': 'application/javascript' } });
const scriptRequest = (path) => ({ method: 'GET', mode: 'cors', url: ORIGIN + path });
const pageRequest = () => ({ method: 'GET', mode: 'navigate', url: ORIGIN + '/' });

test('an HTML answer for a script is never cached', async () => {
  const h = harness({ network: () => html() });
  const res = await h.dispatch(scriptRequest('/assets/index-OLD.js'));
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal(await h.caches.match(ORIGIN + '/assets/index-OLD.js'), undefined);
});

test('a poisoned HTML entry left by v1 is ignored and replaced by the real script', async () => {
  const h = harness({ network: () => js() });
  const poisoned = await h.caches.open('recomp-os-v2');
  await poisoned.put(ORIGIN + '/assets/index-NEW.js', html());
  const res = await h.dispatch(scriptRequest('/assets/index-NEW.js'));
  assert.equal(res.headers.get('content-type'), 'application/javascript');
  const stored = await h.caches.match(ORIGIN + '/assets/index-NEW.js');
  assert.equal(stored.headers.get('content-type'), 'application/javascript');
});

test('a good script is cached and served from cache next time', async () => {
  let hits = 0;
  const h = harness({ network: () => { hits += 1; return js(); } });
  await h.dispatch(scriptRequest('/assets/index-A.js'));
  const again = await h.dispatch(scriptRequest('/assets/index-A.js'));
  assert.equal(again.headers.get('content-type'), 'application/javascript');
  assert.ok(hits >= 1);
});

test('pages bypass the HTTP cache and fall back to the cached shell offline', async () => {
  let online = true;
  const h = harness({ network: () => { if (!online) throw new TypeError('offline'); return html(); } });
  await h.dispatch(pageRequest());
  assert.equal(h.calls[0].init && h.calls[0].init.cache, 'no-store');
  online = false;
  const offline = await h.dispatch(pageRequest());
  assert.match(offline.headers.get('content-type'), /text\/html/);
});

test('activating v2 deletes the v1 cache', async () => {
  const h = harness({ network: () => js() });
  await h.caches.open('recomp-os-v1');
  let done = null;
  h.handlers.activate({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual(await h.caches.keys(), []);
});
