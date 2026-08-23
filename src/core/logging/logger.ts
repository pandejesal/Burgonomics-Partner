export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

export interface LogEvent {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
  timestamp: string;
  app: { name: string; version: string; env: string };
}

class Logger {
  debug(msg: string, ctx?: Record<string, unknown>) {
    if (import.meta.env.DEV) console.debug(msg, ctx);
  }
  info(msg: string, ctx?: Record<string, unknown>) {
    if (import.meta.env.DEV) console.info(msg, ctx);
  }
  warn(msg: string, ctx?: Record<string, unknown>) {
    console.warn(msg, ctx);
  }
  error(msg: string, error?: unknown, ctx?: Record<string, unknown>) {
    console.error(msg, error, ctx);
  }
  critical(msg: string, error?: unknown, ctx?: Record<string, unknown>) {
    console.error(`[CRITICAL] ${msg}`, error, ctx);
  }
}

export const logger = new Logger();
