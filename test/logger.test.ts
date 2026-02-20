import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { logger } from "../src/lib/logger";

describe("Logger", () => {
  let consoleOutput: string[] = [];

  beforeEach(() => {
    consoleOutput = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" "));
    };
    console.warn = console.log;
    console.error = console.log;

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  });

  test("logger.info outputs JSON format", () => {
    logger.info("test message");
    expect(consoleOutput.length).toBe(1);
    const output = consoleOutput[0];
    expect(output).toContain("test message");
    expect(output).toContain('"lvl":"I"');
  });

  test("logger.warn outputs JSON format", () => {
    logger.warn("warning message");
    expect(consoleOutput.length).toBe(1);
    const output = consoleOutput[0];
    expect(output).toContain("warning message");
    expect(output).toContain('"lvl":"W"');
  });

  test("logger.error outputs JSON format with error message", () => {
    logger.error("error message", new Error("test error"));
    expect(consoleOutput.length).toBe(1);
    const output = consoleOutput[0];
    expect(output).toContain("error message");
    expect(output).toContain('"lvl":"E"');
    expect(output).toContain("test error");
  });

  test("logger.error handles string error", () => {
    logger.error("error message", "string error");
    expect(consoleOutput.length).toBe(1);
    const output = consoleOutput[0];
    expect(output).toContain("string error");
  });

  test("logger.info includes context", () => {
    logger.info("message with context", { key: "value" });
    expect(consoleOutput.length).toBe(1);
    const output = consoleOutput[0];
    expect(output).toContain("key");
    expect(output).toContain("value");
  });

  test("logger.info includes requestId", () => {
    logger.info("message", {}, "req-123");
    expect(consoleOutput.length).toBe(1);
    const output = consoleOutput[0];
    expect(output).toContain("req");
    expect(output).toContain("req-123");
  });

  test("logger.debug only outputs when LOG_LEVEL is debug", () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = "debug";

    logger.debug("debug message");
    expect(consoleOutput.length).toBe(1);

    process.env.LOG_LEVEL = "info";
    consoleOutput = [];

    logger.debug("should not appear");
    expect(consoleOutput.length).toBe(0);

    process.env.LOG_LEVEL = originalLogLevel;
  });

  test("logger output contains timestamp", () => {
    logger.info("timestamp test");
    const output = consoleOutput[0];
    expect(output).toContain('"t":');
  });
});
