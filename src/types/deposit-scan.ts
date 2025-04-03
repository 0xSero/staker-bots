import { Job, Queue, ConnectionOptions } from 'bullmq'
import { Deposit } from './database-operations'
import { DatabaseClient } from '../clients/database.client'

export enum DepositScanType {
  ALL = 'all',
  RANGE = 'range',
  SPECIFIC = 'specific'
}

export interface DepositScanJobData {
  scanType: DepositScanType
  depositIds?: string[]
  fromBlock?: number
  toBlock?: number
  timestamp: number
  batchId: string // For correlating batches of deposits
}

export interface DepositScanJobResult {
  success: boolean
  error?: string
  scannedDeposits: Deposit[]
  scanType: DepositScanType
  fromBlock?: number
  toBlock?: number
  timestamp: number
  batchId: string
}

export type DepositScanJob = Job<DepositScanJobData, DepositScanJobResult>

export const DEPOSIT_SCAN_JOB_OPTIONS = {
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

export interface DepositScanSchedulerConfig {
  // How often to scan for deposits (in milliseconds)
  scanInterval: number
  // Maximum number of blocks to scan in one batch
  maxBlockRange: number
  // Maximum number of deposits to process in one batch
  maxBatchSize: number
  // Number of confirmations required before scanning a block
  requiredConfirmations: number
  // Whether to enable automatic scanning
  enabled: boolean
}

export interface DepositScanWorkerConfig {
  connection: ConnectionOptions
  databaseClient: DatabaseClient
  rewardCheckQueue: Queue<RewardCheckJobData, RewardCheckJobResult>
  concurrency?: number
  maxBatchSize?: number
}

// For batching deposits into reward check jobs
export interface DepositBatch {
  batchId: string
  deposits: Deposit[]
  timestamp: number
}

// Temporary placeholder until we implement reward check types
export interface RewardCheckJobData {
  deposits: Deposit[]
  batchId: string
  timestamp: number
}

export interface RewardCheckJobResult {
  success: boolean
  error?: string
  batchId: string
  timestamp: number
}
