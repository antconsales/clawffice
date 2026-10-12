import WebSocket from 'ws';
export function createTransport({ hubUrl = 'ws://127.0.0.1:8787/ingest', instanceId,
  makeSocket = (url) => new WebSocket(url, { handshakeTimeout: 2000, maxPayload: 16 * 1024 }) }) {
  const url = new URL(hubUrl);
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || url.pathname !== '/ingest'
    || url.username || url.password || url.search || url.hash) throw new Error('hubUrl must use ws://127.0.0.1:<port>/ingest');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instanceId ?? '')) throw new Error('Invalid instanceId');
  let socket;
  let retry;
  let ready = false;
  let running = false;
  let delay = 1000;
  let drainTimer;
  let watchdog;
  const queue = [];
  function flush() {
    while (ready && queue.length && socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 64 * 1024) {
      socket.send(JSON.stringify({ v: 1, type: 'event', event: queue.shift() }));
    }
  }
  function connect() {
    if (!running) return;
    const connection = makeSocket(hubUrl);
    socket = connection;
    function armWatchdog(ms) {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => connection.terminate(), ms);
      watchdog.unref();
    }
    armWatchdog(4000);
    connection.on('ping', () => armWatchdog(45_000));
    connection.on('open', () => connection.send(JSON.stringify({ v: 1, type: 'identify', instanceId })));
    connection.on('message', (bytes) => {
      try {
        const message = JSON.parse(bytes.toString());
        if (message.v === 1 && message.type === 'ready') { ready = true; delay = 1000; armWatchdog(45_000); flush(); }
      } catch { /* Hub messages contain no data needed by the agent. */ }
    });
    connection.on('error', () => {});
    connection.on('close', () => {
      clearTimeout(watchdog);
      ready = false;
      queue.length = 0;
      if (running) {
        retry = setTimeout(connect, delay);
        retry.unref();
        delay = Math.min(delay * 2, 15_000);
      }
    });
  }
  return {
    start() {
      if (running) return;
      running = true;
      connect();
      drainTimer = setInterval(flush, 100);
      drainTimer.unref();
    },
    emit(event) {
      if (!running || !event) return;
      if (queue.length === 256) queue.shift();
      queue.push(event);
      flush();
    },
    stop() {
      running = false;
      ready = false;
      clearTimeout(retry);
      clearTimeout(watchdog);
      clearInterval(drainTimer);
      queue.length = 0;
      socket?.terminate();
      socket = undefined;
    },
  };
}
