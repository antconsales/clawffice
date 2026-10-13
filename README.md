# Clawffice

Your AI agent team, observed in a tiny night office. A small MIT-licensed local
OpenClaw observer: real official plugin hooks become live badges, comic bubbles
and clickable agent cards. This is the first demonstrable milestone, not the
complete product.

## Start in 60 seconds

Requires **Node 24** and npm. Only `ws` is installed; no framework or build step.

```sh
npm ci
npm run demo
```

Open **http://127.0.0.1:8787**. The seven-event synthetic replay runs once over
about eight seconds and is prominently marked **DEMO — simulated events**.
Click Dev or Research to inspect their role, status and recent actions. Restart
the command to replay again. These fixtures do not demonstrate live OpenClaw
compatibility.

For real observations:

```sh
npm start
# Optional port override (apply the same port to the plugin):
PORT=8790 npm start
```

Live mode starts empty and waits for the separately connected plugin. Both modes
bind **only to 127.0.0.1**. Stop with Ctrl+C. State is in memory and lost on restart.
No setup command installs services or changes OpenClaw.

## Architecture in five lines

1. The OpenClaw plugin passively observes documented agent, tool and child hooks.
2. A bounded nonblocking WebSocket producer sends only allowlisted metadata.
3. A Node HTTP + `ws` hub holds current session state and ten recent actions.
4. Browsers receive a complete `hello` snapshot followed by incremental updates.
5. Static HTML/CSS/JS renders the office; demo fixtures use the same reducer.

`assets/riferimento-ufficio.webp` is the **provisional reference background**
provided for this milestone, copied unchanged. Its illustrated characters are
not agent telemetry. Clickable badges are the actual observed records. No new
images, sprites, fonts or external assets are downloaded.

## Connect the plugin manually

Reference API: **OpenClaw 2026.9.8**. Its SDK is supplied by the OpenClaw host;
`npm ci` does not download OpenClaw. The plugin package has an optional host peer
and only `ws` as its runtime dependency. Review the plugin before loading it.

The owner must perform these steps; they are not performed by this repository:

```sh
openclaw plugins install --link ./plugin --force
openclaw plugins enable clawffice
```

Merge this entry into your existing OpenClaw configuration (do not replace it):

```json
{
  "plugins": {
    "entries": {
      "clawffice": {
        "enabled": true,
        "hooks": { "allowConversationAccess": true },
        "config": {
          "instanceId": "home",
          "hubUrl": "ws://127.0.0.1:8787/ingest",
          "agents": {
            "dev": { "name": "Dev", "role": "Development" }
          }
        }
      }
    }
  }
}
```

Use agent IDs from your own configuration. No roster or internal state files are
read. Unknown roles show **Non disponibile**. Keep the linked checkout and its
`node_modules` available. For a separately copied plugin package, install its
single dependency in that package manually. Do not connect it to demo mode.

Apply settings through the host's documented reload mechanism, then inspect:

```sh
openclaw plugins inspect clawffice --runtime --json
openclaw plugins reload clawffice
```

Inspection is not proof of real emission. Run the manual checklist in
[hook compatibility](docs/HOOK-COMPATIBILITA.md) to check your runtime.
The plugin never blocks/rewrites tools or prompts and sends no conversation
content, tool arguments/results, error text or task labels.

`session_start` opens a session, not every work turn. `before_agent_run` has a
documented embedded/CLI boundary; Codex/Copilot starts are not promised. Tool
completion does not imply task completion. Missing data shows **Non disponibile**;
lost connection or stale activity shows **Unknown**. A reconnect alone never
restores a working status. Multiple sessions of one agent have separate cards.

See the [WebSocket protocol](docs/ws-protocol.md) for schemas, limits and failure
behavior. This milestone has **no authentication**: localhost processes are
trusted. It is not ready for proxy/public exposure. Pairing, chat, moods, remote
commands, persistent history and production sprites are future work.

## Verify

```sh
npm test
npm run lint
```

Tests use `node --test` for HTTP/assets, snapshot/deltas, replay, hook mapping,
privacy, concurrency and disconnect handling. Lint is a dependency-free syntax
check using `node --check`, not a full style/type linter. Tests do not modify or
start OpenClaw. There is no browser automation dependency.

## User service template — container 101

[deploy/clawffice.service](deploy/clawffice.service) is a **systemd --user template**.
Nothing is installed or enabled automatically. In container 101, as the intended
user, put the checkout at `~/clawffice`, run `npm ci`, and adapt `WorkingDirectory`
and `ExecStart` if necessary. Ensure `/usr/bin/node` is Node 24; otherwise use
its absolute path. An optional external `~/.config/clawffice/hub.env` can contain
`PORT=8787`. Keep `.env` files and credentials outside git.

When you choose to install it manually:

```sh
mkdir -p ~/.config/systemd/user
cp deploy/clawffice.service ~/.config/systemd/user/clawffice.service
systemctl --user daemon-reload
systemctl --user enable --now clawffice
systemctl --user status clawffice
journalctl --user -u clawffice -n 50
```

A user manager and Node 24 must already be available in the container. Login
persistence, container setup and any network exposure remain owner-managed.
The template runs live mode and still binds exclusively to loopback. No system
service, container or OpenClaw configuration is changed by the application.

## Roll back

Before merge, close the PR; after merge, revert its commit. For an owner-installed
service, run `systemctl --user disable --now clawffice`, remove the copied unit,
and run `systemctl --user daemon-reload`. Disable the observer with
`openclaw plugins disable clawffice` and remove its entry/link through the official
plugin management commands if desired. Stop terminal runs with Ctrl+C. No database
or migrations need to be undone; uninstalling a linked plugin does not require
removing the checkout.
