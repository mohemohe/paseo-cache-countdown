import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { CACHE_PROFILES } from "./countdown";
import type { CountdownStore } from "./countdown-store";
import { createPillComponents } from "./pill";
import { observeCountdownSessions } from "./session-observer";
import { createSessionDirectory, type SessionDirectory } from "./sessions";

export function registerCountdowns(client: PluginClientContext, directory: SessionDirectory = createSessionDirectory()) {
  const pills = new Set<{ registration: PluginButtonRegistration; store: CountdownStore }>();
  let stopped = false;
  let showCachePrefix = true;

  function label(time: string) {
    return showCachePrefix ? `Cache ${time}` : time;
  }

  function setShowCachePrefix(show: boolean) {
    if (stopped || show === showCachePrefix) return;
    showCachePrefix = show;
    for (const pill of pills) pill.registration.update({ label: label(pill.store.getSnapshot().time) });
  }

  const stopObserving = observeCountdownSessions(client.paseo, directory, {
    attach(session) {
      const profile = CACHE_PROFILES[session.profile];
      const { CountdownIcon, CountdownDetails } = createPillComponents(session.profile, session.store, setShowCachePrefix);
      const registration = client.addComposerPill({
        id: "cache-countdown",
        workspaceId: session.workspaceId,
        agentId: session.id,
        button: {
          title: `${profile.name} prompt cache countdown`,
          icon: CountdownIcon,
          label: label(session.store.getSnapshot().time),
          behavior: { kind: "popover", Content: CountdownDetails },
        },
      });
      const pill = { registration, store: session.store };
      pills.add(pill);
      return {
        update(snapshot) {
          registration.update({
            label: label(snapshot.time),
            title: snapshot.lastMessageAt === null || snapshot.remainingMs === null
              ? `${profile.name} prompt cache countdown`
              : `Cache expired at ${new Date(snapshot.lastMessageAt + snapshot.clockOffsetMs + profile.durationMs).toLocaleString()}`,
          });
        },
        detach() {
          pills.delete(pill);
          registration.remove();
        },
      };
    },
  });

  return () => {
    stopped = true;
    stopObserving();
  };
}
