import { buildDiagnosticLine } from './safeLog';
import type { LogLevel } from './safeLog';

export type { LogLevel };

/**
 * Partner diagnostic logger.
 *
 * Every call emits exactly ONE JSON string argument — never a raw error,
 * context object or provider payload — because native text capture flattens
 * objects to `[object Object]` and a remote console sink would otherwise carry
 * tokens, identifiers and PII off the device. See DIAGNOSTIC-CONTRACT.md and
 * `safeLog.ts` for the allowlist that survives.
 *
 * The public API is unchanged, and the severity policy is unchanged: `debug`
 * and `info` stay development-only, `warn`/`error`/`critical` always emit.
 *
 * Coverage limit: only code that goes through this logger is shaped this way.
 * The remaining `console.*` call sites are not migrated yet.
 */
export interface LogEvent {
  level: LogLevel;
  message: string;
  context?: unknown;
  error?: unknown;
  timestamp: string;
  app: { name: string; version: string; env: string };
}

type ConsoleMethod = 'debug' | 'info' | 'warn' | 'error';

const CONSOLE_METHOD: Record<LogLevel, ConsoleMethod> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  critical: 'error',
};

/**
 * Emit one bounded JSON line. A throwing console (an instrumented WebView, a
 * failed native bridge) must never break the caller, so the write is guarded.
 *
 * `context` is `unknown`, not `Record<string, unknown>`: handled native
 * failures arrive as an `Error`, and widening here means a caller passes the
 * error object directly instead of casting it. Nothing is read from it except
 * through the descriptor allowlist in `safeLog.ts`.
 */
function emit(level: LogLevel, message: string, error?: unknown, context?: unknown): void {
  try {
    const line = buildDiagnosticLine(level, message, error, context);
    const method = typeof console === 'undefined' ? undefined : console[CONSOLE_METHOD[level]];
    if (typeof method === 'function') method.call(console, line);
  } catch {
    // Diagnostics must never become an application failure.
  }
}

class Logger {
  debug(msg: string, ctx?: unknown) {
    if (import.meta.env.DEV) emit('debug', msg, undefined, ctx);
  }
  info(msg: string, ctx?: unknown) {
    if (import.meta.env.DEV) emit('info', msg, undefined, ctx);
  }
  warn(msg: string, ctx?: unknown) {
    emit('warn', msg, undefined, ctx);
  }
  error(msg: string, error?: unknown, ctx?: unknown) {
    emit('error', msg, error, ctx);
  }
  critical(msg: string, error?: unknown, ctx?: unknown) {
    emit('critical', msg, error, ctx);
  }
}

export const logger = new Logger();
