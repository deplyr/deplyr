import { describe, expect, test } from "bun:test";
import { checkRedisCommand, parseCsv, splitCommand } from "./db-query";

describe("splitCommand", () => {
  test("splits on spaces", () => expect(splitCommand("GET mykey")).toEqual(["GET", "mykey"]));
  test("keeps quoted values together", () => expect(splitCommand(`SET k "a b" 'c d'`)).toEqual(["SET", "k", "a b", "c d"]));
  test("keeps an empty quoted argument", () => expect(splitCommand(`SET k ""`)).toEqual(["SET", "k", ""]));
  test("rejects an unterminated quote", () => expect(() => splitCommand(`GET "oops`)).toThrow());
});

describe("checkRedisCommand", () => {
  test("blocks streaming and admin commands", () => {
    expect(checkRedisCommand(["MONITOR"])).not.toBeNull();
    expect(checkRedisCommand(["config", "set", "x", "y"])).not.toBeNull();
  });
  test("allows normal commands", () => expect(checkRedisCommand(["GET", "k"])).toBeNull());
});

describe("parseCsv", () => {
  test("header and rows", () => expect(parseCsv("id,name\n1,ann\n2,bob\n")).toEqual([["id", "name"], ["1", "ann"], ["2", "bob"]]));
  test("quotes, commas and newlines inside fields", () => expect(parseCsv('a,b\n"x, y","line1\nline2"\n')).toEqual([["a", "b"], ["x, y", "line1\nline2"]]));
  test("escaped quotes", () => expect(parseCsv('a\n"say ""hi"""\n')).toEqual([["a"], ['say "hi"']]));
});
