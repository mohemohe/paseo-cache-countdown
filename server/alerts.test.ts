import type { PluginHookAgent } from "@getpaseo/plugin/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alerts, type AlertSettings } from "../shared/alerts";
import { createAlertScheduler, getAlertProfile, type AlertEnvironment } from "./alerts";

const MINUTE = 60_000;
const endedAt = Date.parse("2026-10-07T00:00:00Z");

function agent(overrides: Partial<PluginHookAgent> = {}): PluginHookAgent {
  return {
    id: "agent-1",
    workspaceId: "workspace-1",
    parentAgentId: null,
    provider: "codex",
    cwd: "/repo",
    title: "Fix tests",
    ...overrides,
  };
}

function setup(input: unknown = {}) {
  let settings: AlertSettings | null = alerts.schema.parse(input);
  const runs: { command: string; env: AlertEnvironment }[] = [];
  const readSettings = vi.fn(async () => settings);
  const scheduler = createAlertScheduler({
    readSettings,
    run: (command, env) => runs.push({ command, env }),
  });
  return {
    scheduler,
    runs,
    readSettings,
    setSettings(next: AlertSettings | null) {
      settings = next;
    },
  };
}

const everyAlert = {
  codex: { warning: { enabled: true, commands: ["codex yellow"] }, danger: { enabled: true, commands: ["codex red"] } },
  claude: { warning: { enabled: true, commands: ["claude yellow"] }, danger: { enabled: true, commands: ["claude red"] } },
  "claude-subagent": { warning: { enabled: true, commands: ["claude-subagent yellow"] }, danger: { enabled: true, commands: ["claude-subagent red"] } },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(endedAt);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getAlertProfile", () => {
  it("matches the pills, with delegated Claude Code agents as subagents", () => {
    expect(getAlertProfile(agent())).toBe("codex");
    expect(getAlertProfile(agent({ provider: "claude" }))).toBe("claude");
    expect(getAlertProfile(agent({ provider: "claude", parentAgentId: "parent" }))).toBe("claude-subagent");
    expect(getAlertProfile(agent({ provider: "claude", parentAgentId: "  " }))).toBe("claude");
    expect(getAlertProfile(agent({ provider: "codex", parentAgentId: "parent" }))).toBe("codex");
    expect(getAlertProfile(agent({ provider: "opencode" }))).toBeNull();
    expect(getAlertProfile(agent({ workspaceId: null }))).toBeNull();
  });
});

describe.each([
  ["codex", agent(), 15 * MINUTE, "15:00", 26.25 * MINUTE, "03:45"],
  ["claude", agent({ provider: "claude" }), 30 * MINUTE, "30:00", 52.5 * MINUTE, "07:30"],
  ["claude-subagent", agent({ provider: "claude", parentAgentId: "parent" }), 2.5 * MINUTE, "02:30", 4.375 * MINUTE, "00:38"],
] as const)("%s alerts", (profile, target, warningAt, warningLeft, dangerAt, dangerLeft) => {
  it("runs its own commands at yellow and red with the documented environment", async () => {
    const { scheduler, runs } = setup(everyAlert);
    scheduler.turnEnded(target);

    await vi.advanceTimersByTimeAsync(warningAt - 1);
    expect(runs).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(runs.map(({ command }) => command)).toEqual([`${profile} yellow`]);
    expect(runs[0]!.env).toMatchObject({
      PASEO_CACHE_PROVIDER: target.provider,
      PASEO_CACHE_PROFILE: profile,
      PASEO_CACHE_LEVEL: "warning",
      PASEO_CACHE_REMAINING: warningLeft,
      PASEO_AGENT_ID: "agent-1",
      PASEO_AGENT_TITLE: "Fix tests",
      PASEO_WORKSPACE_ID: "workspace-1",
      PASEO_AGENT_CWD: "/repo",
    });

    await vi.advanceTimersByTimeAsync(dangerAt - warningAt);
    expect(runs.map(({ command }) => command)).toEqual([`${profile} yellow`, `${profile} red`]);
    expect(runs[1]!.env).toMatchObject({ PASEO_CACHE_LEVEL: "danger", PASEO_CACHE_REMAINING: dangerLeft });

    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(runs).toHaveLength(2);
  });
});

