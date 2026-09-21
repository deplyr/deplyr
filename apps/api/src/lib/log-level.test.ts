import { describe, expect, test } from "bun:test";
import { detectLogLevel, stripAnsi } from "@deplyr/shared-types";

const cases: Array<[string, string, ReturnType<typeof detectLogLevel>]> = [
  // Postgres
  ["pg LOG", "2026-09-21 18:00:00.123 UTC [1] LOG:  database system is ready to accept connections", "info"],
  ["pg FATAL", '2026-09-21 18:00:00.123 UTC [77] FATAL:  password authentication failed for user "shopper"', "error"],
  ["pg ERROR", '2026-09-21 18:00:00.123 UTC [77] ERROR:  relation "nope" does not exist', "error"],
  ["pg WARNING", "2026-09-21 18:00:00.123 UTC [77] WARNING:  there is no transaction in progress", "warn"],
  ["pg slow query is a warning", "2026-09-21 18:00:00.123 UTC [77] LOG:  duration: 1002.345 ms  statement: select pg_sleep(1)", "warn"],
  ["pg STATEMENT continuation is neutral", "2026-09-21 18:00:00.123 UTC [77] STATEMENT:  select * from nope", null],
  ["pg DETAIL continuation is neutral", "2026-09-21 18:00:00.123 UTC [77] DETAIL:  Role \"x\" does not exist.", null],
  // Redis
  ["redis notice", "1:M 21 Sep 2026 18:00:00.123 * Ready to accept connections tcp", "info"],
  ["redis warning", "1:M 21 Sep 2026 18:00:00.123 # WARNING overcommit_memory is set to 0!", "warn"],
  ["redis error-ish warning", "1:M 21 Sep 2026 18:00:00.123 # Error condition on socket for SYNC: Connection refused", "error"],
  ["redis verbose", "1:M 21 Sep 2026 18:00:00.123 - DB 0: 3 keys (0 volatile) in 4 slots HT.", "debug"],
  // Nest / generic level words
  ["nest error", "[Nest] 27  - 09/21/2026, 6:00:00 PM   ERROR [ExceptionsHandler] boom", "error"],
  ["nest log", "[Nest] 27  - 09/21/2026, 6:00:00 PM     LOG [NestApplication] Nest application successfully started", null],
  ["python warning", "WARNING:root:disk almost full", "warn"],
  ["java INFO", "18:00:00.123 [main] INFO  com.acme.App - started", "info"],
  // structured
  ["pino string", '{"level":"error","msg":"db down"}', "error"],
  ["pino numeric error", '{"level":50,"time":1,"msg":"x"}', "error"],
  ["pino numeric info", '{"level":30,"msg":"x"}', "info"],
  ["logfmt", 'time=1 level=warn msg="slow"', "warn"],
  // phrases and stack frames
  ["node stack frame", "    at Object.<anonymous> (/app/server.js:10:11)", "error"],
  ["python frame", '  File "/app/main.py", line 4, in <module>', "error"],
  ["Error: prefix", "Error: connect ECONNREFUSED 127.0.0.1:5432", "error"],
  ["TypeError prefix", "TypeError: Cannot read properties of undefined (reading 'x')", "error"],
  ["java exception", "java.lang.IllegalStateException: boom", "error"],
  ["errno code alone", "listen EADDRINUSE: address already in use :::3000", "error"],
  ["a sentence starting with Error isn't an error", "Error handling middleware registered", null],
  ["connection refused", "connect ECONNREFUSED 127.0.0.1:5432 — connection refused", "error"],
  ["unhandled rejection", "Unhandled promise rejection: something", "error"],
  ["timeout", "request timed out after 30s", "warn"],
  ["deprecation", "(node:1) DeprecationWarning: deprecated api", "warn"],
  // no false alarms
  ["plain text", "Server listening on port 3000", null],
  ["zero failures", "Tests: 12 passed, 0 failed", null],
  ["word inside another word", "information about the terror of it", null],
  ["empty", "", null],
];

describe("detectLogLevel", () => {
  test.each(cases)("%s", (_name, line, expected) => {
    expect(detectLogLevel(line)).toBe(expected);
  });

  test("ANSI colour codes don't hide the level", () => {
    expect(detectLogLevel("\u001b[31mERROR\u001b[0m something broke")).toBe("error");
    expect(detectLogLevel("\u001b[33m[WARN]\u001b[39m careful")).toBe("warn");
  });
});

describe("stripAnsi", () => {
  test("removes colour and cursor sequences", () => {
    expect(stripAnsi("\u001b[1;32mok\u001b[0m \u001b[2Kdone")).toBe("ok done");
  });
  test("leaves ordinary text alone", () => {
    expect(stripAnsi("a [b] c")).toBe("a [b] c");
  });
});
