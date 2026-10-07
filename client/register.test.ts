import type { PluginClientContext } from "@getpaseo/plugin/client";
import { beforeEach, expect, it, vi } from "vitest";
import { registerCountdowns } from "./register";

const mocks = vi.hoisted(() => ({ createStore: vi.fn(), components: vi.fn() }));
vi.mock("./countdown-store", () => ({ createCountdownStore: (...args: unknown[]) => mocks.createStore(...args) }));
vi.mock("./pill", () => ({ createPillComponents: (...args: unknown[]) => mocks.components(...args) }));

function harness() {
  let observer: { snapshot: (value: unknown) => void; update: (value: unknown) => void };
  const release = vi.fn(async () => {});
  const unlisten = vi.fn();
  const subscription = {
    subscribe: vi.fn((value) => { observer = value; return unlisten; }), release,
  };
  const registrations: { update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }[] = [];
  const addComposerPill = vi.fn(() => {
    const registration = { update: vi.fn(), remove: vi.fn() };
    registrations.push(registration);
    return registration;
  });
  const list = vi.fn(async (_options?: unknown) => ({ subscription }));
  const client = { paseo: { agents: { list, ref: vi.fn(() => ({ timeline: {} })) } }, addComposerPill };
  return {
    client: client as unknown as PluginClientContext, list, subscription, release, unlisten, registrations, addComposerPill,
    snapshot: (agents: unknown[]) => observer.snapshot({ entries: agents.map((agent) => ({ agent })) }),
    upsert: (agent: unknown) => observer.update({ type: "agent_update", payload: { kind: "upsert", agent } }),
    remove: (agentId: string) => observer.update({ type: "agent_update", payload: { kind: "remove", agentId } }),
  };
}

const codex = { id: "a", workspaceId: "workspace", provider: "codex" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createStore.mockImplementation(() => ({ dispose: vi.fn(), getSnapshot: () => ({ time: "--:--" }) }));
  mocks.components.mockReturnValue({ CountdownIcon: () => null, CountdownDetails: () => null });
});

it("registers supported agents and updates the same pill for countdown ticks", async () => {
  const h = harness();
  const stop = registerCountdowns(h.client);
  await Promise.resolve();
  expect(h.list).toHaveBeenCalledWith(expect.objectContaining({ scope: "active", sync: {}, subscribe: {} }));
  h.snapshot([codex, { ...codex, id: "b", provider: "claude" }, { ...codex, id: "c", provider: "opencode" }, { ...codex, id: "d", workspaceId: null }]);
  expect(h.addComposerPill).toHaveBeenCalledTimes(2);
  expect(h.addComposerPill.mock.calls[0]).toEqual([expect.objectContaining({ id: "cache-countdown", agentId: "a", workspaceId: "workspace" })]);
  h.upsert({ ...codex, title: "Renamed", updatedAt: new Date().toISOString() });
  expect(h.addComposerPill).toHaveBeenCalledTimes(2);
  mocks.createStore.mock.calls[0][2]({ time: "29:59", remainingMs: 1_799_000, clockOffsetMs: 0 });
  expect(h.registrations[0].update).toHaveBeenCalledWith(expect.objectContaining({ label: "Cache 29:59" }));
  stop();
});

it("hides the Cache prefix in every pill label when the setting is turned off", async () => {
  const h = harness();
  const stop = registerCountdowns(h.client);
  await Promise.resolve();
  h.snapshot([codex, { ...codex, id: "b", provider: "claude" }]);
  expect(h.addComposerPill.mock.calls[0]).toEqual([expect.objectContaining({ button: expect.objectContaining({ label: "Cache --:--" }) })]);
  const setShowCachePrefix = mocks.components.mock.calls[0][2] as (show: boolean) => void;
  setShowCachePrefix(false);
  expect(h.registrations[0].update).toHaveBeenCalledWith({ label: "--:--" });
  expect(h.registrations[1].update).toHaveBeenCalledWith({ label: "--:--" });
  mocks.createStore.mock.calls[0][2]({ time: "29:59", remainingMs: 1_799_000, clockOffsetMs: 0 });
  expect(h.registrations[0].update).toHaveBeenLastCalledWith(expect.objectContaining({ label: "29:59" }));
  h.upsert({ ...codex, id: "c" });
  expect(h.addComposerPill.mock.calls[2]).toEqual([expect.objectContaining({ button: expect.objectContaining({ label: "--:--" }) })]);
  setShowCachePrefix(false);
  expect(h.registrations[0].update).toHaveBeenCalledTimes(2);
  setShowCachePrefix(true);
  expect(h.registrations[0].update).toHaveBeenLastCalledWith({ label: "Cache --:--" });
  stop();
});

it("reconciles snapshots, workspace changes, archival, and removals without leaks", async () => {
  const h = harness();
  const stop = registerCountdowns(h.client);
  await Promise.resolve();
  h.snapshot([codex]);
  h.snapshot([codex]);
  expect(h.addComposerPill).toHaveBeenCalledTimes(1);
  h.upsert({ ...codex, workspaceId: "moved" });
  expect(h.registrations[0].remove).toHaveBeenCalledOnce();
  expect(mocks.createStore.mock.results[0].value.dispose).toHaveBeenCalledOnce();
  h.upsert({ ...codex, archivedAt: "2026-10-04T00:00:00Z" });
  expect(h.registrations[1].remove).toHaveBeenCalledOnce();
  h.upsert(codex);
  h.remove(codex.id);
  expect(h.registrations[2].remove).toHaveBeenCalledOnce();
  stop();
  expect(h.unlisten).toHaveBeenCalledOnce();
  expect((h.list.mock.calls[0][0] as { signal: AbortSignal }).signal.aborted).toBe(true);
});

it("releases a bootstrap subscription that resolves after the plugin was unloaded", async () => {
  const h = harness();
  const stop = registerCountdowns(h.client);
  stop();
  await Promise.resolve();
  expect(h.release).toHaveBeenCalledOnce();
  expect(h.subscription.subscribe).not.toHaveBeenCalled();
  expect(h.addComposerPill).not.toHaveBeenCalled();
});

it("re-registers Claude Code agents when they become delegated subagents", async () => {
  const h = harness();
  const stop = registerCountdowns(h.client);
  await Promise.resolve();
  const claude = { ...codex, provider: "claude" };
  h.snapshot([claude]);
  expect(mocks.createStore.mock.calls[0][0]).toBe("claude");
  h.upsert({ ...claude, labels: {} });
  expect(h.addComposerPill).toHaveBeenCalledTimes(1);
  h.upsert({ ...claude, labels: { "paseo.parent-agent-id": "parent" } });
  expect(h.registrations[0].remove).toHaveBeenCalledOnce();
  expect(mocks.createStore.mock.calls[1][0]).toBe("claude-subagent");
  expect(mocks.components.mock.calls[1][0]).toBe("claude-subagent");
  stop();
});
