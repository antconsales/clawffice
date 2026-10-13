# WebSocket protocol v1

The HTTP hub and both WebSocket endpoints listen only on `127.0.0.1` (default
port 8787; `PORT` overrides it). JSON messages use `v: 1`. Maximum incoming
message size is 16 KiB. This milestone is a local, single-owner observer:
no authentication, pairing, remote access or commands. Other local processes
can publish observations; do not expose the hub with a proxy as an authenticated
service. Browser Origin must match the local Host. `/ingest` rejects browser
Origins and is unavailable in demo mode.

## Browser: `/ws` (read-only)

| Type | Fields | Meaning |
| --- | --- | --- |
| `hello` | `v`, `type`, `mode`, `serverTime`, `instances`, `agents` | First message; complete authoritative snapshot |
| `update` | `v`, `type`, `patch: {instances, agents}` | Full replacement records for the listed identities only |
| `presence` | `v`, `type`, `instanceId`, `status`, `since` | Instance transport connected/disconnected, not agent activity |
| `error` | `v`, `type`, `code` | Protocol error; browser writes return `read_only` |

```json
{
  "v": 1,
  "type": "hello",
  "mode": "live",
  "serverTime": "2026-10-13T10:00:00.000Z",
  "instances": [{"instanceId":"home","status":"connected","since":"2026-10-13T10:00:00.000Z"}],
  "agents": []
}
```

An agent record has `key` (opaque composite of instance and session), `instanceId`,
`sessionKey`, nullable `agentId`, `name`, nullable `role`, `state`, nullable `tool`,
`lastEvent`, `actions` (newest first, maximum 10), `activeRuns` (observed run IDs),
and `capabilities: {tool, subagent, percentage}`. Capabilities are booleans recording
observations, not promises of runtime coverage. `percentage` is always false.
Absent evidence is rendered as **Non disponibile**.

```json
{
  "v":1,
  "type":"update",
  "patch": {
    "instances":[],
    "agents":[{
      "key":"[\"home\",\"agent:dev:example\"]",
      "instanceId":"home", "sessionKey":"agent:dev:example", "agentId":"dev",
      "name":"Dev", "role":"Development", "state":"working", "tool":"exec",
      "capabilities":{"tool":true,"subagent":false,"percentage":false},
      "activeRuns":["run-1"],
      "lastEvent":{
        "v":1,"id":"event-1","ts":"2026-10-13T10:00:01.000Z",
        "kind":"before_tool_call","sessionKey":"agent:dev:example","agentId":"dev",
        "runId":"run-1","tool":"exec","source":"hook",
        "receivedAt":"2026-10-13T10:00:01.010Z"
      },
      "actions":[{
        "v":1,"id":"event-1","ts":"2026-10-13T10:00:01.000Z",
        "kind":"before_tool_call","sessionKey":"agent:dev:example","agentId":"dev",
        "runId":"run-1","tool":"exec","source":"hook",
        "receivedAt":"2026-10-13T10:00:01.010Z"
      }]
    }]
  }
}
```

States: `working`, `done`, `error`, `unknown`. Opening a session does not prove
work started. A completed tool does not prove the entire task finished. Missing
outcomes never imply task success. Multiple sessions of the same agent stay
separate. On reconnection the browser replaces its state with a new snapshot.

## Plugin: `/ingest`

First identify the producer within 2 seconds. `instanceId` must match
`[a-zA-Z0-9_-]{1,64}`; only one producer may own each ID. At most 16 producers
and 256 observed session records are kept.

```json
{"v":1,"type":"identify","instanceId":"home"}
```

Hub replies `{"v":1,"type":"ready"}`. Then send observations:

```json
{
  "v":1,"type":"event",
  "event":{
    "v":1,"id":"event-2","ts":"2026-10-13T10:00:02.000Z",
    "kind":"agent_end","sessionKey":"agent:dev:example",
    "agentId":"dev","runId":"run-1","outcome":"success","durationMs":1000
  }
}
```

Event fields:

| Field | Required | Contract |
| --- | --- | --- |
| `v` | yes | `1` |
| `id` | yes | Nonempty string, ≤256 characters; plugin uses UUID; bounded dedup per instance |
| `ts` | yes | ISO UTC timestamp emitted by plugin |
| `kind` | yes | One of the eight official hook names below |
| `sessionKey` | yes | Official session identity; `session:<sessionId>` fallback when the official context lacks a key |
| `agentId`, `runId` | no | Official identifiers, ≤256 characters |
| `name`, `role` | no | Explicit operator-configured display metadata, ≤256 characters |
| `tool` | tool hooks | Official `toolName`, ≤256 characters |
| `phase` | `subagent_progress` | `started` or `ended` |
| `outcome` | no | `success`, `error`, `timeout`, `killed`, `unknown`, `reset`, `deleted` |
| `durationMs` | no | Finite nonnegative duration from hook |

Kinds: `session_start`, `before_agent_run`, `agent_end`, `before_tool_call`,
`after_tool_call`, `subagent_spawned`, `subagent_progress`, `subagent_ended`.

Only these fields cross the normalization boundary. Unknown fields are stripped
at both ends. Prompt, arguments, tool results, message content, free-text errors,
subagent task labels and filesystem paths are never forwarded.

Invalid/duplicate observations return `error` with `invalid_or_duplicate_event`;
invalid JSON returns `invalid_json`; missing/wrong `v` returns `invalid_version`.
There is no delivery acknowledgement or durability guarantee. Duplicate tracking
is bounded to 2048 IDs; events beyond the session cap are rejected. Snapshot
and all state are lost on hub restart.

## Failure and demo behavior

The hub sends native WebSocket ping frames every 15 seconds. A connection is
terminated on the following tick if no pong arrived. Plugin automatically
responds and reconnects with delays from 1 to 15 seconds. Plugin handshake has
a 2-second timeout, identification a 4-second watchdog, and missing hub pings
a 45-second watchdog. Queues are limited to 256, oldest dropped on overflow,
and cleared on disconnect and shutdown. Slow sockets are bounded to 64 KiB
buffered data; slow viewers are terminated.

The hub uses its own receive time for freshness. Open activities without an
observation for 45 seconds become unknown on a heartbeat tick (up to 15 seconds
later). Disconnection immediately invalidates known activity. Reconnecting the
instance does not restore activity: only a fresh observation can do that.

Demo messages use the same schema with `mode: "demo"` and server-assigned
`source: "demo"` on observations. Live events get server-assigned `source: "hook"`.
Replay runs once at startup; restart `npm run demo` to replay again. No historical
recording or production timeline is implemented.
