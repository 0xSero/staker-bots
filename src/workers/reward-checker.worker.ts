import { Worker, Queue, QueueEvents, Job } from 'bullmq'
import { ethers } from 'ethers'
import {
  RewardCheckJobData,
  RewardCheckJobResult,
  RewardCheckerConfig,
  RewardData,
  REWARD_CHECK_JOB_OPTIONS,
  RewardAggregationResult
} from '../types/reward-check';
import { WorkerMetrics, WorkerMetricsData } from '../utils/metrics'
import { QUEUE_NAMES } from '@/lib/queue-definitions';
import { Deposit } from '../types/database-operations'

export class RewardCheckerWorker {
  private worker: Worker<RewardCheckJobData, RewardCheckJobResult>
  private metrics: WorkerMetrics
  private queueEvents: QueueEvents
  private contract: ethers.Contract

  constructor(private readonly config: RewardCheckerConfig) {
    this.metrics = new WorkerMetrics('reward-checker-worker')
    this.contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      config.provider
    )

    // Create worker
    this.worker = new Worker<RewardCheckJobData, RewardCheckJobResult>(
      QUEUE_NAMES.REWARD_CHECK,
      this.processRewardCheck.bind(this),
      {
        connection: config.connection,
        concurrency: config.concurrency || 3,
        lockDuration: 30000 // 30 seconds
      }
    )

    // Create queue events listener
    this.queueEvents = new QueueEvents(QUEUE_NAMES.REWARD_CHECK, {
      connection: config.connection
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.worker.on('completed', job => {
      const processingTime = Date.now() - job.timestamp
      this.metrics.recordSuccess(processingTime)
    })

    this.worker.on('failed', (job, error) => {
      if (job) {
        const processingTime = Date.now() - job.timestamp
        this.metrics.recordFailure(processingTime)
      }
      console.error(`Job ${job?.id} failed:`, error)
    })

    this.queueEvents.on('waiting', ({ jobId }) => {
      console.log(`Job ${jobId} is waiting to be processed`)
    })

    this.queueEvents.on('active', ({ jobId, prev }) => {
      console.log(`Job ${jobId} is now active; previous state was ${prev}`)
    })
  }

  private async processRewardCheck(
    job: Job<RewardCheckJobData, RewardCheckJobResult>
  ): Promise<RewardCheckJobResult> {
    const { deposits, batchId, timestamp } = job.data

    try {
      // Process deposits in smaller chunks if needed
      const maxBatchSize = this.config.maxBatchSize || 50
      const rewardResults: RewardAggregationResult[] = []

      for (let i = 0; i < deposits.length; i += maxBatchSize) {
        const batchDeposits = deposits.slice(i, i + maxBatchSize)
        const result = await this.checkRewardsForBatch(batchDeposits)
        rewardResults.push(result)
      }

      // Aggregate results
      const allRewards = rewardResults.flatMap(result => result.rewards)
      const errors = rewardResults
        .map(result => result.error)
        .filter((error): error is string => !!error)

      // Queue profitable rewards for claiming if any
      const profitableRewards = allRewards.filter(reward => reward.isClaimable)
      if (profitableRewards.length > 0) {
        await this.queueProfitableRewards(profitableRewards, batchId)
      }

      return {
        success: errors.length === 0,
        error: errors.length > 0 ? errors.join('; ') : undefined,
        rewards: allRewards,
        batchId,
        timestamp
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        rewards: [],
        batchId,
        timestamp
      }
    }
  }

  private async checkRewardsForBatch(
    deposits: Deposit[]
  ): Promise<RewardAggregationResult> {
    try {
      // Prepare multicall data for checking rewards
      const rewardCheckCalls = deposits.map(deposit => ({
        depositId: deposit.id,
        call: this.contract.interface.encodeFunctionData('getRewards', [deposit.id])
      }))

      // Execute multicall
      const results = await Promise.all(
        rewardCheckCalls.map(async ({ depositId, call }) => {
          try {
            const result = await this.contract.getRewards?.staticCall(depositId)
            return {
              depositId,
              ...this.parseRewardResult(result)
            }
          } catch (error) {
            console.error(`Error checking rewards for deposit ${depositId}:`, error)
            return null
          }
        })
      )

      // Filter out failed checks and format results
      const rewards = results
        .filter((result): result is RewardData => result !== null)
        .map(reward => ({
          ...reward,
          isClaimable: this.isProfitableToClaim(reward)
        }))

      return { rewards }
    } catch (error) {
      return {
        rewards: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private parseRewardResult(result: any): Omit<RewardData, 'depositId'> {
    // Implementation depends on contract return type
    return {
      amount: result.amount.toString(),
      token: result.token,
      lastClaimBlock: result.lastClaimBlock,
      isClaimable: false // Will be set later based on profitability check
    }
  }

  private isProfitableToClaim(reward: RewardData): boolean {
    // Implementation depends on profitability calculation logic
    // This should consider gas costs, token price, etc.
    const rewardAmount = ethers.toBigInt(reward.amount)
    const minProfitableAmount = ethers.toBigInt(0)
    return rewardAmount > minProfitableAmount
  }

  private async queueProfitableRewards(
    rewards: RewardData[],
    batchId: string
  ): Promise<void> {
    await this.config.profitabilityQueue.add(
      'check-profitability',
      {
        rewards,
        batchId,
        timestamp: Date.now()
      },
      {
        ...REWARD_CHECK_JOB_OPTIONS,
        jobId: `profitability-${batchId}`
      }
    )
  }

  public async start(): Promise<void> {
    // Worker is automatically started on creation
  }

  public async stop(): Promise<void> {
    await this.worker.close()
    await this.queueEvents.close()
  }

  public getMetrics(): WorkerMetricsData {
    return this.metrics.getMetrics()
  }
}
