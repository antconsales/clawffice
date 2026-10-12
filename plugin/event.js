const kinds = new Set(['session_start', 'before_agent_run', 'agent_end', 'before_tool_call',
  'after_tool_call', 'subagent_spawned', 'subagent_progress', 'subagent_ended']);
const outcomes = new Set(['success', 'error', 'timeout', 'killed', 'unknown', 'reset', 'deleted']);
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 256;

// Rebuild the wire object from an allowlist, including at the receiving boundary.
export function sanitizeEvent(input) {
  if (!input || input.v !== 1 || !text(input.id) || !kinds.has(input.kind)
      || !text(input.sessionKey) || typeof input.ts !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(input.ts)
      || !Number.isFinite(Date.parse(input.ts))) return null;
  const event = { v: 1, id: input.id, ts: input.ts, kind: input.kind, sessionKey: input.sessionKey };
  for (const key of ['agentId', 'runId', 'tool', 'name', 'role']) {
    if (text(input[key])) event[key] = input[key];
  }
  if (['started', 'ended'].includes(input.phase)) event.phase = input.phase;
  if (outcomes.has(input.outcome)) event.outcome = input.outcome;
  if (Number.isFinite(input.durationMs) && input.durationMs >= 0) event.durationMs = input.durationMs;
  if (event.kind === 'subagent_progress' && !event.phase) return null;
  if (['before_tool_call', 'after_tool_call'].includes(event.kind) && !event.tool) return null;
  return event;
}
