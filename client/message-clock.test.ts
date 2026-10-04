import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeLastMessage } from "./message-clock";

type Timeline = Parameters<typeof observeLastMessage>[0];
type Update = Parameters<Parameters<Timeline["subscribe"]>[0]>[0];
type Page = Awaited<ReturnType<Timeline["refetch"]>>;
type Entry = Page["entries"][number];
type ToolEntry = Entry & { item: Extract<Entry["item"], { type: "tool_call" }> };

const origin = Date.parse("2026-10-04T00:00:00Z");
const timestamp = (seconds: number) => new Date(origin + seconds * 1_000).toISOString();
const text = (type: "user_message" | "assistant_message" | "reasoning", seconds: number): Entry => ({
  provider: "codex",
  item: { type, text: "message" },
  timestamp: timestamp(seconds),
  seqStart: seconds,
  seqEnd: seconds,
  sourceSeqRanges: [{ startSeq: seconds, endSeq: seconds }],
  collapsed: [],
});
const tool = (
  seconds: number,
  status: "running" | "completed" | "failed" | "canceled" = "completed",
  callId = "shell-1",
): ToolEntry => ({
  ...text("reasoning", seconds),
  item: {
    type: "tool_call",
    callId,
    name: "shell",
    ...(status === "failed" ? { status, error: "Tool failed" } : { status, error: null }),
    detail: { type: "plain_text", text: "done" },
  },
});
const page = (entries: Entry[], overrides: Partial<Page> = {}): Page => ({
  requestId: "request",
  agentId: "agent",
  agent: null,
  direction: "tail",
  projection: "projected",
  epoch: "epoch-1",
  reset: false,
  staleCursor: false,
  gap: false,
  window: { minSeq: 1, maxSeq: 100, nextSeq: 101 },
  startCursor: { epoch: "epoch-1", seq: entries[0]?.seqStart ?? 0 },
  endCursor: { epoch: "epoch-1", seq: entries.at(-1)?.seqEnd ?? 0 },
  hasOlder: false,
  hasNewer: false,
  entries,
  error: null,
  ...overrides,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
async function settle() {
  for (let count = 0; count < 10; count++) await Promise.resolve();
}
function setup(ready: Promise<void> | (() => Promise<void>) = Promise.resolve()) {
  let receiver!: (update: Update) => void;
  const receivers: ((update: Update) => void)[] = [];
  const release = vi.fn(async () => {});
  const timeline: Timeline = {
    subscribe: vi.fn((handler) => {
      receiver = handler;
      receivers.push(handler);
      return Object.assign(vi.fn(), {
        ready: typeof ready === "function" ? ready() : ready,
        release,
        subscriptionId: `subscription-${receivers.length}`,
      });
    }),
    refetch: vi.fn<Timeline["refetch"]>().mockResolvedValue(page([])),
    append: vi.fn(),
  };
  const onChange = vi.fn<(value: number | null) => void>();
  const onError = vi.fn<(error: unknown) => void>();
  const start = () => observeLastMessage(timeline, onChange, onError);
  const emit = (update: Update) => receiver(update);
  const emitEntry = (entry: Entry, epoch = "epoch-1") => emit({
    agentId: "agent",
    timestamp: entry.timestamp,
    epoch,
    seq: entry.seqEnd,
    event: { type: "timeline", provider: entry.provider, item: entry.item },
  });
  return { timeline, refetch: vi.mocked(timeline.refetch), receivers, release, onChange, onError, start, emit, emitEntry };
}

describe("observeLastMessage", () => {
  it("hydrates from messages and tool results while excluding reasoning and turn metadata", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([
      text("user_message", 10), text("assistant_message", 20), tool(40), text("reasoning", 45),
    ]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 40_000);
    mock.emitEntry(tool(50));
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    mock.emitEntry(text("reasoning", 60));
    mock.emit({
      agentId: "agent",
      timestamp: timestamp(70),
      event: { type: "turn_completed", provider: "codex" },
    });
    expect(mock.onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it("expands the tail until it finds a message or terminal tool result", async () => {
    const mock = setup();
    mock.refetch
      .mockResolvedValueOnce(page([text("reasoning", 200)], { hasOlder: true }))
      .mockResolvedValueOnce(page([text("reasoning", 100)], { hasOlder: true }))
      .mockResolvedValueOnce(page([text("user_message", 10)], { hasOlder: true }));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    expect(mock.refetch.mock.calls.map(([options]) => options?.direction)).toEqual(["tail", "tail", "tail"]);
    expect(mock.refetch.mock.calls.map(([options]) => options?.limit)).toEqual([100, 200, 400]);
    expect(mock.refetch).toHaveBeenCalledTimes(3);
    stop();
  });

  it("reports null when there has not been a valid message", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([
      { ...text("assistant_message", 10), timestamp: "invalid" },
      { ...tool(20), timestamp: "invalid" }, text("reasoning", 30),
    ]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(null);
    stop();
  });

  it("does not replace a new live message with an older pending history result", async () => {
    const mock = setup();
    const history = deferred<Page>();
    mock.refetch.mockReturnValue(history.promise);
    const stop = mock.start();
    await settle();
    mock.emitEntry(text("assistant_message", 50));
    history.resolve(page([text("user_message", 10)]));
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    stop();
  });

  it.each(["codex", "claude"])("updates only for completed and failed %s tool results", async (provider) => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([text("assistant_message", 10)]));
    const stop = mock.start();
    await settle();
    let lastActivity = 10;
    for (const [index, status] of (["running", "completed", "failed", "canceled"] as const).entries()) {
      const seconds = (index + 2) * 10;
      const entry = tool(seconds, status);
      mock.emit({
        agentId: "agent", timestamp: entry.timestamp, epoch: "epoch-1", seq: seconds,
        event: { type: "timeline", provider, item: entry.item },
      });
      if (status === "completed" || status === "failed") lastActivity = seconds;
      expect(mock.onChange).toHaveBeenLastCalledWith(origin + lastActivity * 1_000);
    }
    expect(mock.onChange).toHaveBeenCalledTimes(3);
    // New local output and a delayed result must not move the origin.
    mock.emitEntry(tool(60, "running"));
    mock.emitEntry(tool(20, "completed"));
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 40_000);
    stop();
  });

  it.each(["running", "canceled"] as const)("ignores %s tools when restoring history", async (status) => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([text("assistant_message", 10), tool(50, status)]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    stop();
  });

  it.each(["codex", "claude"])("tracks interleaved parallel %s results without waiting for all calls", async (provider) => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([text("user_message", 1)]));
    const stop = mock.start();
    await settle();
    const emitTool = (seconds: number, status: Parameters<typeof tool>[1], callId: string) => {
      mock.emitEntry({ ...tool(seconds, status, callId), provider });
    };

    emitTool(10, "running", "a");
    emitTool(11, "running", "b");
    emitTool(12, "running", "c");
    expect(mock.onChange).toHaveBeenCalledTimes(1);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 1_000);

    emitTool(20, "completed", "b");
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 20_000);
    emitTool(25, "failed", "a");
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 25_000);
    emitTool(30, "running", "c");
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 25_000);
    emitTool(35, "completed", "c");
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 35_000);

    // Delayed/duplicate results retain the event timestamp, not their arrival time.
    emitTool(20, "completed", "b");
    emitTool(25, "failed", "a");
    emitTool(35, "completed", "c");
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 35_000);
    stop();
  });

  it("hydrates the latest parallel terminal result regardless of row order or running calls", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([
      { ...tool(50, "completed", "a"), seqStart: 1 },
      { ...tool(30, "failed", "b"), seqStart: 2 },
      { ...tool(80, "running", "c"), seqStart: 3 },
      { ...tool(90, "canceled", "d"), seqStart: 4 },
    ]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    stop();
  });

  it.each(["completed", "failed"] as const)("accepts a grouped %s result if exposed as one normalized tool event", async (status) => {
    const mock = setup();
    const stop = mock.start();
    await settle();
    const grouped = tool(50, status, "parallel-group");
    mock.emitEntry({
      ...grouped,
      item: {
        ...grouped.item,
        detail: { type: "unknown", input: ["tool-a", "tool-b"], output: ["result-a", "result-b"] },
      },
    });
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    stop();
  });

  it("restores failed tool results without a later assistant message", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([tool(50, "failed"), tool(60, "running")]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    stop();
  });

  it("finds a late tool result anchored before the visible tail after many ignored updates", async () => {
    const mock = setup();
    mock.refetch
      .mockResolvedValueOnce(page([text("reasoning", 251)], { hasOlder: true }))
      .mockResolvedValueOnce(page([text("reasoning", 151)], { hasOlder: true }))
      .mockResolvedValueOnce(page([
        { ...tool(150), seqStart: 1, seqEnd: 150, sourceSeqRanges: [{ startSeq: 1, endSeq: 1 }, { startSeq: 150, endSeq: 150 }] },
        text("assistant_message", 100), text("reasoning", 350),
      ]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 150_000);
    expect(mock.refetch.mock.calls.map(([options]) => [options?.direction, options?.limit])).toEqual([
      ["tail", 100], ["tail", 200], ["tail", 400],
    ]);
    stop();
  });

  it("reports stalled tail expansion instead of fetching forever", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([tool(50, "running")], { hasOlder: true }));
    const stop = mock.start();
    await settle();
    expect(mock.refetch).toHaveBeenCalledTimes(2);
    expect(mock.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Timeline history did not expand to older entries." }));
    expect(mock.onChange).not.toHaveBeenCalled();
    stop();
  });

  it("restores the latest tool result even when its projected row began before later messages", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([
      { ...tool(300), seqStart: 1, seqEnd: 300, sourceSeqRanges: [{ startSeq: 1, endSeq: 1 }, { startSeq: 300, endSeq: 300 }] },
      text("assistant_message", 200), text("reasoning", 310),
    ]));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 300_000);
    expect(mock.refetch).toHaveBeenCalledWith({ direction: "tail", projection: "projected", limit: 100 });
    stop();
  });

  it("keeps live tool completion newer than pending history and rehydrates after reconnect", async () => {
    const mock = setup();
    const pending = deferred<Page>();
    mock.refetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page([tool(90)]));
    const stop = mock.start();
    await settle();
    mock.emitEntry(tool(50));
    pending.resolve(page([text("assistant_message", 10), tool(20, "running")]));
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    mock.emit({ agentId: "agent", subscriptionId: "restored", event: { type: "subscription_restored" } });
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 90_000);
    stop();
  });

  it("keeps a live message received before subscription readiness", async () => {
    const ready = deferred<void>();
    const mock = setup(ready.promise);
    const stop = mock.start();
    mock.emitEntry(text("assistant_message", 50));
    expect(mock.refetch).not.toHaveBeenCalled();
    ready.resolve();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    stop();
  });

  it("keeps a new live epoch when the bootstrap snapshot belongs to an older epoch", async () => {
    const mock = setup();
    const pending = deferred<Page>();
    mock.refetch.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(page(
      [text("user_message", 10)], { epoch: "epoch-2" },
    ));
    const stop = mock.start();
    await settle();
    mock.emitEntry(text("assistant_message", 50), "epoch-2");
    pending.resolve(page([text("assistant_message", 100)]));
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 50_000);
    expect(mock.refetch).toHaveBeenCalledTimes(2);
    stop();
  });

  it("updates for both user messages and each assistant streaming chunk", async () => {
    const mock = setup();
    const stop = mock.start();
    await settle();
    mock.emitEntry(text("user_message", 10));
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    mock.emitEntry(text("assistant_message", 20));
    mock.emitEntry(text("assistant_message", 30));
    mock.emitEntry(text("assistant_message", 20));
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 30_000);
    stop();
  });

  it("replaces the old epoch and ignores a history request that completes late", async () => {
    const mock = setup();
    const oldHistory = deferred<Page>();
    mock.refetch.mockReturnValueOnce(oldHistory.promise).mockResolvedValueOnce(page(
      [text("user_message", 5)], { epoch: "epoch-2" },
    ));
    const stop = mock.start();
    await settle();
    mock.emitEntry(text("assistant_message", 50));
    mock.emit({ agentId: "agent", event: { type: "replacement", epoch: "epoch-2" } });
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 5_000);
    oldHistory.resolve(page([text("assistant_message", 100)]));
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 5_000);
    stop();
  });

  it("resynchronizes after reconnect and reports unchanged values after recovery", async () => {
    const mock = setup();
    const original = page([text("assistant_message", 10)]);
    mock.refetch.mockResolvedValueOnce(original).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(original);
    const stop = mock.start();
    await settle();
    const reconnect = () => mock.emit({
      agentId: "agent", subscriptionId: "new", event: { type: "subscription_restored" },
    });
    reconnect();
    await settle();
    expect(mock.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "offline" }));
    reconnect();
    await settle();
    expect(mock.onChange).toHaveBeenCalledTimes(2);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    stop();
  });

  it("restarts at the tail when history pagination changes epoch", async () => {
    const mock = setup();
    mock.refetch
      .mockResolvedValueOnce(page([text("reasoning", 100)], { hasOlder: true }))
      .mockResolvedValueOnce(page([text("user_message", 10)], { epoch: "epoch-2" }))
      .mockResolvedValueOnce(page([text("assistant_message", 20)], { epoch: "epoch-2" }));
    const stop = mock.start();
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 20_000);
    expect(mock.refetch.mock.calls.map(([options]) => options?.limit)).toEqual([100, 200, 100]);
    stop();
  });

  it("stops once, ignores pending history, and ignores late live events", async () => {
    const mock = setup();
    const pending = deferred<Page>();
    mock.refetch.mockReturnValue(pending.promise);
    const stop = mock.start();
    await settle();
    stop();
    stop();
    pending.resolve(page([text("assistant_message", 10)]));
    mock.emitEntry(text("user_message", 20));
    await settle();
    expect(mock.release).toHaveBeenCalledTimes(1);
    expect(mock.onChange).not.toHaveBeenCalled();
    expect(mock.onError).not.toHaveBeenCalled();
  });

  it("does not fetch history when stopped during subscription bootstrap", async () => {
    const ready = deferred<void>();
    const mock = setup(ready.promise);
    mock.start()();
    ready.resolve();
    await settle();
    expect(mock.refetch).not.toHaveBeenCalled();
    expect(mock.release).toHaveBeenCalledTimes(1);
  });

  it("reports subscription and history errors without claiming an empty history", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([], { error: "history unavailable" }));
    const stop = mock.start();
    await settle();
    expect(mock.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "history unavailable" }));
    mock.emit({ agentId: "agent", event: { type: "error", error: "subscription stopped" } });
    expect(mock.onError).toHaveBeenLastCalledWith(expect.objectContaining({ message: "subscription stopped" }));
    expect(mock.onChange).not.toHaveBeenCalled();
    stop();
  });
});

