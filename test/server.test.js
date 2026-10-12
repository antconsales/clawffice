import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createHub } from '../src/server.js';
import { loadReplay, replay } from '../src/replay.js';
const receive = async (ws) => JSON.parse((await once(ws, 'message'))[0]);
async function setup(t, options) {
  const hub = createHub(options); const address = await hub.listen(0);
  t.after(() => hub.close());
  const url = `http://127.0.0.1:${address.port}`;
  return { hub, url, socket: (path) => {
    const ws = new WebSocket(url.replace('http', 'ws') + path);
    t.after(() => ws.terminate()); return ws;
  } };
}
test('loopback HTTP serves page and reference asset, never repo files', async (t) => {
  const { hub, url } = await setup(t);
  assert.equal(hub.server.address().address, '127.0.0.1');
  const page = await fetch(url); assert.equal(page.status, 200); assert.match(await page.text(), /Clawffice/);
  const image = await fetch(`${url}/assets/riferimento-ufficio.webp`);
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/webp');
  for (const path of ['/package.json', '/.env', '/LICENSE']) assert.equal((await fetch(url + path)).status, 404);
});
test('hello contains complete snapshot; plugin events produce increments', async (t) => {
  const { socket, hub } = await setup(t); const viewer = socket('/ws');
  const hello = await receive(viewer); assert.equal(hello.type, 'hello'); assert.deepEqual(hello.agents, []);
  const producer = socket('/ingest'); await once(producer, 'open');
  const ready = receive(producer);
  producer.send(JSON.stringify({ v: 1, type: 'identify', instanceId: 'home' }));
  assert.equal((await ready).type, 'ready');
  const updated = new Promise((resolve) => viewer.on('message', (bytes) => {
    const message = JSON.parse(bytes);
    if (message.type === 'update' && message.patch.agents.length) resolve(message);
  }));
  producer.send(JSON.stringify({ v: 1, type: 'event', event: { v: 1, id: 'e1', ts: new Date().toISOString(), kind: 'before_tool_call', sessionKey: 's1', tool: 'exec', params: { private: 'PRIVATE' } } }));
  const delta = await updated; assert.equal(delta.patch.agents[0].state, 'working');
  assert.equal(JSON.stringify(delta).includes('PRIVATE'), false);
  const next = socket('/ws'); const snapshot = await receive(next);
  assert.deepEqual(snapshot.agents, hub.store.snapshot().agents);
  const denied = receive(next); next.send(JSON.stringify({ type: 'event' }));
  assert.equal((await denied).code, 'read_only');
  const invalid = receive(producer); producer.send('{'); assert.equal((await invalid).code, 'invalid_json');
});
test('demo rejects producers and foreign browser origins are denied', async (t) => {
  const { url } = await setup(t, { mode: 'demo' });
  for (const [path, options] of [['/ingest', {}], ['/ws', { origin: 'https://foreign.example' }]]) {
    const ws = new WebSocket(url.replace('http', 'ws') + path, options);
    const [error] = await once(ws, 'error'); assert.match(error.message, /403/);
  }
});
test('fixture replay uses production reducer in deterministic time order', async (t) => {
  const { hub } = await setup(t, { mode: 'demo' });
  const entries = await loadReplay(); const scheduled = [];
  const stop = replay(hub, entries, { schedule: (callback, atMs) => { scheduled.push({ callback, atMs }); return atMs; }, cancel: () => {}, now: () => Date.parse('2026-10-13T00:00:00Z') });
  scheduled.sort((a, b) => a.atMs - b.atMs).forEach(({ callback }) => callback());
  assert.deepEqual(hub.store.snapshot().agents.map((a) => a.state), ['done', 'error']);
  assert.ok(hub.store.snapshot().agents.every((a) => a.lastEvent.source === 'demo'));
  stop();
});
test('real producer disconnect invalidates work; identifying again does not revive it', async (t) => {
  const { hub, socket } = await setup(t);
  const producer = socket('/ingest'); await once(producer, 'open');
  let ready = receive(producer);
  producer.send(JSON.stringify({ v: 1, type: 'identify', instanceId: 'home' })); await ready;
  // Apply an observation through the same hub path, then inspect actual socket presence.
  hub.apply('home', { v: 1, id: 'e1', ts: new Date().toISOString(), kind: 'before_agent_run', sessionKey: 's1', runId: 'old' });
  const viewer = socket('/ws'); await receive(viewer);
  const disconnected = new Promise((resolve) => viewer.on('message', (bytes) => {
    const message = JSON.parse(bytes);
    if (message.type === 'update' && message.patch.agents[0]?.state === 'unknown') resolve();
  }));
  producer.close(); await disconnected;
  const replacement = socket('/ingest'); await once(replacement, 'open');
  ready = receive(replacement);
  replacement.send(JSON.stringify({ v: 1, type: 'identify', instanceId: 'home' })); await ready;
  assert.equal(hub.store.snapshot().instances[0].status, 'connected');
  assert.equal(hub.store.snapshot().agents[0].state, 'unknown');
});
