import type { PluginClientContext } from "@getpaseo/plugin/client";

type Timeline = ReturnType<PluginClientContext["paseo"]["agents"]["ref"]>["timeline"];
type TimelineUpdate = Parameters<Parameters<Timeline["subscribe"]>[0]>[0];
type TimelinePage = Awaited<ReturnType<Timeline["refetch"]>>;

function activityTimestamp(item: TimelinePage["entries"][number]["item"], timestamp: string): number | null {
  // Only terminal tool results refresh the estimate; a running tool can produce
  // local output for a long time without sending a result back to the model.
  if (item.type === "tool_call") {
    if (item.status !== "completed" && item.status !== "failed") return null;
  } else if (item.type !== "user_message" && item.type !== "assistant_message") {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Observe messages and completed/failed tool results, but not agent metadata. */
export function observeLastMessage(
  timeline: Timeline,
  onChange: (timestamp: number | null) => void,
  onError: (error: unknown) => void,
): () => void {
  let stopped = false;
  let generation = 0;
  let subscriptionGeneration = 0;
  let epoch: string | undefined;
  let historyTimestamp: number | null = null;
  let live: { timestamp: number; epoch?: string } | null = null;
  let liveRevision = 0;
  let reported: number | null | undefined;
  let subscription: ReturnType<Timeline["subscribe"]> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryKind: "history" | "subscription" | undefined;
  let retryAttempt = 0;

  const cancelRetry = () => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    retryKind = undefined;
  };

  const scheduleRetry = (kind: "history" | "subscription") => {
    if (stopped) return;
    // Losing live delivery takes precedence over retrying a history read.
    if (retryTimer !== undefined) {
      if (kind === "subscription") retryKind = kind;
      return;
    }
    retryKind = kind;
    const delay = Math.min(1_000 * 2 ** retryAttempt, 30_000);
    retryAttempt = Math.min(retryAttempt + 1, 5);
    retryTimer = setTimeout(() => {
      const pendingKind = retryKind;
      retryTimer = undefined;
      retryKind = undefined;
      if (stopped) return;
      if (pendingKind === "subscription") startSubscription();
      else void synchronize();
    }, delay);
  };

  const publish = (force = false) => {
    if (stopped) return;
    const timestamp = live
      ? Math.max(historyTimestamp ?? live.timestamp, live.timestamp)
      : historyTimestamp;
    if (force || timestamp !== reported) {
      reported = timestamp;
      onChange(timestamp);
    }
  };

  const resetEpoch = (nextEpoch: string) => {
    epoch = nextEpoch;
    historyTimestamp = null;
    live = null;
    publish();
  };

  const synchronize = async () => {
    if (stopped) return;
    if (retryKind === "history") cancelRetry();
    const currentGeneration = ++generation;
    const liveRevisionAtStart = liveRevision;
    let limit = 100;
    let previousStart: TimelinePage["startCursor"] = null;
    let pageEpoch: string | undefined;
    try {
      while (!stopped && currentGeneration === generation) {
        const page = await timeline.refetch({
          direction: "tail",
          projection: "projected",
          limit,
        });
        if (stopped || currentGeneration !== generation) return;
        if (page.error) throw new Error(page.error);

        // A message received after this RPC began is stronger evidence of the
        // current epoch than the RPC's potentially older snapshot.
        if (epoch !== undefined && page.epoch !== epoch && liveRevision > liveRevisionAtStart) {
          void synchronize();
          return;
        }

        // A replacement during pagination invalidates every older cursor.
        if (pageEpoch !== undefined && page.epoch !== pageEpoch) {
          resetEpoch(page.epoch);
          void synchronize();
          return;
        }
        pageEpoch = page.epoch;
        if (epoch !== undefined && epoch !== page.epoch) resetEpoch(page.epoch);
        epoch = page.epoch;

        let newest: number | null = null;
        for (const entry of page.entries) {
          const timestamp = activityTimestamp(entry.item, entry.timestamp);
          if (timestamp !== null) newest = Math.max(newest ?? timestamp, timestamp);
        }
        if (newest !== null || !page.hasOlder) {
          historyTimestamp = newest;
          // Live messages can arrive while the history RPC is still pending.
          // Keep those from this epoch, even if the response predates them.
          if (live?.epoch !== undefined && live.epoch !== page.epoch) live = null;
          retryAttempt = 0;
          cancelRetry();
          publish(true); // Also clears a caller's previous synchronization error.
          return;
        }

        // Projected tool rows keep their original position but their timestamp
        // and seqEnd change on completion. Tail expands to include those rows;
        // "before" pages do not. Grow the tail to preserve that guarantee.
        const nextStart = page.startCursor;
        if (
          !nextStart ||
          (previousStart?.epoch === nextStart.epoch && nextStart.seq >= previousStart.seq)
        ) {
          throw new Error("Timeline history did not expand to older entries.");
        }
        previousStart = nextStart;
        limit *= 2;
      }
    } catch (error) {
      if (!stopped && currentGeneration === generation) {
        onError(error);
        scheduleRetry("history");
      }
    }
  };

  const failSubscription = (error: unknown, currentSubscription: number) => {
    if (stopped || currentSubscription !== subscriptionGeneration) return;
    subscriptionGeneration++;
    generation++;
    const failed = subscription;
    subscription = undefined;
    void failed?.release().catch(() => {});
    onError(error);
    scheduleRetry("subscription");
  };

  const receive = (update: TimelineUpdate, currentSubscription: number) => {
    if (stopped || currentSubscription !== subscriptionGeneration) return;
    const { event } = update;
    if (event.type === "replacement") {
      resetEpoch(event.epoch);
      void synchronize();
    } else if (event.type === "subscription_restored") {
      void synchronize();
    } else if (event.type === "error") {
      failSubscription(new Error(event.error), currentSubscription);
    } else if (event.type === "timeline" && "timestamp" in update) {
      const timestamp = activityTimestamp(event.item, update.timestamp);
      if (timestamp === null) return;
      liveRevision++;
      if (update.epoch && epoch !== undefined && update.epoch !== epoch) {
        resetEpoch(update.epoch);
        void synchronize();
      }
      epoch = update.epoch ?? epoch;
      if (!live || timestamp > live.timestamp) live = { timestamp, epoch: update.epoch };
      publish(true);
    }
  };

  function startSubscription() {
    if (stopped) return;
    cancelRetry();
    const currentSubscription = ++subscriptionGeneration;
    generation++;
    try {
      const created = timeline.subscribe((update) => receive(update, currentSubscription));
      // A host may synchronously report an error from subscribe(). Always
      // handle ready, but do not retain that already-invalidated subscription.
      void created.ready.then(
        () => {
          if (!stopped && currentSubscription === subscriptionGeneration) void synchronize();
        },
        (error: unknown) => failSubscription(error, currentSubscription),
      );
      if (stopped || currentSubscription !== subscriptionGeneration) {
        void created.release().catch(() => {});
      } else {
        subscription = created;
      }
    } catch (error) {
      failSubscription(error, currentSubscription);
    }
  }

  startSubscription();

  return () => {
    if (stopped) return;
    stopped = true;
    generation++;
    subscriptionGeneration++;
    cancelRetry();
    // The SDK owns transport reconnection; release prevents future restoration.
    void subscription?.release().catch(() => {});
  };
}
