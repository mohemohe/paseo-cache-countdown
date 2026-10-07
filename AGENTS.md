# Repository Guidelines

## Project overview

Paseo Cache Countdown is a Paseo plugin that shows an estimated prompt-cache countdown and circular progress indicator above the composer, and lists session countdowns in a sidebar screen and a workspace panel. It supports Codex (`codex`, 30 minutes) and Claude Code (`claude`, 1 hour for the main conversation, 5 minutes for delegated subagents labeled `paseo.parent-agent-id`). The manifest requires Paseo >= 0.10.3. The countdown runs on the client; the server entry registers the host-scoped settings documents and runs user-configured alert commands on the daemon machine when an idle agent's estimate turns yellow or red.

The project uses strict TypeScript, React, React Native, npm, and Vitest. Paseo supplies React, React Native, and the SDK at runtime; the local packages are development dependencies.

## Agent workflow

- Read and follow `/Users/mohemohe/.codex/RTK.md`. Prefix every shell command with `rtk`; use `rtk proxy <command>` when an unfiltered command is needed.
- Use multiple agents when independent tasks justify delegation.
- When using `gh`, request the appropriate sandbox-bypass permissions (`sandbox_permissions: "require_escalated"`).
- If Xcode through MCP stalls at a confirmation dialog, allow the request through Computer Use.
- Inspect the working tree before editing and preserve unrelated changes.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `paseo-plugin.json` | Plugin ID and minimum Paseo version |
| `index.client.tsx` | Client contribution entry point; registers the settings screen, sidebar surface, and workspace panel, and returns the plugin cleanup function |
| `index.server.ts` | Server entry; registers settings persistence and the turn and archive hooks that drive alerts |
| `shared/preferences.ts` | Host-scoped settings document (`showCachePrefix`, default `true`) |
| `shared/alerts.ts` | Host-scoped alert settings (per profile and level: `enabled`, default `false`, and `commands`) and the documented alert environment variables |
| `shared/cache-profiles.ts` | Provider durations, color thresholds, and `mm:ss` formatting shared by the client and server |
| `server/alerts.ts` | Alert scheduling from turn ends, cancellation, and command environment |
| `server/run-command.ts` | Shell command execution on the daemon machine and cleanup of running commands |
| `client/register.ts` | Per-agent composer-pill registration on the installation's host |
| `client/session-observer.ts` | Agent-directory observation for one host's API; publishes sessions and attaches pills |
| `client/sessions.ts` | Session directory shared with the lists, and host and workspace grouping |
| `client/session-list.tsx` | Plain React Native session rows and the host, search, and sort controls, also used by the preview |
| `client/session-screens.tsx` | Sidebar surface and workspace panel wrapping the list in the SDK `ScrollView` |
| `client/message-clock.ts` | Timeline history, live activity timestamps, retries, and reconnection |
| `client/countdown.ts` | Remaining time, display tone, and theme colors; re-exports the shared profiles |
| `client/countdown-store.ts` | External store; observes activity and ticks while components are subscribed |
| `client/pill.tsx` | React Native icon, popover, settings relay to pill labels, and app-resume refresh |
| `client/settings-screen.tsx` | Display settings screen under Settings → Plugins |
| `client/alert-settings-screen.tsx` | Alert settings screen with per-level switches, command lists, and the environment variable reference |
| `client/circle-progress.tsx` | Portable circular progress rendered with React Native views |
| `client/*.test.ts`, `server/*.test.ts`, `shared/*.test.ts` | Colocated Vitest tests |
| `client/preview.tsx`, `client/web.ts`, `preview/`, `scripts/preview.mjs` | Standalone browser preview |
| `README.md`, `README.ja.md` | English and Japanese user documentation |

## Development commands

Run these from the repository root:

```sh
rtk npm ci
rtk npm run check
rtk npm run preview
```

- `rtk npm run check` runs TypeScript checking and all Vitest tests.
- `rtk npm run typecheck` runs `tsc --noEmit`.
- `rtk npm test` runs `vitest run`; use `rtk npm test -- client/message-clock.test.ts` for a focused test file.
- The preview is served at `http://127.0.0.1:4173/preview/`. It uses the actual progress component with sample scenarios and does not connect to Paseo.
- There is no production build script. Paseo loads the plugin source. After changes, reload an installed plugin with `rtk proxy paseo plugin reload paseo-cache-countdown`.

