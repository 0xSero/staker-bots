/**
 * Common error handling utilities for all bot implementations
 */

export enum ErrorType {
  CONFIG_ERROR = 'CONFIG_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  MONITOR_ERROR = 'MONITOR_ERROR',
  EXECUTOR_ERROR = 'EXECUTOR_ERROR',
  PROFITABILITY_ERROR = 'PROFITABILITY_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

export interface BotError extends Error {
  type: ErrorType;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * Creates a standardized bot error
 * 
 * @param type The type of error
 * @param message Error message
 * @param severity Error severity level
 * @param context Additional context information
 * @returns Standardized BotError
 */
export function createBotError(
  type: ErrorType,
  message: string,
  severity: ErrorSeverity = ErrorSeverity.ERROR,
  context?: Record<string, any>
): BotError {
  const error = new Error(message) as BotError;
  error.type = type;
  error.severity = severity;
  error.context = context;
  error.timestamp = Date.now();
  return error;
}

/**
 * Error logger interface for standardized logging across components
 */
export interface ErrorLogger {
  /**
   * Log an error
   * 
   * @param error The error to log
   * @param context Additional context about the error
   */
  error(error: Error, context?: Record<string, any>): Promise<void>;
  
  /**
   * Log a warning
   * 
   * @param message Warning message
   * @param context Additional context about the warning
   */
  warn(message: string, context?: Record<string, any>): Promise<void>;
  
  /**
   * Log an informational message
   * 
   * @param message Info message
   * @param context Additional context
   */
  info(message: string, context?: Record<string, any>): Promise<void>;
}

/**
 * Console implementation of the error logger
 */
export class ConsoleErrorLogger implements ErrorLogger {
  private readonly serviceName: string;
  
  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }
  
  async error(error: Error, context?: Record<string, any>): Promise<void> {
    console.error(`[${this.serviceName}] ERROR:`, error.message, context || '');
  }
  
  async warn(message: string, context?: Record<string, any>): Promise<void> {
    console.warn(`[${this.serviceName}] WARNING:`, message, context || '');
  }
  
  async info(message: string, context?: Record<string, any>): Promise<void> {
    console.info(`[${this.serviceName}] INFO:`, message, context || '');
  }
} 