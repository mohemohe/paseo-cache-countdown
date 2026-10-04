import { describe, expect, it } from "vitest";
import { CACHE_PROFILES, getCacheProfile, getCountdown, isCacheProvider } from "./countdown";

const sentAt = Date.parse("2026-10-04T00:00:00Z");

const expected = {
  codex: { full: "30:00", afterMinute: "28:59" },
  claude: { full: "60:00", afterMinute: "58:59" },
  "claude-subagent": { full: "05:00", afterMinute: "03:59" },
} as const;

describe.each(["codex", "claude", "claude-subagent"] as const)("%s countdown", (provider) => {
  const duration = CACHE_PROFILES[provider].durationMs;

  it("uses the requested provider duration and wall clock", () => {
    expect(getCountdown(provider, sentAt, sentAt)).toMatchObject({
      time: expected[provider].full, fraction: 1, tone: "success",
    });
    expect(getCountdown(provider, sentAt, sentAt + 61_000)).toMatchObject({
      time: expected[provider].afterMinute,
    });
  });

  it("turns yellow at exactly half and red at exactly one eighth remaining", () => {
    expect(getCountdown(provider, sentAt, sentAt + duration / 2 - 1).tone).toBe("success");
    expect(getCountdown(provider, sentAt, sentAt + duration / 2).tone).toBe("warning");
    expect(getCountdown(provider, sentAt, sentAt + duration * 7 / 8 - 1).tone).toBe("warning");
    expect(getCountdown(provider, sentAt, sentAt + duration * 7 / 8).tone).toBe("danger");
  });

  it("clamps expiration and future timestamps without negative or oversized rings", () => {
    expect(getCountdown(provider, sentAt, sentAt + duration + 99_000)).toMatchObject({ time: "00:00", fraction: 0, tone: "danger" });
    expect(getCountdown(provider, sentAt, sentAt - 60_000).fraction).toBe(1);
    expect(getCountdown(provider, sentAt, sentAt + duration - 1).time).toBe("00:01");
  });

  it("does not invent a fresh cache without a valid message", () => {
    expect(getCountdown(provider, null, sentAt)).toMatchObject({ time: "--:--", tone: "unknown" });
    expect(getCountdown(provider, NaN, sentAt).time).toBe("--:--");
  });
});

it("only supports the real Codex and Claude Code provider IDs", () => {
  expect(isCacheProvider("codex")).toBe(true);
  expect(isCacheProvider("claude")).toBe(true);
  expect(isCacheProvider("opencode")).toBe(false);
});

it("uses the subagent duration only for delegated Claude Code agents", () => {
  const delegated = { "paseo.parent-agent-id": "parent" };
  expect(getCacheProfile("claude", {})).toBe("claude");
  expect(getCacheProfile("claude", undefined)).toBe("claude");
  expect(getCacheProfile("claude", { "paseo.parent-agent-id": " " })).toBe("claude");
  expect(getCacheProfile("claude", delegated)).toBe("claude-subagent");
  expect(getCacheProfile("codex", delegated)).toBe("codex");
});
