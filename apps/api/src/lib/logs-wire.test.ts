import { describe, expect, test } from "bun:test";
import { compareDockerTs, dockerTsToNs, encodeLogLine, encodeStateLine, parseWireLine } from "@deplyr/shared-types";

describe("dockerTsToNs", () => {
  test("nanosecond precision is kept", () => {
    expect(dockerTsToNs("2026-09-21T18:00:00.123456789Z")! % 1_000_000_000n).toBe(123456789n);
  });
  test("whole seconds and short fractions", () => {
    const whole = dockerTsToNs("2026-09-21T18:00:00Z")!;
    expect(dockerTsToNs("2026-09-21T18:00:00.5Z")! - whole).toBe(500_000_000n);
  });
  test("offsets are normalised to UTC", () => {
    expect(dockerTsToNs("2026-09-21T20:00:00+02:00")).toBe(dockerTsToNs("2026-09-21T18:00:00Z"));
  });
  test("garbage is null", () => {
    expect(dockerTsToNs("yesterday")).toBeNull();
    expect(dockerTsToNs("2026-09-21 18:00:00")).toBeNull();
  });
});

describe("compareDockerTs", () => {
  // The bug this exists for: 'Z' sorts after digits, so as strings ".12Z" < ".1Z".
  test("trimmed trailing zeros still order correctly", () => {
    expect(compareDockerTs("2026-09-21T18:00:05.1Z", "2026-09-21T18:00:05.12Z")).toBe(-1);
    expect(compareDockerTs("2026-09-21T18:00:05.12Z", "2026-09-21T18:00:05.1Z")).toBe(1);
    expect("2026-09-21T18:00:05.12Z" < "2026-09-21T18:00:05.1Z").toBe(true); // proof plain compare is wrong
  });
  test("equal instants", () => {
    expect(compareDockerTs("2026-09-21T18:00:05.100000000Z", "2026-09-21T18:00:05.1Z")).toBe(0);
  });
});

describe("wire format", () => {
  test("state lines", () => {
    expect(parseWireLine(encodeStateLine("running"))).toEqual({ kind: "state", state: "running" });
    expect(parseWireLine("S|exploded")).toBeNull();
  });
  test("log lines round-trip, including text with spaces and pipes", () => {
    const line = { ts: "2026-09-21T18:00:00.5Z", text: "LOG:  a | b  c", stream: "stderr" as const };
    expect(parseWireLine(encodeLogLine(line))).toEqual({ kind: "line", line });
  });
  test("empty text after the timestamp", () => {
    expect(parseWireLine("O|2026-09-21T18:00:00Z")).toEqual({ kind: "line", line: { ts: "2026-09-21T18:00:00Z", text: "", stream: "stdout" } });
  });
  test("rejects lines without a valid timestamp", () => {
    expect(parseWireLine("O|not-a-time hello")).toBeNull();
    expect(parseWireLine("X|2026-09-21T18:00:00Z hi")).toBeNull();
  });
});
