import { expect, test } from "@playwright/test";
import sample from "../data/samples/position-report.sample.json";
import { parsePositionReport } from "../app/api/snapshot/parser";
import { collectAISSnapshot } from "../app/api/snapshot/reader";

type SyntheticMessage = {
  MetaData: Record<string, unknown>;
  Message: { PositionReport: Record<string, unknown> };
};

function syntheticMessage(change: (message: SyntheticMessage) => void): SyntheticMessage {
  const message = structuredClone(sample) as SyntheticMessage;
  change(message);
  return message;
}

test("synthetic valid sample converts to vessel with literal fields", () => {
  expect(parsePositionReport(syntheticMessage(() => {}))).toEqual({
    id: "123456789",
    name: "SAMPLE VESSEL",
    lat: 51,
    lon: 1.45,
    speedKnots: 12.3,
    courseDeg: 135,
    timestamp: "2026-10-14T17:17:44.123Z",
    source: "aisstream",
  });
});

test("synthetic missing name becomes null", () => {
  const message = syntheticMessage((variant) => {
    delete variant.MetaData.ShipName;
  });

  expect(parsePositionReport(message)?.name).toBeNull();
});

test("synthetic whitespace-only name becomes null", () => {
  const message = syntheticMessage((variant) => {
    variant.MetaData.ShipName = "   ";
  });

  expect(parsePositionReport(message)?.name).toBeNull();
});

test("synthetic zero speed stays zero", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Sog = 0;
  });

  expect(parsePositionReport(message)?.speedKnots).toBe(0);
});

test("synthetic speed 102.3 becomes null", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Sog = 102.3;
  });

  expect(parsePositionReport(message)?.speedKnots).toBeNull();
});

test("synthetic speed -1 becomes null", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Sog = -1;
  });

  expect(parsePositionReport(message)?.speedKnots).toBeNull();
});

test("synthetic missing speed becomes null", () => {
  const message = syntheticMessage((variant) => {
    delete variant.Message.PositionReport.Sog;
  });

  expect(parsePositionReport(message)?.speedKnots).toBeNull();
});

test("synthetic course 360 becomes null", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Cog = 360;
  });

  expect(parsePositionReport(message)?.courseDeg).toBeNull();
});

test("synthetic latitude 91 and longitude 181 reject position", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Latitude = 91;
    variant.Message.PositionReport.Longitude = 181;
  });

  expect(parsePositionReport(message)).toBeNull();
});

test("synthetic coordinates 95 and -200 reject position", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Latitude = 95;
    variant.Message.PositionReport.Longitude = -200;
  });

  expect(parsePositionReport(message)).toBeNull();
});

test("synthetic string coordinate rejects position", () => {
  const message = syntheticMessage((variant) => {
    variant.Message.PositionReport.Latitude = "51";
  });

  expect(parsePositionReport(message)).toBeNull();
});

test("synthetic missing MMSI rejects position", () => {
  const message = syntheticMessage((variant) => {
    delete variant.MetaData.MMSI;
  });

  expect(parsePositionReport(message)).toBeNull();
});

test("synthetic empty MMSI rejects position", () => {
  const message = syntheticMessage((variant) => {
    variant.MetaData.MMSI = "";
  });

  expect(parsePositionReport(message)).toBeNull();
});

test("synthetic unparseable timestamp rejects position", () => {
  const message = syntheticMessage((variant) => {
    variant.MetaData.time_utc = "not-a-time";
  });

  expect(parsePositionReport(message)).toBeNull();
});

type SocketEvent = { data?: unknown };
type SocketListener = (event: SocketEvent) => void;
type FakeTimer = ReturnType<typeof setTimeout>;

class FakeSocket {
  readyState = 0;
  closeCalls = 0;
  sent: string[] = [];
  private listeners = new Map<string, Set<SocketListener>>();
  private history = new Map<string, SocketListener[]>();

  addEventListener(type: string, listener: SocketListener): void {
    const listeners = this.listeners.get(type) ?? new Set<SocketListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    const history = this.history.get(type) ?? [];
    history.push(listener);
    this.history.set(type, history);
  }