## Behavior to preserve

- Calculate remaining time from the activity timestamp and current wall-clock time, rather than decrementing a counter. Display seconds rounded up and clamp remaining time between zero and the provider duration.
- Reset the estimate for user/assistant messages, streaming message chunks, and `tool_call` events with `completed` or `failed` status. Tool starts, running output, cancellation, reasoning, and metadata changes do not reset it.
- Each parallel tool completion or failure can advance the timestamp. Delayed or duplicate events must not move it backward within a timeline epoch; a replacement epoch resets its history.
- Use success colors above half the duration, warning at half or less, and danger at one-eighth or less. Missing history, initial loading, and observation errors display `Cache --:--`; expiration displays `Cache 00:00`.
- Register pills only for supported, unarchived agents with a workspace. Reconcile snapshots, workspace/provider changes, and removals without duplicate registrations.
- Await timeline subscription readiness before fetching initial history. Resynchronize on reconnection and replacement, preserve newer live events during history fetches, and retry failures with capped backoff.
- Keep timeline observers and the one-second timer active only while the icon, popover, or a session-list row is subscribed. Session lists share the pill's store instead of observing a timeline again. Release subscriptions, timers, stores, and pill registrations during cleanup.
- The sidebar screen filters by host (all or one online host; one host stops observing the others) and by a case-insensitive query on the title, project, or workspace name. Its time-remaining sort puts running caches with the least time first, then expired, then unknown, and re-sorts as countdowns change. Filter state is local to the mounted screen.
- Session lists show the same sessions as the pills, newest first. The sidebar screen adds other online hosts through `useHosts()` and `getPaseoClient()` only while it is mounted, and groups by host and workspace; the panel filters the installation's host to its workspace. The `active` directory scope omits archived workspaces and projects, matching Paseo's sidebar. The plugin API cannot decorate Paseo's built-in sidebar session rows.
- Alerts run on the daemon, not the client: `agent.turn_ended` schedules yellow (half the duration remaining) and red (one-eighth remaining) for supported agents with a workspace, using the same `claude-subagent` split as the pills (delegated Claude Code agents via `parentAgentId`). `agent.turn_started` and `agent.archived` cancel the schedule; a later turn end replaces it. Read settings when an alert fires, run only enabled levels, skip blank commands, and drop an alert whose schedule was replaced while settings were read. Commands run through the system shell with `ALERT_ENVIRONMENT` variables; keep `ALERT_ENVIRONMENT`, the settings screen, and both READMEs in sync. Cleanup clears timers and stops running commands.
- Show `Cache ` before the pill time by default; the `showCachePrefix` setting hides it for every registered pill without re-registering them.
- The countdown estimates retention from Paseo activity. It does not measure the provider's actual cache state or API submission time.

## Code and verification conventions

- Follow the existing two-space indentation, double quotes, semicolons, named exports, and `import type` usage. Keep the entry point's default export.
- Use `PluginClientContext` and derive timeline types from the installed SDK types. Check installed declarations when upstream documentation describes a different version.
- Use React Native primitives and Paseo theme colors for runtime UI. Keep browser-only code in the preview; preserve the ring's portability without DOM or SVG dependencies.
- Write UI text, including the preview, in English. The plugin API does not expose Paseo's app language.
- Add or adjust colocated tests for changed timing, event, race, retry, and cleanup behavior. Existing tests use fake timers and mocked SDK handles.
- Run `rtk npm run check` after code changes. For UI changes, also inspect the preview and distinguish that result from verification in a real Paseo conversation.
- Update both READMEs when user-visible behavior, requirements, or installation instructions change.

## Official documentation

- [SDK API reference](https://github.com/getpaseo/paseo/blob/main/public-docs/sdk/reference.md) — client methods, handles, configuration, and lifecycle.
- [SDK events](https://github.com/getpaseo/paseo/blob/main/public-docs/sdk/events.md) — subscriptions, timeline events, history, and reconnection.
- [Plugin quickstart](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/index.md).
- [Plugin reference: composer pills](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#composer-pills).

Consult these references before changing Paseo integration behavior. The links track upstream `main`; verify compatibility with the version declared in `package.json` and `paseo-plugin.json`.
