import { Job, Queue, ConnectionOptions } from 'bullmq'
import { ethers } from 'ethers'
import { Deposit } from './database-operations'

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
  rewards: RewardData[]
}

export interface RewardData {
  depositId: string
  amount: string // BigInt as string
  token: string // Token address
  lastClaimBlock: number
  isClaimable: boolean
}

export type RewardCheckJob = Job<RewardCheckJobData, RewardCheckJobResult>

export const REWARD_CHECK_JOB_OPTIONS = {
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

export interface RewardCheckerConfig {
  connection: ConnectionOptions
  provider: ethers.Provider
  contractAddress: string
  contractAbi: any
  profitabilityQueue: Queue
  concurrency?: number
  maxBatchSize?: number
}

export interface RewardAggregationResult {
  rewards: RewardData[]
  error?: string
}
