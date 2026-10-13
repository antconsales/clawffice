import { sanitizeEvent } from '../plugin/event.js';
export { sanitizeEvent } from '../plugin/event.js';

export function createStore({ now = Date.now, staleMs = 45_000 } = {}) {
  const agents = new Map();
  const instances = new Map();
  const seen = new Set();
  function snapshot() {
    return structuredClone({ instances: [...instances.values()], agents: [...agents.values()] });
  }
  function presence(instanceId, status) {
    instances.set(instanceId, { instanceId, status, since: new Date(now()).toISOString() });
    const changed = [];
    if (status === 'disconnected') {
      for (const agent of agents.values()) {
        if (agent.instanceId === instanceId) {
          agent.state = 'unknown';
          agent.tool = null;
          agent.activeRuns = [];
          changed.push(structuredClone(agent));
        }
      }
    }
    return { instances: [structuredClone(instances.get(instanceId))], agents: changed };
  }
  function apply(instanceId, input, source = 'hook') {
    const event = sanitizeEvent(input);
    if (!event) return null;
    const dedupId = JSON.stringify([instanceId, event.id]);
    if (seen.has(dedupId)) return null;
    seen.add(dedupId);
    if (seen.size > 2048) seen.delete(seen.values().next().value);
    const key = JSON.stringify([instanceId, event.sessionKey]);
    let agent = agents.get(key);
    if (!agent) {
      if (agents.size >= 256) return null;
      agent = { key, instanceId, sessionKey: event.sessionKey, agentId: event.agentId ?? null,
        name: event.name ?? event.agentId ?? event.sessionKey, role: event.role ?? null,
        state: 'unknown', tool: null, lastEvent: null, actions: [],
        capabilities: { tool: false, subagent: false, percentage: false }, activeRuns: [] };
      agents.set(key, agent);
    }
    if (event.name) agent.name = event.name;
    if (event.role) agent.role = event.role;
    if (event.agentId) agent.agentId = event.agentId;
    const started = event.kind === 'before_agent_run' || event.kind === 'before_tool_call'
      || event.kind === 'subagent_spawned' || (event.kind === 'subagent_progress' && event.phase === 'started');
    const ended = event.kind === 'agent_end' || event.kind === 'subagent_ended'
      || (event.kind === 'subagent_progress' && event.phase === 'ended');
    if (started && event.runId && !agent.activeRuns.includes(event.runId) && agent.activeRuns.length >= 256) return null;
    if (started) {
      agent.state = 'working';
      if (event.runId && !agent.activeRuns.includes(event.runId)) agent.activeRuns.push(event.runId);
    }
    if (ended) {
      if (event.runId) agent.activeRuns = agent.activeRuns.filter((id) => id !== event.runId);
      else agent.activeRuns = [];
      agent.state = agent.activeRuns.length ? 'working'
        : event.outcome === 'success' ? 'done'
          : ['error', 'timeout', 'killed'].includes(event.outcome) ? 'error' : 'unknown';
      agent.tool = null;
    }
    if (event.kind === 'before_tool_call') {
      agent.capabilities.tool = true;
      agent.tool = event.tool;
    }
    if (event.kind === 'after_tool_call') {
      agent.capabilities.tool = true;
      agent.tool = null;
      // Completion of a tool is not completion of the agent's whole task.
      if (event.outcome === 'error') agent.state = 'error';
    }
    if (event.kind.startsWith('subagent_')) agent.capabilities.subagent = true;
    agent.lastEvent = { ...event, source, receivedAt: new Date(now()).toISOString() };
    agent.actions = [agent.lastEvent, ...agent.actions].slice(0, 10);
    return { agents: [structuredClone(agent)], instances: [] };
  }
  function expire() {
    const changed = [];
    for (const agent of agents.values()) {
      if (agent.state === 'working' && now() - Date.parse(agent.lastEvent.receivedAt) >= staleMs) {
        agent.state = 'unknown';
        agent.tool = null;
        agent.activeRuns = [];
        changed.push(structuredClone(agent));
      }
    }
    return { agents: changed, instances: [] };
  }
  return { snapshot, presence, apply, expire };
}
