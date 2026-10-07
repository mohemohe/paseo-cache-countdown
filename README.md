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

The plugin runs entirely on the client. No server-side code, API keys, or external services are required. Paseo provides React, React Native, and the SDK.

## Development and Verification

```sh
npm ci
npm run check
npm run preview
```

You can view the actual circular progress component at `http://127.0.0.1:4173/preview/`. The preview lets you switch between Codex, the Claude Code main conversation, and a Claude Code subagent, and try scenarios with 50% or one-eighth of the time remaining, an expired timer, or a new message. This preview is for visual inspection and does not connect to Paseo.

Automated tests cover durations and color thresholds, remote clocks ahead of or behind the client, clock advances equivalent to sleep, updates on tool completion or failure and the exclusion of tool starts and cancellations, parallel tool completion order and delayed or duplicate events, expansion of the history fetch range, races between history and incoming events, reconnection, history replacement, remounting, and per-conversation registration and cleanup. To verify the behavior in Paseo itself, open a supported conversation after installation and confirm that sending or receiving messages and tool completions or failures reset the timer.

Development dependencies match the React and React Native versions used by Paseo 0.10.3. As of 2026-10-04, `npm audit` still reports an issue with `braces` in React Native's development dependency tree. This dependency is not included in the plugin's runtime bundle.

## Project Structure

- `index.client.tsx`: Plugin entry point
- `client/register.ts`: Per-conversation pill registration and cleanup
- `client/message-clock.ts`: Message and tool result history and live updates
- `client/activity-clock.ts`: Daemon timestamp ordering and client clock correction
- `client/countdown.ts`: Duration, remaining time, and color calculations
- `client/countdown-store.ts`: Clock subscription and per-second updates only while displayed
- `client/pill.tsx`, `client/circle-progress.tsx`: React Native pill icon and detail view

Official documentation: [Plugin quickstart](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/index.md), [Composer pills](https://github.com/getpaseo/paseo/blob/main/public-docs/plugins/reference.md#composer-pills), [SDK events](https://github.com/getpaseo/paseo/blob/main/public-docs/sdk/events.md).
