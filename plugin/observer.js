import { createMapper, hooks } from './map.js';
import { createTransport } from './transport.js';
export function registerObserver(api) {
  if (api.registrationMode && api.registrationMode !== 'full') return;
  const config = api.pluginConfig ?? {};
  const map = createMapper(config);
  const transport = createTransport(config);
  for (const hook of hooks) api.on(hook, (event, ctx) => {
    // Return void even for gate/modify hooks. Observation must not affect the run.
    try { transport.emit(map(hook, event, ctx)); }
    catch { api.logger?.warn('Clawffice dropped an observation'); }
  });
  api.registerService({ id: 'clawffice-observer', start: () => transport.start(), stop: () => transport.stop() });
  api.lifecycle?.onDispose?.(() => transport.stop());
}
