import { randomUUID } from 'node:crypto';
import { sanitizeEvent } from './event.js';
export const hooks = ['session_start', 'before_agent_run', 'agent_end', 'before_tool_call',
  'after_tool_call', 'subagent_spawned', 'subagent_progress', 'subagent_ended'];
const outcome = (value) => value === 'ok' ? 'success' : value;
export function createMapper({ agents = {} } = {}) {
  const sessions = new Map();
  const runs = new Map();
  function remember(map, key, value) {
    if (!key) return;
    map.set(key, value);
    if (map.size > 1024) map.delete(map.keys().next().value);
  }
  return (kind, event, ctx = {}) => {
    const child = kind.startsWith('subagent_');
    // Child identity must never fall back to the requester's (parent's) session.
    const explicitSession = child
      ? event.childSessionKey ?? event.targetSessionKey ?? ctx.childSessionKey
      : ctx.sessionKey ?? event.sessionKey ?? ((ctx.sessionId ?? event.sessionId) ? `session:${ctx.sessionId ?? event.sessionId}` : undefined);
    const runId = event.runId ?? ctx.runId;
    const sessionKey = explicitSession ?? runs.get(runId)?.sessionKey;
    if (!sessionKey) return null;
    const agentId = (child ? event.agentId : ctx.agentId)
      ?? sessions.get(sessionKey)?.agentId ?? runs.get(runId)?.agentId;
    remember(sessions, sessionKey, { agentId });
    remember(runs, runId, { sessionKey, agentId });
    const display = agentId && Object.hasOwn(agents, agentId) ? agents[agentId] : {};
    const mapped = { v: 1, id: randomUUID(), ts: new Date().toISOString(), kind, sessionKey,
      agentId, runId, name: display.name, role: display.role };
    if (kind === 'agent_end') mapped.outcome = event.success === true ? 'success'
      : event.success === false ? 'error' : 'unknown';
    if (kind === 'before_tool_call' || kind === 'after_tool_call') {
      mapped.tool = event.toolName;
      if (kind === 'after_tool_call') mapped.outcome = event.error !== undefined ? 'error' : 'success';
    }
    if (child) { mapped.phase = event.phase; mapped.outcome = outcome(event.outcome); }
    mapped.durationMs = event.durationMs;
    return sanitizeEvent(mapped);
  };
}
