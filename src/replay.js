import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
export async function loadReplay() {
  return JSON.parse(await readFile(new URL('../demo/events.json', import.meta.url), 'utf8'));
}
export function replay(hub, entries, { schedule = setTimeout, cancel = clearTimeout, now = Date.now } = {}) {
  hub.presence('demo', 'connected');
  const timers = entries.map(({ atMs, event }) => schedule(() => {
    hub.apply('demo', { ...event, v: 1, id: randomUUID(), ts: new Date(now()).toISOString() }, 'demo');
  }, atMs));
  return () => timers.forEach(cancel);
}
