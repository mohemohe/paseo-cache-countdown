import type { PluginClientContext } from "@getpaseo/plugin/client";
import { beforeEach, expect, it, vi } from "vitest";
import { observeCountdownSessions } from "./session-observer";
import { createSessionDirectory } from "./sessions";

const mocks = vi.hoisted(() => ({ createStore: vi.fn() }));
vi.mock("./countdown-store", () => ({ createCountdownStore: (...args: unknown[]) => mocks.createStore(...args) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createStore.mockImplementation(() => ({ dispose: vi.fn(), getSnapshot: () => ({ time: "--:--" }) }));
});

it("observes a borrowed host without attachments and releases its stores", async () => {
  let observer: { snapshot: (value: unknown) => void } | undefined;
  const unlisten = vi.fn();
  const subscription = { subscribe: vi.fn((value) => { observer = value; return unlisten; }), release: vi.fn(async () => {}) };
  const ref = vi.fn((_id: string) => ({ timeline: { id: _id } }));
  const paseo = { agents: { list: vi.fn(async () => ({ subscription })), ref } } as unknown as PluginClientContext["paseo"];
  const directory = createSessionDirectory();
  const stop = observeCountdownSessions(paseo, directory, { serverId: "remote" });
  await Promise.resolve();
  observer?.snapshot({ entries: [
    { agent: { id: "a", workspaceId: "w", provider: "codex", title: "Remote", createdAt: "2026-10-01T00:00:00Z" }, project: { projectName: "docs" } },
    { agent: { id: "b", workspaceId: "w", provider: "opencode" } },
  ] });
  expect(ref).toHaveBeenCalledWith("a");
  expect(mocks.createStore.mock.calls[0][1]).toEqual({ id: "a" });
  expect(directory.getSnapshot()).toEqual([expect.objectContaining({ id: "a", serverId: "remote", title: "Remote", projectName: "docs" })]);
  stop();
  expect(unlisten).toHaveBeenCalledOnce();
  expect(mocks.createStore.mock.results[0].value.dispose).toHaveBeenCalledOnce();
  expect(directory.getSnapshot()).toEqual([]);
});
