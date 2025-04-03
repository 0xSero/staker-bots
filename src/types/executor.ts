import { Job, Queue, ConnectionOptions } from 'bullmq'
import { ethers } from 'ethers'
import { TransactionType } from './transactions'

export interface ExecutorJobData {
  type?: TransactionType
  data: any
  batchId: string
  timestamp: number
  maxGasPrice?: string // Optional override for max gas price
}

export interface ExecutorJobResult {
  success: boolean
  error?: string
  batchId: string
  timestamp: number
  transactions: TransactionResult[]
}

export interface TransactionResult {
  transactionHash?: string
  depositIds: string[]
  status: TransactionStatus
  error?: string
  gasUsed?: string
  effectiveGasPrice?: string
  totalCost?: string
  blockNumber?: number
  timestamp: number
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  DROPPED = 'DROPPED'
}

export type ExecutorJob = Job<ExecutorJobData, ExecutorJobResult>

export const EXECUTOR_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000
  },
  removeOnComplete: {
    age: 24 * 3600, // Keep successful jobs for 24 hours
    count: 1000 // Keep last 1000 successful jobs
  },
  removeOnFail: {
    age: 7 * 24 * 3600 // Keep failed jobs for 7 days
  }
}

export interface ExecutorConfig {
  connection: ConnectionOptions
  provider: ethers.Provider
  contractAddress: string
  contractAbi: any
  wallet: ethers.Wallet
  resultQueue: Queue
  maxBatchSize?: number
  concurrency?: number
  minConfirmations?: number
  maxGasPrice?: string // BigInt as string
  gasLimitMultiplier?: number // Multiplier for estimated gas limit (e.g., 1.1 for 10% buffer)
  retryIntervalMs?: number
  maxRetries?: number
}
export interface TransactionRequest {
  depositIds: string[]
  nonce?: number
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasLimit?: string
}
