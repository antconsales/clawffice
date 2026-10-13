import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { createStore } from './store.js';

const root = new URL('../', import.meta.url);
const files = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['web/style.css', 'text/css; charset=utf-8']],
  ['/assets/riferimento-ufficio.webp', ['assets/riferimento-ufficio.webp', 'image/webp']],
]);

export function createHub({ mode = 'live', store = createStore(), heartbeatMs = 15_000 } = {}) {
  const viewers = new Set();
  const producers = new Map();
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const server = createServer(async (req, res) => {
    const file = files.get(req.url);
    if (req.method !== 'GET' || !file) { res.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(new URL(file[0], root));
      res.writeHead(200, { 'Content-Type': file[1], 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'" }).end(body);
    } catch { res.writeHead(500).end('Asset unavailable'); }
  });
  function send(ws, message) {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 64 * 1024) { ws.terminate(); return; }
    ws.send(JSON.stringify({ v: 1, ...message }));
  }
  function broadcast(message) { for (const ws of viewers) send(ws, message); }
  function update(patch) {
    if (patch && (patch.agents.length || patch.instances.length)) broadcast({ type: 'update', patch });
  }
  function presence(instanceId, status) {
    const patch = store.presence(instanceId, status);
    broadcast({ type: 'presence', instanceId, status, since: patch.instances[0].since });
    update(patch);
  }
  function apply(instanceId, event, source = 'hook') {
    const patch = store.apply(instanceId, event, source);
    update(patch);
    return Boolean(patch);
  }
  server.on('upgrade', (req, socket, head) => {
    const path = req.url;
    const origin = req.headers.origin;
    const expected = `http://${req.headers.host}`;
    const host = req.headers.host ?? '';
    const localHost = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host);
    if (!localHost || (origin && origin !== expected) || !['/ws', '/ingest'].includes(path)
      || (path === '/ingest' && (mode === 'demo' || origin))) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      ws.alive = true;
      ws.on('pong', () => { ws.alive = true; });
      ws.on('error', () => {});
      if (path === '/ws') {
        viewers.add(ws);
        send(ws, { type: 'hello', mode, serverTime: new Date().toISOString(), ...store.snapshot() });
        ws.on('message', () => { send(ws, { type: 'error', code: 'read_only' }); });
        ws.on('close', () => viewers.delete(ws));
        return;
      }
      let instanceId;
      const identifyTimer = setTimeout(() => ws.close(1008, 'Identify required'), 2000);
      identifyTimer.unref();
      ws.on('message', (bytes) => {
        let message;
        try { message = JSON.parse(bytes.toString()); } catch {
          send(ws, { type: 'error', code: 'invalid_json' }); return;
        }
        if (!message || message.v !== 1) { send(ws, { type: 'error', code: 'invalid_version' }); return; }
        if (!instanceId) {
          if (message.type !== 'identify' || typeof message.instanceId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(message.instanceId ?? '')
            || producers.has(message.instanceId) || producers.size >= 16) {
            ws.close(1008, 'Invalid or duplicate identity'); return;
          }
          instanceId = message.instanceId;
          clearTimeout(identifyTimer);
          producers.set(instanceId, ws);
          presence(instanceId, 'connected');
          send(ws, { type: 'ready' });
        } else if (message.type !== 'event' || !apply(instanceId, message.event)) {
          send(ws, { type: 'error', code: 'invalid_or_duplicate_event' });
        }
      });
      ws.on('close', () => {
        clearTimeout(identifyTimer);
        if (instanceId && producers.get(instanceId) === ws) {
          producers.delete(instanceId);
          presence(instanceId, 'disconnected');
        }
      });
    });
  });
  const heartbeat = setInterval(() => {
    for (const ws of sockets.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
    update(store.expire());
  }, heartbeatMs);
  heartbeat.unref();
  return {
    server, store, apply, presence,
    async listen(port = 8787) {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(); });
      });
      return server.address();
    },
    async close() {
      clearInterval(heartbeat);
      for (const ws of sockets.clients) ws.terminate();
      await new Promise((resolve) => sockets.close(resolve));
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
