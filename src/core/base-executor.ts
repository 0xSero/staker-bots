/**
 * Base executor interface defining the contract for all executor implementations
 */

export interface TransactionResult {
  hash?: string
  status: 'queued' | 'sent' | 'confirmed' | 'failed'
  error?: Error
  receipt?: any
  timestamp: number
}

export interface ExecutorStatus {
  isRunning: boolean
  lastTxTimestamp?: number
  txQueued: number
  txSent: number
  txConfirmed: number
  txFailed: number
  errors: Array<{
    timestamp: number
    message: string
  }>
}

export interface BaseExecutor {
  /**
   * Start the executor
   */
  start(): Promise<void>
  
  /**
   * Stop the executor
   */
  stop(): Promise<void>
  
  /**
   * Get the current status of the executor
   */
  getStatus(): Promise<ExecutorStatus>
  
  /**
   * Queue a transaction for execution
   */
  queueTransaction(params: {
    to: string
    data: string
    value?: bigint
    gasLimit?: bigint
    maxFeePerGas?: bigint
    maxPriorityFeePerGas?: bigint
    metadata?: Record<string, any>
  }): Promise<TransactionResult>
} 