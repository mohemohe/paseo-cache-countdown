import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { CACHE_PROFILES, getCacheProfile, isCacheProvider, type CacheProfile } from "./countdown";
import { createCountdownStore, type CountdownStore } from "./countdown-store";
import { createPillComponents } from "./pill";

interface AgentTarget {
  id: string;
  workspaceId?: string | null;
  provider: string;
  archivedAt?: string | null;
  labels?: Readonly<Record<string, unknown>> | null;
}

export function registerCountdowns(client: PluginClientContext) {
  const pills = new Map<string, {
    workspaceId: string;
    profile: CacheProfile;
    registration: PluginButtonRegistration;
    store: CountdownStore;
  }>();
  const lifetime = new AbortController();
  let stopped = false;
  let unsubscribe: (() => void) | undefined;

  function remove(agentId: string) {
    const pill = pills.get(agentId);
    if (!pill) return;
    pill.store.dispose();
    pill.registration.remove();
    pills.delete(agentId);
  }

  function register(agent: AgentTarget) {
    if (stopped) return;
    if (!agent.workspaceId || agent.archivedAt || !isCacheProvider(agent.provider)) {
      remove(agent.id);
      return;
    }
    const cacheProfile = getCacheProfile(agent.provider, agent.labels);
    const existing = pills.get(agent.id);
    if (existing?.workspaceId === agent.workspaceId && existing.profile === cacheProfile) return;
    remove(agent.id);

    const profile = CACHE_PROFILES[cacheProfile];
    let registration: PluginButtonRegistration | undefined;
    const store = createCountdownStore(cacheProfile, client.paseo.agents.ref(agent.id).timeline, (snapshot) => {
      registration?.update({
        label: `Cache ${snapshot.time}`,
        title: snapshot.lastMessageAt === null || snapshot.remainingMs === null
          ? `${profile.name} prompt cache countdown`
          : `Cache expired at ${new Date(snapshot.lastMessageAt + profile.durationMs).toLocaleString()}`,
      });
    });
    const { CountdownIcon, CountdownDetails } = createPillComponents(cacheProfile, store);
    registration = client.addComposerPill({
      id: "cache-countdown",
      workspaceId: agent.workspaceId,
      agentId: agent.id,
      button: {
        title: `${profile.name} prompt cache countdown`,
        icon: CountdownIcon,
        label: "Cache --:--",
        behavior: { kind: "popover", Content: CountdownDetails },
      },
    });
    pills.set(agent.id, { workspaceId: agent.workspaceId, profile: cacheProfile, registration, store });
  }

  // Active-directory sync returns a full snapshot, beyond the default 200-row page.
  void client.paseo.agents.list({ scope: "active", sync: {}, subscribe: {}, signal: lifetime.signal }).then(({ subscription }) => {
    if (stopped) {
      void subscription.release().catch(() => {});
      return;
    }
    unsubscribe = subscription.subscribe({
      snapshot: ({ entries }) => {
        const present = new Set(entries.map(({ agent }) => agent.id));
        for (const id of pills.keys()) if (!present.has(id)) remove(id);
        for (const { agent } of entries) register(agent);
      },
      update: (message) => {
        if (message.type !== "agent_update") return;
        if (message.payload.kind === "remove") remove(message.payload.agentId);
        else register(message.payload.agent);
      },
      error: (error) => {
        if (!stopped) console.error("[paseo-cache-countdown] Agent observation failed", error);
      },
    });
  }).catch((error) => {
    if (!stopped) console.error("[paseo-cache-countdown] Agent observation failed", error);
  });

  return () => {
    stopped = true;
    lifetime.abort();
    unsubscribe?.();
    for (const id of pills.keys()) remove(id);
  };
}