it("describes the profile, duration, and expiration", async () => {
  const { scheduler, runs } = setup(everyAlert);
  scheduler.turnEnded(agent({ provider: "claude", parentAgentId: "parent", title: null }));
  await vi.advanceTimersByTimeAsync(2.5 * MINUTE);
  expect(runs[0]!.env).toEqual({
    PASEO_CACHE_PROVIDER: "claude",
    PASEO_CACHE_PROFILE: "claude-subagent",
    PASEO_CACHE_PROFILE_NAME: "Claude Code (subagent)",
    PASEO_CACHE_LEVEL: "warning",
    PASEO_CACHE_REMAINING: "02:30",
    PASEO_CACHE_REMAINING_SECONDS: "150",
    PASEO_CACHE_DURATION_SECONDS: "300",
    PASEO_CACHE_EXPIRES_AT: "2026-10-07T00:05:00.000Z",
    PASEO_AGENT_ID: "agent-1",
    PASEO_AGENT_TITLE: "",
    PASEO_WORKSPACE_ID: "workspace-1",
    PASEO_AGENT_CWD: "/repo",
  });
});

it("runs only enabled levels, every non-blank command in order", async () => {
  const { scheduler, runs } = setup({
    codex: {
      warning: { enabled: false, commands: ["skipped"] },
      danger: { enabled: true, commands: ["first", "  ", " second "] },
    },
  });
  scheduler.turnEnded(agent());
  await vi.advanceTimersByTimeAsync(30 * MINUTE);
  expect(runs.map(({ command }) => command)).toEqual(["first", "second"]);
  expect(runs[0]!.env).toBe(runs[1]!.env);
});

it("reads settings when an alert fires", async () => {
  const { scheduler, runs, setSettings } = setup();
  scheduler.turnEnded(agent());
  setSettings(alerts.schema.parse(everyAlert));
  await vi.advanceTimersByTimeAsync(15 * MINUTE);
  expect(runs.map(({ command }) => command)).toEqual(["codex yellow"]);

  setSettings(null);
  await vi.advanceTimersByTimeAsync(15 * MINUTE);
  expect(runs).toHaveLength(1);
});

it("restarts from a later turn end and stops when a turn starts or the agent is archived", async () => {
  const { scheduler, runs } = setup(everyAlert);
  scheduler.turnEnded(agent());
  await vi.advanceTimersByTimeAsync(10 * MINUTE);
  scheduler.turnEnded(agent());
  await vi.advanceTimersByTimeAsync(10 * MINUTE);
  expect(runs).toEqual([]);
  await vi.advanceTimersByTimeAsync(5 * MINUTE);
  expect(runs.map(({ command }) => command)).toEqual(["codex yellow"]);

  scheduler.cancel("agent-1");
  await vi.advanceTimersByTimeAsync(60 * MINUTE);
  expect(runs).toHaveLength(1);
});

it("keeps agents independent", async () => {
  const { scheduler, runs } = setup(everyAlert);
  scheduler.turnEnded(agent({ id: "a" }));
  scheduler.turnEnded(agent({ id: "b", provider: "claude" }));
  scheduler.cancel("b");
  await vi.advanceTimersByTimeAsync(60 * MINUTE);
  expect(runs.map(({ command, env }) => `${env.PASEO_AGENT_ID} ${command}`)).toEqual(["a codex yellow", "a codex red"]);
});

it("ignores unsupported agents and agents without a workspace", async () => {
  const { scheduler, runs, readSettings } = setup(everyAlert);
  scheduler.turnEnded(agent({ provider: "opencode" }));
  scheduler.turnEnded(agent({ id: "b", workspaceId: null }));
  await vi.advanceTimersByTimeAsync(60 * MINUTE);
  expect(runs).toEqual([]);
  expect(readSettings).not.toHaveBeenCalled();
});

it("drops an alert whose schedule is replaced while settings are read", async () => {
  const { scheduler, runs, readSettings } = setup(everyAlert);
  let release!: () => void;
  readSettings.mockImplementationOnce(() => new Promise((resolve) => {
    release = () => resolve(alerts.schema.parse(everyAlert));
  }));
  scheduler.turnEnded(agent());
  await vi.advanceTimersByTimeAsync(15 * MINUTE);
  scheduler.cancel("agent-1");
  release();
  await vi.advanceTimersByTimeAsync(0);
  expect(runs).toEqual([]);
});

it("clears pending alerts and ignores later turns after cleanup", async () => {
  const { scheduler, runs } = setup(everyAlert);
  scheduler.turnEnded(agent());
  scheduler.dispose();
  scheduler.turnEnded(agent({ id: "b" }));
  await vi.advanceTimersByTimeAsync(60 * MINUTE);
  expect(runs).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it("logs settings failures without running commands", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { scheduler, runs, readSettings } = setup(everyAlert);
  readSettings.mockRejectedValueOnce(new Error("offline"));
  scheduler.turnEnded(agent());
  await vi.advanceTimersByTimeAsync(15 * MINUTE);
  expect(runs).toEqual([]);
  expect(error).toHaveBeenCalledWith("[paseo-cache-countdown] Alert failed", expect.any(Error));
  error.mockRestore();
});
