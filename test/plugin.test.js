import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createMapper } from '../plugin/map.js';
import { registerObserver } from '../plugin/observer.js';
import { createTransport } from '../plugin/transport.js';
import { createHub } from '../src/server.js';
test('mapping excludes payloads and correlates official child target identity', () => {
  const map = createMapper({ agents: { dev: { name: 'Dev', role: 'Development' } } });
  const child = map('subagent_spawned', { childSessionKey: 'child', agentId: 'dev', runId: 'r1', label: 'PRIVATE' }, { requesterSessionKey: 'parent' });
  assert.equal(child.sessionKey, 'child'); assert.equal(child.name, 'Dev');
  const ended = map('subagent_ended', { targetSessionKey: 'child', outcome: 'ok', error: 'PRIVATE' });
  assert.equal(ended.agentId, 'dev'); assert.equal(ended.outcome, 'success');
  const clean = map('after_tool_call', { toolName: 'exec', params: { private: 'PRIVATE' }, result: 'PRIVATE', error: 'PRIVATE' }, { sessionKey: 'child' });
  assert.equal(clean.outcome, 'error'); assert.equal(JSON.stringify(clean).includes('PRIVATE'), false);
  assert.equal(map('agent_end', { success: true }, {}), null);
  assert.equal(map('subagent_progress', { phase: 'started' }, { requesterSessionKey: 'parent' }), null);
  assert.equal(map('agent_end', { runId: 'r1', success: true }).sessionKey, 'child');
});
test('official registrations are passive, discovery creates no service', () => {
  const hooks = new Map(); let service;
  const api = { pluginConfig: { instanceId: 'test' }, on: (name, handler) => hooks.set(name, handler), registerService: (value) => { service = value; } };
  registerObserver({ ...api, registrationMode: 'discovery' }); assert.equal(hooks.size, 0);
  registerObserver(api);
  assert.equal(hooks.size, 8); assert.equal(service.id, 'clawffice-observer');
  assert.equal(hooks.get('before_agent_run')({ prompt: 'PRIVATE' }, { sessionKey: 's1' }), undefined);
  assert.equal(hooks.get('before_tool_call')({ toolName: 'exec', params: {} }, { sessionKey: 's1' }), undefined);
  service.stop();
});
test('transport uses actual WebSocket and failure never throws into handlers', async (t) => {
  const hub = createHub(); const address = await hub.listen(0); t.after(() => hub.close());
  const viewer = new WebSocket(`ws://127.0.0.1:${address.port}/ws`); t.after(() => viewer.terminate());
  await once(viewer, 'message');
  const transport = createTransport({ instanceId: 'test', hubUrl: `ws://127.0.0.1:${address.port}/ingest` });
  t.after(() => transport.stop());
  const updates = [];
  const received = new Promise((resolve) => viewer.on('message', (bytes) => {
    const message = JSON.parse(bytes); updates.push(message);
    if (message.type === 'update' && message.patch.agents.length) resolve(message);
  }));
  transport.start();
  transport.emit(createMapper()('before_tool_call', { toolName: 'exec' }, { agentId: 'dev', sessionKey: 's1' }));
  const result = await received;
  assert.equal(result.patch.agents[0].tool, 'exec');
  transport.stop();
  assert.doesNotThrow(() => transport.emit({}));
  assert.throws(() => createTransport({ instanceId: 'x', hubUrl: 'ws://example.com/ingest' }));
});
test('bounded disconnected queue drops oldest and discards stale observations on loss', async (t) => {
  const { EventEmitter } = await import('node:events');
  class Socket extends EventEmitter {
    readyState = WebSocket.OPEN;
    bufferedAmount = 0;
    sent = [];
    send(message) { this.sent.push(JSON.parse(message)); }
    terminate() { this.emit('close'); }
  }
  const socket = new Socket();
  const transport = createTransport({ instanceId: 'test', makeSocket: () => socket });
  t.after(() => transport.stop());
  transport.start();
  for (let i = 0; i < 300; i++) transport.emit({ id: String(i) });
  socket.emit('message', Buffer.from('{"v":1,"type":"ready"}'));
  assert.equal(socket.sent.length, 256); assert.equal(socket.sent[0].event.id, '44');
  socket.emit('close');
  socket.emit('message', Buffer.from('{"v":1,"type":"ready"}'));
  assert.equal(socket.sent.length, 256);
});