  removeEventListener(type: string, listener: SocketListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closeCalls += 1;
    this.readyState = 3;
  }

  emit(type: string, event: SocketEvent = {}): void {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  emitCaptured(type: string, event: SocketEvent = {}): void {
    for (const listener of this.history.get(type) ?? []) listener(event);
  }
}

function collectorHarness() {
  const socket = new FakeSocket();
  const abortController = new AbortController();
  const timers: { callback: () => void; delay: number; cleared: boolean }[] = [];
  const fixedNow = new Date("2026-01-01T12:00:00.000Z");
  const promise = collectAISSnapshot({
    apiKey: "synthetic-test-key",
    signal: abortController.signal,
    socketFactory: () => socket,
    now: () => new Date(fixedNow),
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timers.length as FakeTimer;
    },
    clearTimeout: (handle) => {
      const timer = timers[Number(handle) - 1];
      if (timer) timer.cleared = true;
    },
  });

  return {
    socket,
    abortController,
    promise,
    timers,
    open: () => socket.emit("open"),
    deadline: () => timers[0].callback(),
    send: (message: unknown) => socket.emit("message", { data: JSON.stringify(message) }),
    assertClean: () => {
      expect(socket.closeCalls).toBe(1);
      expect(timers[0].cleared).toBe(true);
    },
  };
}

function syntheticPosition(
  mmsi: number,
  timestamp = "2026-01-01 12:00:00.000 +0000 UTC",
  latitude = 51,
  longitude = 1.45,
  shipName: unknown = "SYNTHETIC A",
) {
  const message = syntheticMessage((variant) => {
    variant.MetaData.MMSI = mmsi;
    variant.MetaData.time_utc = timestamp;
    variant.MetaData.ShipName = shipName;
    variant.Message.PositionReport.Latitude = latitude;
    variant.Message.PositionReport.Longitude = longitude;
  });
  return message;
}

function providerError() {
  return { MessageType: "Error", Message: "synthetic provider error" };
}

test("collector keeps one vessel for two identical synthetic messages", async () => {
  const harness = collectorHarness();
  harness.open();
  const message = syntheticPosition(100000001);
  harness.send(message);
  harness.send(message);
  harness.deadline();

  const result = await harness.promise;
  expect(result.vessels).toHaveLength(1);
  expect(result.vessels[0].id).toBe("100000001");
  harness.assertClean();
});

test("collector keeps newer synthetic position when older arrives later", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.send(syntheticPosition(100000001, "2026-01-01 12:01:00.000 +0000 UTC", 52, 2));
  harness.send(syntheticPosition(100000001, "2026-01-01 12:00:00.000 +0000 UTC", 53, 3));
  harness.deadline();

  const result = await harness.promise;
  expect(result.vessels).toHaveLength(1);
  expect(result.vessels[0].timestamp).toBe("2026-01-01T12:01:00.000Z");
  expect(result.vessels[0].lat).toBe(52);
  expect(result.vessels[0].lon).toBe(2);
  harness.assertClean();
});

test("collector keeps first synthetic position when timestamps are equal", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.send(syntheticPosition(100000001, "2026-01-01 12:00:00.000 +0000 UTC", 52, 2));
  harness.send(syntheticPosition(100000001, "2026-01-01 12:00:00.000 +0000 UTC", 53, 3));
  harness.deadline();

  const result = await harness.promise;
  expect(result.vessels).toHaveLength(1);
  expect(result.vessels[0].lat).toBe(52);
  expect(result.vessels[0].lon).toBe(2);
  harness.assertClean();
});

test("collector stops at 100 unique synthetic vessels and rejects the 101st", async () => {
  const harness = collectorHarness();
  harness.open();
  for (let index = 1; index <= 100; index += 1) harness.send(syntheticPosition(100000000 + index));
  harness.send(syntheticPosition(100000101));

  const result = await harness.promise;
  expect(result.count).toBe(100);
  expect(result.reason).toBe("limit_reached");
  expect(result.truncated).toBe(true);
  expect(result.vessels.some((vessel) => vessel.id === "100000101")).toBe(false);
  harness.assertClean();
});

