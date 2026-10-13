import { createHub } from './server.js';
import { loadReplay, replay } from './replay.js';
const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const mode = process.argv.includes('--demo') ? 'demo' : 'live';
const hub = createHub({ mode });
await hub.listen(port);
console.log(`Clawffice (${mode}) http://127.0.0.1:${port}`);
const stopReplay = mode === 'demo' ? replay(hub, await loadReplay()) : () => {};
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
  if (closing) return;
  closing = true;
  stopReplay();
  await hub.close();
});
