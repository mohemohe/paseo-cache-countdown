# Repository Guidelines

## Project overview

Paseo Cache Countdown is a Paseo plugin that shows an estimated prompt-cache countdown and circular progress indicator above the composer, and lists session countdowns in a sidebar screen and a workspace panel. It supports Codex (`codex`, 30 minutes) and Claude Code (`claude`, 1 hour for the main conversation, 5 minutes for delegated subagents labeled `paseo.parent-agent-id`). The manifest requires Paseo >= 0.10.3. The countdown runs on the client; the server entry only registers the host-scoped settings document.

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
| `index.server.ts` | Server entry; registers settings persistence |
| `shared/preferences.ts` | Host-scoped settings document (`showCachePrefix`, default `true`) |
| `client/register.ts` | Agent-directory observation, per-agent composer-pill registration, and session publication |
| `client/sessions.ts` | Session directory shared with the lists and workspace grouping |
| `client/session-list.tsx` | Plain React Native session rows, also used by the preview |
| `client/session-screens.tsx` | Sidebar surface and workspace panel wrapping the list in the SDK `ScrollView` |
| `client/message-clock.ts` | Timeline history, live activity timestamps, retries, and reconnection |
| `client/countdown.ts` | Provider durations, remaining time, display formatting, color thresholds, and theme colors |
| `client/countdown-store.ts` | External store; observes activity and ticks while components are subscribed |
| `client/pill.tsx` | React Native icon, popover, settings relay to pill labels, and app-resume refresh |
| `client/settings-screen.tsx` | Settings screen under Settings → Plugins |
| `client/circle-progress.tsx` | Portable circular progress rendered with React Native views |
| `client/*.test.ts`, `shared/*.test.ts` | Colocated Vitest tests |
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
- Session lists show the same sessions as the pills on the installation's host, newest first; the sidebar screen groups them by workspace and the panel filters to its workspace. The plugin API cannot decorate Paseo's built-in sidebar session rows.
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
