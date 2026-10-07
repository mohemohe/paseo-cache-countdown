# Paseo Cache Countdown

[日本語版はこちら / Japanese README](README.ja.md)

A Paseo plugin that displays the remaining prompt cache time and a circular progress indicator in a pill above the composer.

| Agent | Cache duration | Turns yellow at | Turns red at |
| --- | --- | --- | --- |
| Codex | 30 minutes | 15 minutes remaining or less | 3 minutes 45 seconds remaining or less |
| Claude Code (main conversation) | 1 hour | 30 minutes remaining or less | 7 minutes 30 seconds remaining or less |
| Claude Code (subagent) | 5 minutes | 2 minutes 30 seconds remaining or less | 37.5 seconds remaining or less |

Claude Code durations follow the [Claude Code prompt caching documentation](https://code.claude.com/docs/en/prompt-caching) for Claude subscription usage within plan limits. Agents delegated from another Paseo agent (those with the `paseo.parent-agent-id` label) are treated as subagents. The plugin cannot detect the billing method; with usage credits, API keys, or cloud providers, the main conversation cache is also 5 minutes, so the 1-hour estimate does not apply.

The indicator is green by default, turns yellow when half or less of the time remains, and turns red when one-eighth or less remains. It uses the Paseo theme's `statusSuccess` / `statusWarning` / `statusDanger` colors. After the timer expires, it displays a red ring and `Cache 00:00`.

The remaining time is recalculated every second from wall-clock time. **A new user or assistant message, streaming chunk, or tool completion or failure resets the countdown when the client receives it.** The plugin uses that activity's daemon timestamp and client receipt time to compensate for clock differences between the client and a remote host. Tools reset the timer only on `tool_call` events with a `completed` or `failed` status; starting a call, output during execution, and cancellation do not reset it. Reasoning and title changes are also excluded. The displayed time is rounded up to the nearest second, so a Claude Code subagent's indicator turns red while `00:38` is displayed.

Parallel tools each update the timer when they complete or fail. For example, if tool A finishes first, the timer resets when A's result arrives; when tool B finishes later, it resets again when B's result arrives. Daemon timestamps determine event order, so older results that arrive late or duplicate notifications never reset the countdown or change its clock correction, including after reopening the same conversation. This does not detect when an entire parallel group finishes or when all results are sent to the API together.

The plugin fetches message and tool result history when a conversation is opened and resynchronizes on reconnection. Before the first live activity is received, history assumes that the daemon and client clocks agree: the public Paseo 0.10.3 plugin API does not expose the current daemon time. After live activity, the learned clock correction also applies to history and is retained while the conversation's pill remains registered. If loading fails, it retries with increasing delays, up to a maximum interval of 30 seconds. It displays `Cache --:--` when there is no relevant history, while the initial history is loading, or when fetching fails. Press the pill to view the last update time and status. The plugin's UI text is in English only, because the Paseo plugin API does not expose the app's language setting. The pill is only shown for the Codex and Claude Code providers.

This is an estimate based on the specified 30-minute / 1-hour / 5-minute durations. It does not query the provider's actual cache retention state or the time data was sent to the API. Live estimates include delivery latency because clock correction is based on receipt time.

## Session Lists

The plugin can also list the countdowns of several sessions at once:

- **Sidebar screen**: Select **Cache Countdown** in the sidebar to see the Codex and Claude Code sessions on every online host configured in the app, grouped by project and workspace with the newest sessions first. With sessions from several hosts, each heading starts with the host name. Other hosts do not need the plugin installed; their sessions are observed only while the screen is open.

  Controls above the list narrow and reorder it:
  - **Host**: Show every host (**All**) or one online host. Choosing one host stops observing the others.
  - **Search**: Type to show only sessions whose title, project, or workspace name contains the text, ignoring case.
  - **Sort**: **Host & project** groups sessions under host, project, and workspace headings. **Time remaining** lists running caches with the least time left first, followed by expired (`00:00`) and unknown (`--:--`) ones; each row shows its host, project, and workspace. The order follows the countdown as it changes.

  The filters reset when the screen is closed.
- **Workspace panel**: Choose **Cache Countdown** from the new-tab menu of a workspace or the Explorer to see the sessions in that workspace.

Like Paseo's sidebar, the lists omit archived sessions and sessions in archived workspaces or projects. Press a row to open its conversation. The Paseo 0.10.3 plugin API cannot add content to the built-in session rows in the sidebar, so these lists are shown separately. Lists use the same estimates, colors, and `Cache --:--` conditions as the pill and show only the remaining time. While a list is open, it loads and follows the history of every session it shows; observation stops when the list and the pill are closed.

## Settings

Open **Settings → Plugins → paseo-cache-countdown → Display** and turn off **Show “Cache” in the pill** to show only the remaining time in the pill, such as `29:59` instead of `Cache 29:59`. The prefix is shown by default. The setting is saved on the host and shared by every client connected to it. When a conversation is opened, the pill can show the default label briefly until the setting has loaded.

## Alerts

Open **Settings → Plugins → paseo-cache-countdown → Alerts** to run shell commands when the estimate turns yellow or red, for example to play a sound or show a system notification. Codex, the Claude Code main conversation, and Claude Code subagents each have separate yellow and red sections at the thresholds in the table above. Each section has a **Run commands** switch, off by default, and any number of commands. Select **Add** to add a command, then **Save** to store the list; clear a command to remove it. The commands in a section start in list order without waiting for one another. Settings are saved on the host and shared by every client connected to it.

The daemon starts timing when a turn ends and stops when the next turn starts or the agent is archived, so alerts run even when no Paseo window is open. Because timing starts at the end of the turn rather than at the last message or tool result the pill uses, an alert can run slightly later than the pill changes color. No alert runs while a turn is in progress. Restarting the daemon or reloading the plugin clears pending alerts, so sessions that were already idle at that point are not alerted until their next turn ends.

Commands run in the system shell (`/bin/sh` on macOS and Linux) **on the daemon machine**. When you use Paseo from another device, such as a phone or a client connected to a remote host, the sound plays on the daemon machine rather than on that device. Anyone who can change this host's plugin settings can run commands on the daemon machine. Commands inherit the daemon's environment; failures and non-zero exit codes are written to the daemon log, and commands still running are stopped when the plugin is reloaded or disabled.

Examples for macOS:

```sh
afplay /System/Library/Sounds/Glass.aiff
osascript -e "display notification \"$PASEO_CACHE_REMAINING left\" with title \"$PASEO_CACHE_PROFILE_NAME prompt cache\""
```

These environment variables are added for each command:

| Variable | Value |
| --- | --- |
| `PASEO_CACHE_PROVIDER` | Agent provider: `codex` or `claude` |
| `PASEO_CACHE_PROFILE` | Countdown profile: `codex`, `claude`, or `claude-subagent` |
| `PASEO_CACHE_PROFILE_NAME` | Display name: `Codex`, `Claude Code`, or `Claude Code (subagent)` |
| `PASEO_CACHE_LEVEL` | `warning` (yellow) or `danger` (red) |
| `PASEO_CACHE_REMAINING` | Remaining time as `mm:ss`, such as `15:00` |
| `PASEO_CACHE_REMAINING_SECONDS` | Remaining time in whole seconds, rounded up, such as `900` |
| `PASEO_CACHE_DURATION_SECONDS` | Full cache duration in seconds: `1800`, `3600`, or `300` |
| `PASEO_CACHE_EXPIRES_AT` | Estimated expiration time in ISO 8601 (UTC), such as `2026-10-07T00:30:00.000Z` |
| `PASEO_AGENT_ID` | Agent ID |
| `PASEO_AGENT_TITLE` | Agent title; empty when the agent has none |
| `PASEO_WORKSPACE_ID` | Workspace ID |
| `PASEO_AGENT_CWD` | Agent working directory |

The settings screen lists the same variables.

## Installation

Both the Paseo daemon and client must be version **0.10.3 or later**.

1. Turn on **Settings → Plugins → Enable plugins** for the target host.
2. Enter `github:mohemohe/paseo-cache-countdown` in **Plugin source**, then select **Install plugin**.

You can also install it from the CLI:

```sh
paseo plugin install github:mohemohe/paseo-cache-countdown
paseo plugin ls
```

Reload the plugin after making changes:

```sh
paseo plugin reload paseo-cache-countdown
```

The pill and session lists run on the client. The server entry registers the settings documents so that Paseo can store them on the host, and runs alert commands on the daemon machine. No API keys or external services are required. Paseo provides React, React Native, and the SDK.

## Development and Verification

```sh
npm ci
npm run check
npm run preview
```

You can view the actual circular progress component at `http://127.0.0.1:4173/preview/`. The preview lets you switch between Codex, the Claude Code main conversation, and a Claude Code subagent, and try scenarios with 50% or one-eighth of the time remaining, an expired timer, or a new message. It also shows the sidebar screen's session list, with working host, search, and sort controls, and the workspace panel with sample sessions. This preview is for visual inspection and does not connect to Paseo.

Automated tests cover durations and color thresholds, remote clocks ahead of or behind the client, clock advances equivalent to sleep, updates on tool completion or failure and the exclusion of tool starts and cancellations, parallel tool completion order and delayed or duplicate events, expansion of the history fetch range, races between history and incoming events, reconnection, history replacement, remounting, per-conversation registration and cleanup, publishing session names to the session lists, observing other hosts, grouping sessions by host and workspace, searching, sorting by time remaining, the `Cache` prefix setting and its default, alert timing for each profile and level, the per-level switches and commands, the alert environment, cancellation by a new turn, archiving, or cleanup, and running and stopping shell commands. To verify the behavior in Paseo itself, open a supported conversation after installation and confirm that sending or receiving messages and tool completions or failures reset the timer. To try alerts, enable a Claude Code subagent alert, whose yellow threshold is reached 2 minutes 30 seconds after a turn ends.

Development dependencies match the React and React Native versions used by Paseo 0.10.3. As of 2026-10-04, `npm audit` still reports an issue with `braces` in React Native's development dependency tree. This dependency is not included in the plugin's runtime bundle.

## Project Structure

- `index.client.tsx`: Plugin client entry point; registers the settings screens, sidebar screen, and workspace panel
- `index.server.ts`: Settings persistence on the host and alert hooks
- `shared/preferences.ts`, `shared/alerts.ts`: Display and alert settings document definitions, and the alert environment variables
- `shared/cache-profiles.ts`: Durations and color thresholds shared by the client and server
- `server/alerts.ts`, `server/run-command.ts`: Alert timing from turn events and shell command execution on the daemon machine
- `client/register.ts`: Per-conversation pill registration and cleanup, and publication to the session lists
- `client/session-observer.ts`: Agent directory observation on one host
- `client/sessions.ts`: Registered sessions and host and workspace grouping for the session lists
- `client/session-list.tsx`, `client/session-screens.tsx`: Session list rows and filters, the sidebar screen, and the workspace panel
- `client/message-clock.ts`: Message and tool result history and live updates
- `client/activity-clock.ts`: Daemon timestamp ordering and client clock correction
- `client/countdown.ts`: Duration, remaining time, and color calculations
- `client/countdown-store.ts`: Clock subscription and per-second updates only while displayed
- `client/pill.tsx`, `client/circle-progress.tsx`: React Native pill icon and detail view
- `client/settings-screen.tsx`, `client/alert-settings-screen.tsx`: Display and alert settings screens

Official documentation: [Plugin quickstart](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/index.md), [Lifecycle hooks](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#events), [Composer pills](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#composer-pills), [Surfaces and sidebar items](https://github.com/getpaseo/paseo/blob/v0.10.3/public-docs/plugins/reference.md#surfaces-and-sidebar-items), [Workspace panels](https://github.com/getpaseo/paseo/blob/v0.10.3/public-docs/plugins/reference.md#workspace-panels), [Settings screens](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#settings-screens), [SDK events](https://github.com/getpaseo/paseo/blob/main/public-docs/sdk/events.md).
