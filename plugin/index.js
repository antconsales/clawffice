import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import { registerObserver } from './observer.js';
export default definePluginEntry({
  id: 'clawffice', name: 'Clawffice observer',
  description: 'Observe official agent, tool and subagent hooks',
  register: registerObserver,
});
