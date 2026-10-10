export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface LogErrorDetails {
  name?: string | undefined;
  message: string;
  stack?: string | undefined;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  context?: LogContext | undefined;
  correlationId?: string | undefined;
  error?: LogErrorDetails | undefined;
}

export interface LoggerApi {
  debug: (event: string, message: string, context?: LogContext, error?: Error) => void;
  info: (event: string, message: string, context?: LogContext, error?: Error) => void;
  warn: (event: string, message: string, context?: LogContext, error?: Error) => void;
  error: (event: string, message: string, context?: LogContext, error?: Error) => void;
  subscribe: (listener: (entry: LogEntry) => void) => () => void;
}

const createErrorDetails = (error?: Error): LogErrorDetails | undefined => {
  if (!error) {
    return undefined;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
};

const getCorrelationId = (): string => {
  return `log-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

export const createLogger = (): LoggerApi => {
  const listeners = new Set<(entry: LogEntry) => void>();

  const publish = (
    level: LogLevel,
    event: string,
    message: string,
    context?: LogContext,
    error?: Error,
  ): void => {
    const errorDetails = createErrorDetails(error);
    const entry: LogEntry = {
      id: getCorrelationId(),
      timestamp: new Date().toISOString(),
      level,
      event,
      message,
      correlationId: getCorrelationId(),
      ...(context !== undefined ? { context } : {}),
      ...(errorDetails !== undefined ? { error: errorDetails } : {}),
    };

    listeners.forEach((listener) => listener(entry));

    const consoleMethod =
      level === 'debug'
        ? 'debug'
        : level === 'info'
          ? 'info'
          : level === 'warn'
            ? 'warn'
            : 'error';

    if (error) {
      console[consoleMethod](event, message, context, error);
      return;
    }

    console[consoleMethod](event, message, context);
  };

  return {
    debug: (event, message, context, error) => publish('debug', event, message, context, error),
    info: (event, message, context, error) => publish('info', event, message, context, error),
    warn: (event, message, context, error) => publish('warn', event, message, context, error),
    error: (event, message, context, error) => publish('error', event, message, context, error),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const logger = createLogger();
