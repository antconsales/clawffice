const agents = new Map();
const badges = new Map();
const instances = new Map();
const labels = { working: ['⚙ Working', '#ffb03a'], done: ['✓ Done', '#4fd08a'], error: ['✕ Error', '#e5544b'], unknown: ['? Unknown', '#6c7a89'] };
const $ = (id) => document.getElementById(id);
let selected;
let socket;
let retry;
function describe(event) {
  if (!event) return 'No observation';
  const messages = { session_start: 'Session opened', before_agent_run: 'Activity started',
    agent_end: event.outcome === 'success' ? 'Activity finished ✓' : `Activity ended: ${event.outcome ?? 'unknown'}`,
    before_tool_call: `Using ${event.tool}`, after_tool_call: `${event.tool}: ${event.outcome ?? 'unknown'}`,
    subagent_spawned: 'Subagent created', subagent_progress: `Subagent ${event.phase}: ${event.outcome ?? 'observed'}`,
    subagent_ended: `Subagent ended: ${event.outcome ?? 'unknown'}` };
  return messages[event.kind] ?? event.kind;
}
function renderCard() {
  const agent = agents.get(selected);
  if (!agent) return;
  $('card').hidden = false;
  $('name').textContent = agent.name;
  $('details').replaceChildren();
  const fields = { Role: agent.role ?? 'Non disponibile', Status: labels[agent.state][0],
    Instance: agent.instanceId, Agent: agent.agentId ?? 'Non disponibile', Session: agent.sessionKey,
    'Current tool': agent.tool ?? 'Non disponibile',
    'Last event': `${describe(agent.lastEvent)} · ${agent.lastEvent?.ts ?? 'Non disponibile'}`,
    'Tool observations': agent.capabilities.tool ? 'Observed' : 'Non disponibile',
    'Subagent observations': agent.capabilities.subagent ? 'Observed' : 'Non disponibile',
    'Progress percentage': 'Non disponibile' };
  for (const [label, value] of Object.entries(fields)) {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = value;
    $('details').append(dt, dd);
  }
  $('actions').replaceChildren(...agent.actions.map((event) => {
    const li = document.createElement('li');
    li.textContent = `${new Date(event.ts).toLocaleTimeString()} — ${describe(event)}`;
    return li;
  }));
}
function upsert(agent) {
  const previous = agents.get(agent.key);
  agents.set(agent.key, agent);
  let badge = badges.get(agent.key);
  if (!badge) {
    badge = document.createElement('button'); badge.className = 'agent';
    badge.addEventListener('click', () => { selected = agent.key; renderCard(); $('close').focus(); });
    badges.set(agent.key, badge); $('agents').append(badge);
  }
  const [label, color] = labels[agent.state];
  badge.style.setProperty('--state', color);
  const name = document.createElement('strong'); name.textContent = agent.name;
  const status = document.createElement('small'); status.textContent = label;
  badge.replaceChildren(name, status);
  if (agent.lastEvent && previous?.lastEvent?.id !== agent.lastEvent.id) {
    const bubble = document.createElement('span'); bubble.className = 'bubble'; bubble.textContent = describe(agent.lastEvent);
    badge.append(bubble); setTimeout(() => bubble.remove(), 5000);
  }
  $('empty').hidden = agents.size > 0;
  if (selected === agent.key) renderCard();
}
function renderSources(records) {
  records.forEach((record) => instances.set(record.instanceId, record));
  const connected = [...instances.values()].filter((record) => record.status === 'connected').length;
  $('sources').textContent = `${connected} source(s) connected · ${instances.size - connected} disconnected`;
}
function closeCard() { $('card').hidden = true; badges.get(selected)?.focus(); selected = undefined; }
$('close').addEventListener('click', closeCard);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCard(); });
function connect() {
  socket = new WebSocket(`ws://${location.host}/ws`);
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.v !== 1) return;
    if (message.type === 'hello') {
      agents.clear(); badges.clear(); instances.clear(); $('agents').replaceChildren(); closeCard();
      $('mode').textContent = message.mode === 'demo' ? 'DEMO — simulated events' : 'LIVE';
      $('demo-note').textContent = message.mode === 'demo' ? 'Replay uses synthetic fixtures, not real OpenClaw work.' : '';
      $('connection').textContent = 'Hub connected';
      renderSources(message.instances);
      message.agents.forEach(upsert);
      $('empty').hidden = agents.size > 0;
    }
    if (message.type === 'update') {
      renderSources(message.patch.instances);
      message.patch.agents.forEach(upsert);
    }
  });
  socket.addEventListener('close', () => {
    $('connection').textContent = 'Hub disconnected · reconnecting…';
    $('sources').textContent = 'Source connection unknown';
    for (const agent of agents.values()) upsert({ ...agent, state: 'unknown', tool: null });
    clearTimeout(retry); retry = setTimeout(connect, 2000);
  });
  socket.addEventListener('error', () => socket.close());
}
connect();
