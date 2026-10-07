import { expect, it, vi } from "vitest";
import type { CountdownStore } from "./countdown-store";
import { createSessionDirectory, groupSessions, type CountdownSession } from "./sessions";

function session(id: string, overrides: Partial<CountdownSession> = {}): CountdownSession {
  return {
    id, workspaceId: "w1", profile: "codex", title: id, projectName: "app", workspaceName: null,
    createdAt: "2026-10-01T00:00:00Z", store: {} as CountdownStore, ...overrides,
  };
}

it("publishes sessions newest first and notifies until unsubscribed", () => {
  const directory = createSessionDirectory();
  const listener = vi.fn();
  const unsubscribe = directory.subscribe(listener);
  directory.publish([session("old"), session("new", { createdAt: "2026-10-02T00:00:00Z" })]);
  expect(directory.getSnapshot().map(({ id }) => id)).toEqual(["new", "old"]);
  expect(listener).toHaveBeenCalledOnce();
  unsubscribe();
  directory.publish([]);
  expect(listener).toHaveBeenCalledOnce();
  expect(directory.getSnapshot()).toEqual([]);
});

it("groups by workspace in session order and labels groups by project and workspace", () => {
  const groups = groupSessions([
    session("a", { workspaceId: "w2", projectName: "app", workspaceName: "feature" }),
    session("b"),
    session("c", { workspaceId: "w2", projectName: "app", workspaceName: "feature" }),
    session("d", { workspaceId: "w3", projectName: null, workspaceName: null }),
    session("e", { workspaceId: "w4", workspaceName: "app" }),
  ]);
  expect(groups.map(({ workspaceId, label, sessions }) => [workspaceId, label, sessions.map(({ id }) => id)])).toEqual([
    ["w2", "app · feature", ["a", "c"]],
    ["w1", "app", ["b"]],
    ["w3", "w3", ["d"]],
    ["w4", "app", ["e"]],
  ]);
});
