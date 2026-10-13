# Compatibilità degli hook — OpenClaw 2026.9.8

Verifica statica sul pacchetto installato in
`/home/o/.npm-global/lib/node_modules/openclaw`, versione attestata da
`package.json:3`. I percorsi sotto sono relativi a quella radice; i riferimenti
`dist/` sono **prove dei tipi distribuiti**, mai import runtime del plugin.

## Interfacce ufficiali usate

- Entry: `definePluginEntry` da `openclaw/plugin-sdk/plugin-entry`:
  `docs/plugins/sdk-entrypoints/define-plugin-entry.md:18`.
- Registrazione: `api.on(name, handler)`, non `registerHook`:
  `docs/plugins/hooks.md:13`, `docs/plugins/hooks.md:27`.
- Configurazione: `api.pluginConfig`: `docs/plugins/hooks.md:150`.
- Servizio: `api.registerService` con `start`/`stop`:
  `docs/plugins/sdk-runtime/gateway-and-nodes.md:391`,
  `dist/types-BaOV3VIS.d.ts:10365`.
- Cleanup opzionale `api.lifecycle.onDispose`:
  `docs/plugins/sdk-runtime.md:147`.
- Nessun accesso al gateway interno, pannello, transcript o file di stato.

## Hook → osservazione inviata

Tutti gli eventi hanno UUID, tempo UTC e identità di sessione; run e agente sono
inclusi solo se forniti da un hook o già correlati da osservazioni ufficiali.
I nomi/ruoli provengono esclusivamente dalla configurazione esplicita.

| Hook | Campi utilizzati / effetto | Prova file:riga |
| --- | --- | --- |
| `session_start` | `sessionKey`, `sessionId`, contesto agente. Mostra sessione aperta, stato iniziale sconosciuto; **non** equivale a turno iniziato | `docs/plugins/hooks/reference.md:178`; `dist/types-BaOV3VIS.d.ts:14498` |
| `before_agent_run` | Solo identificativi del contesto; attività osservata in avvio. Handler restituisce `undefined`, non modifica o blocca | `docs/plugins/hooks/reference.md:130`; `dist/types-BaOV3VIS.d.ts:14654`; contesto `:14067` |
| `agent_end` | `success`, `durationMs`, `runId`; successo → `success`, fallimento → `error`. Nessun messaggio/testo d'errore | `docs/plugins/hooks/reference.md:133`; `dist/types-BaOV3VIS.d.ts:14185` |
| `before_tool_call` | `toolName`, `runId`, identificativi del contesto. Tool iniziato. Nessun `params`, nessuna decisione/modifica | `docs/plugins/hooks/reference.md:148`; `dist/types-BaOV3VIS.d.ts:14439` |
| `after_tool_call` | `toolName`, `durationMs`, `runId`, presenza di `error` → esito errore, senza testo. Completamento tool, non successo dell'intero agente | `docs/plugins/hooks/reference.md:149`; `dist/types-BaOV3VIS.d.ts:14460` |
| `subagent_spawned` | `childSessionKey`, `agentId`, `runId`. Record distinto del child; non invia `label` né task | `docs/plugins/hooks/reference.md:202`; `dist/types-BaOV3VIS.d.ts:14532`, `:14565` |
| `subagent_progress` | `childSessionKey`, `runId`, `phase`, eventuale `outcome`. `ok` → `success`; nessuna percentuale | `docs/plugins/hooks/reference.md:203`; `dist/types-BaOV3VIS.d.ts:14573` |
| `subagent_ended` | `targetSessionKey`, `runId`, eventuale `outcome`; correlazione col child. Nessun `reason` libero né `error` | `docs/plugins/hooks/reference.md:206`; `dist/types-BaOV3VIS.d.ts:14585` |

L'identità del child non viene mai sostituita dalla sessione del richiedente.
Gli eventi senza sessione identificabile, anche tramite `runId` precedentemente
osservato, sono scartati. Nessun parsing di convenzioni interne delle session key.
Mappe di correlazione limitate a 1024 elementi ciascuna.

## Limiti documentati e prove ancora da eseguire

**Registrare un hook non prova che un runtime lo emetta.** Avviso ufficiale:
`docs/plugins/hooks.md:170`. I test del repo verificano contratti, mapping,
sanificazione, WebSocket e replay; non avviano né riconfigurano OpenClaw.

| Capacità | Stato dopo questa PR |
| --- | --- |
| Sessione aperta, fine attività, tool OpenClaw, subagenti | Contratti verificati staticamente; emissione reale per runtime **da verificare** |
| Inizio turno embedded/CLI | `before_agent_run` documentato; emissione reale **da verificare** |
| Inizio turno Codex/Copilot | **Non disponibile** con `before_agent_run`; limite `docs/plugins/hooks.md:171` |
| Tool nativi Codex | Telemetria `after_tool_call` documentata, copertura/identità **da verificare**; `docs/plugins/codex-harness-runtime/hooks.md:126` |
| Percentuale di avanzamento, handoff strutturato | **Non disponibile**; nessun evento inventato o analisi dei messaggi |
| Connessione plugin↔hub | Trasporto di Clawffice, non hook OpenClaw; ping/pong e riconnessione |

Le capacità della scheda sono indicate come osservate solo dopo un evento
correlabile. Senza evidenza l'UI mostra **Non disponibile**. Perdita di connessione
→ **Unknown**, anche dopo il ritorno online finché non arriva un evento reale.

`agent_end` e `before_agent_run` richiedono concessione esplicita
`hooks.allowConversationAccess` per plugin esterni: `docs/plugins/hooks.md:125`.
Incognito conserva identità/esito/durata di `agent_end`, non contenuti:
`docs/plugins/hooks.md:138`. Il plugin scarta comunque ogni contenuto.

## Checklist manuale dopo il collegamento effettuato dal proprietario

1. Avviare l'hub live e collegare il plugin con permessi ufficiali documentati.
2. Embedded/CLI: aprire una sessione, eseguire e concludere un turno; verificare
   sessione, avvio quando emesso, esito e durata senza contenuti.
3. Codex: ripetere; annotare quali hook arrivano davvero, senza promettere
   `before_agent_run`. Provare un tool OpenClaw e uno nativo Codex.
4. Avviare un child in background e verificarne identità, progress e conclusione;
   registrare assenze di emissione come non disponibili.
5. Provare errore tool/turno e due sessioni concorrenti; nessun falso successo o
   attribuzione al parent di eventi del child.
6. Arrestare/riavviare l'hub: OpenClaw continua; lo stato non torna al lavoro
   solo perché il plugin è di nuovo connesso.

**Non eseguita qui:** prova end-to-end con un runtime reale, che richiederebbe
installazione/configurazione OpenClaw esplicitamente riservata al proprietario.
Nessuna compatibilità empirica dichiarata per altre versioni.
