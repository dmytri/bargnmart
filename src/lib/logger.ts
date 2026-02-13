type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  request_id?: string;
  error?: string;
}

function formatLogEntry(entry: LogEntry): string {
  const base = {
    t: entry.timestamp,
    lvl: entry.level.charAt(0).toUpperCase(),
    msg: entry.message,
  };
  
  if (entry.request_id) {
    (base as any).req = entry.request_id;
  }
  if (entry.context) {
    (base as any).ctx = entry.context;
  }
  if (entry.error) {
    (base as any).err = entry.error;
  }
  
  return JSON.stringify(base);
}

function getTimestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(message: string, context?: LogContext, requestId?: string): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.log(formatLogEntry({
        timestamp: getTimestamp(),
        level: "debug",
        message,
        context,
        request_id: requestId,
      }));
    }
  },

  info(message: string, context?: LogContext, requestId?: string): void {
    console.log(formatLogEntry({
      timestamp: getTimestamp(),
      level: "info",
      message,
      context,
      request_id: requestId,
    }));
  },

  warn(message: string, context?: LogContext, requestId?: string): void {
    console.warn(formatLogEntry({
      timestamp: getTimestamp(),
      level: "warn",
      message,
      context,
      request_id: requestId,
    }));
  },

  error(message: string, error?: Error | string, requestId?: string): void {
    const errorStr = typeof error === "string" ? error : error?.message;
    console.error(formatLogEntry({
      timestamp: getTimestamp(),
      level: "error",
      message,
      request_id: requestId,
      error: errorStr,
    }));
  },
};
