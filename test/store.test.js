import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, sanitizeEvent } from '../src/store.js';
const event = (kind, extra = {}) => ({ v: 1, id: crypto.randomUUID(), ts: new Date().toISOString(), sessionKey: 'session-a', kind, ...extra });
test('receiver strips conversation content and rejects invalid events', () => {
  const clean = sanitizeEvent(event('after_tool_call', { tool: 'exec', params: { secret: 'PRIVATE' }, result: 'PRIVATE', error: 'PRIVATE', messages: ['PRIVATE'] }));
  assert.equal(JSON.stringify(clean).includes('PRIVATE'), false);
  assert.equal(sanitizeEvent(event('invented')), null);
  assert.equal(sanitizeEvent(event('subagent_progress')), null);
  assert.equal(sanitizeEvent(event('before_tool_call')), null);
});
test('session start is not a turn start; task success requires agent completion', () => {
  const store = createStore();
  store.apply('home', event('session_start'));
  assert.equal(store.snapshot().agents[0].state, 'unknown');
  store.apply('home', event('before_agent_run', { runId: 'r1' }));
  store.apply('home', event('after_tool_call', { tool: 'exec', outcome: 'success' }));
  assert.equal(store.snapshot().agents[0].state, 'working');
  store.apply('home', event('agent_end', { runId: 'r1', outcome: 'success' }));
  assert.equal(store.snapshot().agents[0].state, 'done');
});
test('dedup, bounded recent actions and snapshot isolation', () => {
  const store = createStore(); const input = event('session_start');
  assert.ok(store.apply('home', input)); assert.equal(store.apply('home', input), null);
  for (let i = 0; i < 20; i++) store.apply('home', event('session_start'));
  assert.equal(store.snapshot().agents[0].actions.length, 10);
  store.snapshot().agents[0].name = 'mutated';
  assert.notEqual(store.snapshot().agents[0].name, 'mutated');
});
test('concurrent sessions and instances are independent', () => {
  const store = createStore();
  store.apply('a', event('before_agent_run', { agentId: 'dev', runId: 'one' }));
  store.apply('a', event('before_agent_run', { agentId: 'dev', sessionKey: 'session-b', runId: 'two' }));
  store.apply('b', event('before_agent_run', { agentId: 'dev', runId: 'three' }));
  store.apply('a', event('agent_end', { runId: 'one', outcome: 'error' }));
  assert.deepEqual(store.snapshot().agents.map((a) => a.state), ['error', 'working', 'working']);
});
test('disconnect and timeout cannot revive stale activity on reconnect', () => {
  let now = Date.now(); const store = createStore({ now: () => now });
  store.apply('a', event('before_agent_run', { runId: 'old' }));
  store.presence('a', 'disconnected'); store.presence('a', 'connected');
  assert.equal(store.snapshot().agents[0].state, 'unknown');
  store.apply('a', event('before_agent_run', { runId: 'new' }));
  store.apply('a', event('agent_end', { runId: 'new', outcome: 'success' }));
  assert.equal(store.snapshot().agents[0].state, 'done');
  store.apply('a', event('before_agent_run', { runId: 'next' }));
  now += 45_000; assert.equal(store.expire().agents[0].state, 'unknown');
});
