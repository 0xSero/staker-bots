export enum ErrorType {
  MONITOR_ERROR = 'MONITOR_ERROR',
  EXECUTOR_ERROR = 'EXECUTOR_ERROR',
  PROFITABILITY_ERROR = 'PROFITABILITY_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONFIG_ERROR = 'CONFIG_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

export enum ErrorSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface BotError extends Error {
  type: ErrorType
  severity: ErrorSeverity
  context?: Record<string, unknown>
  retryable: boolean
}

export class BaseError extends Error implements BotError {
  public type: ErrorType
  public severity: ErrorSeverity
  public context?: Record<string, unknown>
  public retryable: boolean

  constructor(
    message: string,
    context?: Record<string, unknown>,
    retryable: boolean = false,
    type: ErrorType = ErrorType.UNKNOWN_ERROR,
    severity: ErrorSeverity = ErrorSeverity.ERROR
  ) {
    super(message)
    this.name = this.constructor.name
    this.type = type
    this.severity = severity
    this.context = context
    this.retryable = retryable
  }
}

export class MonitorError extends BaseError {
  constructor(
    message: string,
    context: Record<string, unknown>,
    retryable: boolean = false
  ) {
    super(message, context, retryable, ErrorType.MONITOR_ERROR)
    this.name = 'MonitorError'
  }
}

export class EventProcessingError extends MonitorError {
  constructor(
    eventType: string,
    error: Error,
    context: Record<string, unknown>
  ) {
    super(
      `Failed to process ${eventType} event: ${error.message}`,
      context,
      true // Most event processing errors are retryable
    )
    this.name = 'EventProcessingError'
  }
}

export class DepositNotFoundError extends MonitorError {
  constructor(depositId: string) {
    super(
      `Deposit not found: ${depositId}`,
      { depositId },
      false // Not retryable since deposit doesn't exist
    )
    this.name = 'DepositNotFoundError'
  }
}

// Error message constants
export const ERROR_MESSAGES = {
  MONITOR: {
    DEPOSIT_NOT_FOUND: 'Deposit not found',
    EVENT_PROCESSING_FAILED: 'Failed to process event',
    DATABASE_OPERATION_FAILED: 'Database operation failed',
  },
  EXECUTOR: {
    TRANSACTION_EXECUTION_FAILED: 'Transaction execution failed',
    GAS_ESTIMATION_FAILED: 'Gas estimation failed',
    CONTRACT_METHOD_INVALID: 'Contract method not found or invalid',
    QUEUE_OPERATION_FAILED: 'Queue operation failed',
    TRANSACTION_VALIDATION_FAILED: 'Transaction validation failed',
    INSUFFICIENT_BALANCE: 'Insufficient balance for transaction',
    TRANSACTION_RECEIPT_INVALID: 'Failed to get valid transaction receipt',
  },
  PROFITABILITY: {
    DEPOSIT_NOT_FOUND: (depositId: string) => `Deposit not found: ${depositId}`,
    INVALID_DEPOSIT_DATA: 'Invalid deposit data received',
    GAS_ESTIMATION_FAILED: 'Gas estimation failed for profitability calculation',
    QUEUE_PROCESSING_ERROR: 'Queue processing error in profitability engine',
  },
} as const 