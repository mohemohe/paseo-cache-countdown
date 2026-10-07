import { expect, it, vi } from "vitest";
import type { CountdownStore } from "./countdown-store";
import {
  createSessionDirectory,
  groupSessions,
  matchesSessionQuery,
  sessionLocation,
  sortByRemaining,
  type CountdownSession,
} from "./sessions";

function session(id: string, overrides: Partial<CountdownSession> = {}): CountdownSession {
  return {
    id, serverId: null, workspaceId: "w1", profile: "codex", title: id, projectName: "app", workspaceName: null,
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

it("keeps the same workspace ID on different hosts apart and prefixes host names", () => {
  const groups = groupSessions([
    session("a"),
    session("b", { serverId: "remote", projectName: "docs" }),
    session("c"),
  ], ({ serverId }) => serverId === null ? "This Mac" : "Build server");
  expect(groups.map(({ key, label, sessions }) => [key, label, sessions.map(({ id }) => id)])).toEqual([
    ["\nw1", "This Mac · app", ["a", "c"]],
    ["remote\nw1", "Build server · docs", ["b"]],
  ]);
});

it("matches a trimmed, case-insensitive query against titles, projects, and workspaces", () => {
  const named = session("a", { title: "Fix Login Flow", projectName: "Mobile", workspaceName: "feature-auth" });
  expect(matchesSessionQuery(named, "  ")).toBe(true);
  expect(matchesSessionQuery(named, " login ")).toBe(true);
  expect(matchesSessionQuery(named, "MOBI")).toBe(true);
  expect(matchesSessionQuery(named, "auth")).toBe(true);
  expect(matchesSessionQuery(named, "desktop")).toBe(false);
  expect(matchesSessionQuery(session("b", { title: null, projectName: null }), "untitled")).toBe(true);
});

it("orders running caches by least time remaining, then expired, then unknown", () => {
  const withRemaining = (id: string, remainingMs: number | null) => session(id, {
    store: { getSnapshot: () => ({ remainingMs }) } as unknown as CountdownStore,
  });
  const sorted = sortByRemaining([
    withRemaining("unknown", null), withRemaining("expired-a", 0), withRemaining("long", 600_000),
    withRemaining("short", 30_000), withRemaining("expired-b", 0),
  ]);
  expect(sorted.map(({ id }) => id)).toEqual(["short", "long", "expired-a", "expired-b", "unknown"]);
});

it("labels a location with its host when a host label is supplied", () => {
  const remote = session("a", { serverId: "remote", projectName: "docs", workspaceName: "main" });
  expect(sessionLocation(remote)).toBe("docs · main");
  expect(sessionLocation(remote, () => "Build server")).toBe("Build server · docs · main");
});
