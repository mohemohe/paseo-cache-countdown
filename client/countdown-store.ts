import type { PluginClientContext } from "@getpaseo/plugin/client";
import { getCountdown, type CacheProfile, type Countdown } from "./countdown";
import { observeLastMessage } from "./message-clock";

type Timeline = ReturnType<PluginClientContext["paseo"]["agents"]["ref"]>["timeline"];

export interface CountdownSnapshot extends Countdown {
  lastMessageAt: number | null;
  status: "loading" | "ready" | "error";
}

/** Observes history only while an icon or its popover is mounted. */
export function createCountdownStore(
  profile: CacheProfile,
  timeline: Timeline,
  onChange: (snapshot: CountdownSnapshot) => void,
) {
  let lastMessageAt: number | null = null;
  let status: CountdownSnapshot["status"] = "loading";
  let snapshot: CountdownSnapshot = {
    ...getCountdown(profile, lastMessageAt, Date.now()), lastMessageAt, status,
  };
  let stopObserving: (() => void) | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  const listeners = new Set<() => void>();

  function refresh() {
    if (disposed) return;
    const next = {
      ...getCountdown(profile, status === "error" ? null : lastMessageAt, Date.now()),
      lastMessageAt, status,
    };
    if (next.remainingMs === snapshot.remainingMs && next.lastMessageAt === snapshot.lastMessageAt && next.status === snapshot.status) return;
    snapshot = next;
    onChange(snapshot);
    for (const listener of listeners) listener();
  }

  function start() {
    status = "loading";
    refresh();
    stopObserving = observeLastMessage(timeline, (timestamp) => {
      lastMessageAt = timestamp;
      status = "ready";
      refresh();
    }, (error) => {
      status = "error";
      console.error("[paseo-cache-countdown] Message observation failed", error);
      refresh();
    });
    timer = setInterval(refresh, 1_000);
  }

  function stop() {
    stopObserving?.();
    stopObserving = undefined;
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
    refresh,
    dispose() {
      disposed = true;
      stop();
      listeners.clear();
    },
  };
}

export type CountdownStore = ReturnType<typeof createCountdownStore>;
