import { QueueOptions, Queue } from 'bullmq'
import { QueueFactory } from './queue-factory'

export const QUEUE_NAMES = {
  EVENT_PROCESSING: 'event-processing',
  DATABASE_OPERATIONS: 'database-operations',
  DEPOSIT_SCAN: 'deposit-scan',
  REWARD_CHECK: 'reward-check',
  PROFITABILITY_ANALYSIS: 'profitability-analysis',
  TRANSACTION_EXECUTION: 'transaction-execution',
  RESULT_PROCESSING: 'result-processing'
} as const

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES]

// Omit connection from QueueOptions since it will be provided by QueueFactory
export interface QueueDefinition {
  name: QueueName
  options: Omit<QueueOptions, 'connection'>
}

// Common options that apply to all queues
const commonOptions: Partial<Omit<QueueOptions, 'connection'>> = {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
}

// Event Processing Queue
export const EVENT_PROCESSING_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.EVENT_PROCESSING,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      removeOnComplete: 1000, // Keep last 1000 completed events
      removeOnFail: false // Keep failed events for debugging
    }
  }
}

// Database Operations Queue
export const DATABASE_OPERATIONS_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.DATABASE_OPERATIONS,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      attempts: 5, // More retries for database operations
      removeOnComplete: 100, // Keep last 100 completed operations
      removeOnFail: 1000 // Keep last 1000 failed operations
    }
  }
}

// Deposit Scan Queue
export const DEPOSIT_SCAN_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.DEPOSIT_SCAN,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  }
}

// Reward Check Queue
export const REWARD_CHECK_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.REWARD_CHECK,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  }
}

// Profitability Analysis Queue
export const PROFITABILITY_ANALYSIS_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.PROFITABILITY_ANALYSIS,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: 1000
    }
  }
}

// Transaction Execution Queue
export const TRANSACTION_EXECUTION_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.TRANSACTION_EXECUTION,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      attempts: 5, // More retries for transactions
      removeOnComplete: 1000, // Keep more completed transactions
      removeOnFail: false // Keep all failed transactions
    }
  }
}

// Result Processing Queue
export const RESULT_PROCESSING_QUEUE: QueueDefinition = {
  name: QUEUE_NAMES.RESULT_PROCESSING,
  options: {
    ...commonOptions,
    defaultJobOptions: {
      ...commonOptions.defaultJobOptions,
      removeOnComplete: 1000,
      removeOnFail: 1000
    }
  }
}

// Export all queue definitions
export const QUEUE_DEFINITIONS: Record<QueueName, QueueDefinition> = {
  [QUEUE_NAMES.EVENT_PROCESSING]: EVENT_PROCESSING_QUEUE,
  [QUEUE_NAMES.DATABASE_OPERATIONS]: DATABASE_OPERATIONS_QUEUE,
  [QUEUE_NAMES.DEPOSIT_SCAN]: DEPOSIT_SCAN_QUEUE,
  [QUEUE_NAMES.REWARD_CHECK]: REWARD_CHECK_QUEUE,
  [QUEUE_NAMES.PROFITABILITY_ANALYSIS]: PROFITABILITY_ANALYSIS_QUEUE,
  [QUEUE_NAMES.TRANSACTION_EXECUTION]: TRANSACTION_EXECUTION_QUEUE,
  [QUEUE_NAMES.RESULT_PROCESSING]: RESULT_PROCESSING_QUEUE
}

// Helper function to create all queues
export function createQueues(queueFactory: QueueFactory): Record<QueueName, Queue> {
  return Object.values(QUEUE_DEFINITIONS).reduce((queues, definition) => {
    queues[definition.name] = queueFactory.createQueue(definition.name, definition.options)
    return queues
  }, {} as Record<QueueName, Queue>)
}