test("collector waits to synthetic deadline after 100 messages for one vessel", async () => {
  const harness = collectorHarness();
  harness.open();
  for (let index = 0; index < 100; index += 1) {
    harness.send(syntheticPosition(100000001, `2026-01-01 12:00:${String(index).padStart(2, "0")}.000 +0000 UTC`));
  }
  expect(harness.timers[0].cleared).toBe(false);
  harness.deadline();

  const result = await harness.promise;
  expect(result.count).toBe(1);
  expect(result.reason).toBe("window_elapsed");
  harness.assertClean();
});

test("collector returns empty success when synthetic deadline expires after open", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.deadline();

  const result = await harness.promise;
  expect(result.count).toBe(0);
  expect(result.reason).toBe("window_elapsed");
  harness.assertClean();
});

test("collector fails connect when synthetic deadline expires before open", async () => {
  const harness = collectorHarness();
  harness.deadline();

  await expect(harness.promise).rejects.toMatchObject({ code: "connect_failed" });
  harness.assertClean();
});

test("collector fails connect immediately on synthetic pre-open socket error", async () => {
  const harness = collectorHarness();
  harness.socket.emit("error");

  await expect(harness.promise).rejects.toMatchObject({ code: "connect_failed" });
  harness.assertClean();
});

test("collector rejects synthetic provider error after three positions", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.send(syntheticPosition(100000001));
  harness.send(syntheticPosition(100000002));
  harness.send(syntheticPosition(100000003));
  harness.send(providerError());

  await expect(harness.promise).rejects.toMatchObject({ code: "provider_error" });
  harness.assertClean();
});

test("collector rejects synthetic disconnect after three positions", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.send(syntheticPosition(100000001));
  harness.send(syntheticPosition(100000002));
  harness.send(syntheticPosition(100000003));
  harness.socket.emit("close");

  await expect(harness.promise).rejects.toMatchObject({ code: "disconnected" });
  expect(harness.socket.readyState).toBe(3);
  expect(harness.socket.closeCalls).toBe(0);
  expect(harness.timers[0].cleared).toBe(true);
});

test("collector keeps limit success after captured synthetic provider error", async () => {
  const harness = collectorHarness();
  harness.open();
  for (let index = 1; index <= 100; index += 1) harness.send(syntheticPosition(100000000 + index));
  let settlements = 0;
  const observed = harness.promise.then((result) => {
    settlements += 1;
    return result;
  });
  harness.socket.emitCaptured("message", { data: JSON.stringify(providerError()) });

  const result = await observed;
  expect(result.reason).toBe("limit_reached");
  expect(result.count).toBe(100);
  expect(settlements).toBe(1);
  harness.assertClean();
});

test("collector aborts before synthetic deadline and clears resources", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.abortController.abort();

  await expect(harness.promise).rejects.toMatchObject({ code: "internal" });
  harness.assertClean();
});

test("collector replaces synthetic vessel when newer name is null", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.send(syntheticPosition(100000001, "2026-01-01 12:00:00.000 +0000 UTC", 51, 1.45, "SYNTHETIC A"));
  harness.send(syntheticPosition(100000001, "2026-01-01 12:01:00.000 +0000 UTC", 52, 2, null));
  harness.deadline();

  const result = await harness.promise;
  expect(result.vessels).toHaveLength(1);
  expect(result.vessels[0]).toMatchObject({
    id: "100000001",
    name: null,
    lat: 52,
    lon: 2,
    timestamp: "2026-01-01T12:01:00.000Z",
  });
  harness.assertClean();
});

test("collector uses literal injected clock value for collectedAt", async () => {
  const harness = collectorHarness();
  harness.open();
  harness.deadline();

  const result = await harness.promise;
  expect(result.collectedAt).toBe("2026-01-01T12:00:00.000Z");
  harness.assertClean();
});
