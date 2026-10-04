import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createCountdownStore } from "./countdown-store";

const observation = vi.hoisted(() => ({
  start: vi.fn(), stop: vi.fn(),
  change: (_timestamp: number | null) => {}, error: (_error: unknown) => {},
}));
vi.mock("./message-clock", () => ({ observeLastMessage: (...args: unknown[]) => observation.start(...args) }));
type Timeline = ReturnType<PluginClientContext["paseo"]["agents"]["ref"]>["timeline"];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-04T00:00:00Z"));
  observation.start.mockImplementation((_timeline, change, error) => {
    observation.change = change;
    observation.error = error;
    return observation.stop;
  });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });

it("observes only mounted pills, shares one timer, and cleans up on unmount", () => {
  const update = vi.fn();
  const store = createCountdownStore("codex", {} as Timeline, update);
  expect(observation.start).not.toHaveBeenCalled();
  const stopIcon = store.subscribe(vi.fn());
  const stopDetails = store.subscribe(vi.fn());
  observation.change(Date.now());
  expect(observation.start).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().time).toBe("30:00");
  vi.advanceTimersByTime(1000);
  expect(store.getSnapshot().time).toBe("29:59");
  stopIcon();
  expect(observation.stop).not.toHaveBeenCalled();
  stopDetails();
  expect(observation.stop).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it("recomputes elapsed wall time after suspension and resets on a new message", () => {
  const store = createCountdownStore("claude-subagent", {} as Timeline, vi.fn());
  const stop = store.subscribe(vi.fn());
  observation.change(Date.now());
  vi.setSystemTime(new Date("2026-10-04T00:04:30Z"));
  store.refresh();
  expect(store.getSnapshot()).toMatchObject({ time: "00:30", tone: "danger" });
  observation.change(Date.now());
  expect(store.getSnapshot()).toMatchObject({ time: "05:00", tone: "success" });
  stop();
});

it("distinguishes read failures from a fresh cache and can recover", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const store = createCountdownStore("claude-subagent", {} as Timeline, vi.fn());
  store.subscribe(vi.fn());
  observation.change(Date.now());
  observation.error(new Error("offline"));
  expect(store.getSnapshot()).toMatchObject({ time: "--:--", status: "error" });
  observation.change(Date.now());
  expect(store.getSnapshot()).toMatchObject({ time: "05:00", status: "ready" });
  store.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