describe("observation recovery", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries a failed history fetch while retaining its live subscription", async () => {
    const mock = setup();
    mock.refetch.mockRejectedValueOnce(new Error("history unavailable")).mockResolvedValueOnce(page([
      text("assistant_message", 10),
    ]));
    const stop = mock.start();
    await settle();
    expect(mock.onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(mock.refetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.refetch).toHaveBeenCalledTimes(2);
    expect(mock.timeline.subscribe).toHaveBeenCalledTimes(1);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    expect(vi.getTimerCount()).toBe(0);
    stop();
  });

  it("backs off to 30 seconds and resets the delay after successful synchronization", async () => {
    const mock = setup();
    mock.refetch.mockRejectedValue(new Error("offline"));
    const stop = mock.start();
    await settle();
    let attempts = 1;
    for (const delay of [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(mock.refetch).toHaveBeenCalledTimes(attempts);
      await vi.advanceTimersByTimeAsync(1);
      expect(mock.refetch).toHaveBeenCalledTimes(++attempts);
    }
    mock.refetch.mockResolvedValue(page([text("user_message", 10)]));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    expect(vi.getTimerCount()).toBe(0);

    mock.refetch.mockRejectedValueOnce(new Error("another failure"));
    mock.emit({ agentId: "agent", subscriptionId: "new", event: { type: "subscription_restored" } });
    await settle();
    const callsBeforeRetry = mock.refetch.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.refetch).toHaveBeenCalledTimes(callsBeforeRetry + 1);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    stop();
  });

  it("resubscribes after a live subscription error and ignores the old callbacks", async () => {
    const mock = setup();
    mock.refetch.mockResolvedValue(page([text("user_message", 10)]));
    const stop = mock.start();
    await settle();
    const oldReceiver = mock.receivers[0]!;
    mock.emit({ agentId: "agent", event: { type: "error", error: "observation stopped" } });
    expect(mock.release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    oldReceiver({
      agentId: "agent", timestamp: timestamp(100), epoch: "old",
      event: { type: "timeline", provider: "codex", item: text("assistant_message", 100).item },
    });
    oldReceiver({ agentId: "agent", event: { type: "error", error: "late error" } });
    expect(mock.onError).toHaveBeenCalledTimes(1);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.timeline.subscribe).toHaveBeenCalledTimes(2);
    expect(mock.refetch).toHaveBeenCalledTimes(2);
    mock.emitEntry(text("assistant_message", 20));
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 20_000);
    stop();
  });

  it("retries a ready rejection without retrying twice for the accompanying error event", async () => {
    const ready = deferred<void>();
    let attempt = 0;
    const mock = setup(() => ++attempt === 1 ? ready.promise : Promise.resolve());
    mock.refetch.mockResolvedValue(page([text("user_message", 10)]));
    const stop = mock.start();
    mock.emit({ agentId: "agent", event: { type: "error", error: "subscription failed" } });
    ready.reject(new Error("subscription failed"));
    await settle();
    expect(mock.onError).toHaveBeenCalledTimes(1);
    expect(mock.refetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.timeline.subscribe).toHaveBeenCalledTimes(2);
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    stop();
  });

  it("retries a ready rejection even when no error event was delivered", async () => {
    let attempt = 0;
    const mock = setup(() => ++attempt === 1 ? Promise.reject(new Error("not ready")) : Promise.resolve());
    const stop = mock.start();
    await settle();
    expect(mock.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "not ready" }));
    expect(mock.refetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.timeline.subscribe).toHaveBeenCalledTimes(2);
    expect(mock.onChange).toHaveBeenLastCalledWith(null);
    stop();
  });

  it("ignores late readiness and pending history from a failed subscription", async () => {
    const ready = deferred<void>();
    let attempt = 0;
    const mock = setup(() => ++attempt === 1 ? ready.promise : Promise.resolve());
    const oldHistory = deferred<Page>();
    mock.refetch.mockReturnValueOnce(oldHistory.promise).mockResolvedValueOnce(page([
      text("user_message", 10),
    ]));
    const stop = mock.start();
    mock.emit({ agentId: "agent", event: { type: "replacement", epoch: "epoch-1" } });
    mock.emit({ agentId: "agent", event: { type: "error", error: "subscription stopped" } });
    ready.resolve();
    await settle();
    expect(mock.refetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mock.refetch).toHaveBeenCalledTimes(2);
    oldHistory.resolve(page([text("assistant_message", 100)]));
    await settle();
    expect(mock.onChange).toHaveBeenLastCalledWith(origin + 10_000);
    stop();
  });

  it("cancels history and subscription retry timers when stopped", async () => {
    for (const kind of ["history", "subscription"]) {
      const mock = setup();
      if (kind === "history") mock.refetch.mockRejectedValue(new Error("offline"));
      const stop = mock.start();
      await settle();
      if (kind === "subscription") mock.emit({ agentId: "agent", event: { type: "error", error: "offline" } });
      expect(vi.getTimerCount()).toBe(1);
      const subscriptions = vi.mocked(mock.timeline.subscribe).mock.calls.length;
      const fetches = mock.refetch.mock.calls.length;
      stop();
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mock.timeline.subscribe).toHaveBeenCalledTimes(subscriptions);
      expect(mock.refetch).toHaveBeenCalledTimes(fetches);
    }
  });
});
