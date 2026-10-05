/** Keeps daemon event ordering separate from the client's wall clock. */
export function createActivityClock() {
  let epoch: string | undefined;
  let timestamp: number | null = null;
  let offsetMs = 0;

  return {
    getSnapshot: () => ({ epoch, timestamp, offsetMs }),
    setEpoch(nextEpoch: string | undefined) {
      epoch = nextEpoch;
    },
    replaceEpoch(nextEpoch: string) {
      epoch = nextEpoch;
      timestamp = null;
      // The host's clock is still the same after replacing a conversation.
    },
    record(nextTimestamp: number, receivedAt?: number) {
      if (timestamp !== null && nextTimestamp <= timestamp) return;
      timestamp = nextTimestamp;
      // History cannot tell us the daemon's current time. A new live activity
      // anchors its source time to receipt time, including transport latency.
      if (receivedAt !== undefined) offsetMs = receivedAt - nextTimestamp;
    },
  };
}

export type ActivityClock = ReturnType<typeof createActivityClock>;
