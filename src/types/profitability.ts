import { Job, Queue, ConnectionOptions } from 'bullmq'
import { ethers } from 'ethers'
import { RewardData } from './reward-check'

export interface Deposit {
  id: string
  owner: string
  depositor?: string
  delegatee?: string
  amount: string
  createdAt: string
  updatedAt: string
}

export interface ProfitabilityJobData {
  deposits: Deposit[]
  batchId: string
  timestamp: number
  gasPrice?: string // Optional override for gas price
}

export interface ProfitabilityJobResult {
  success: boolean
  error?: string
  batchId: string
  timestamp: number
  profitableRewards: ProfitabilityResult[]
}

export interface ProfitabilityResult {
  depositId: string
  rewardAmount: string // BigInt as string
  token: string
  estimatedGasCost: string // BigInt as string
  profitMargin: string // BigInt as string
  isProfitable: boolean
}

export type ProfitabilityJob = Job<ProfitabilityJobData, ProfitabilityJobResult>

export const PROFITABILITY_JOB_OPTIONS = {
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

export interface ProfitabilityConfig {
  connection: ConnectionOptions
  provider: ethers.Provider
  govLstAddress: string
  govLstAbi: any
  stakerAddress: string
  stakerAbi: any
  executorQueue: Queue
  minProfitMargin: string
  gasPriceBuffer: string
  maxBatchSize?: number
  concurrency?: number
  tipReceiver: string
  priceFeedCacheDuration: number
}

export interface GasEstimate {
  gasLimit: string // BigInt as string
  gasPrice: string // BigInt as string
  totalCost: string // BigInt as string
}

export interface TokenPrice {
  token: string
  usdPrice: string // BigInt as string, with 18 decimals
  timestamp: number
}
