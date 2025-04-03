import { Worker, QueueEvents, Job } from 'bullmq'
import { ethers } from 'ethers'
import {
  ProfitabilityJobData,
  ProfitabilityJobResult,
  ProfitabilityConfig,
  ProfitabilityResult,
  PROFITABILITY_JOB_OPTIONS,
  GasEstimate,
  TokenPrice
} from '../types/profitability'
import { WorkerMetrics, WorkerMetricsData } from '../utils/metrics'
import { QUEUE_NAMES } from '../lib/queue-definitions'
import { RewardData } from '../types/reward-check'
import { GovLstProfitabilityEngineWrapper } from '../../modules/profitability/ProfitabilityEngineWrapper'
import { Logger } from '@/shared/Logger'
import { IExecutor } from '../../modules/executor/interfaces/IExecutor'
import { GovLstDeposit, GovLstDepositGroup } from '../../modules/profitability/interfaces/types'
import { DatabaseWrapper } from 'modules/database'

export class ProfitabilityWorker {
  private worker: Worker<ProfitabilityJobData, ProfitabilityJobResult>
  private metrics: WorkerMetrics
  private queueEvents: QueueEvents
  private profitabilityEngine: GovLstProfitabilityEngineWrapper
  private readonly logger: Logger

  constructor(
    private config: ProfitabilityConfig,
    private database: DatabaseWrapper,
    private executor: IExecutor,
    logger: Logger
  ) {
    this.logger = logger
    this.metrics = new WorkerMetrics('profitability-worker')

    // Initialize GovLstProfitabilityEngineWrapper
    this.profitabilityEngine = new GovLstProfitabilityEngineWrapper(
      database,
      new ethers.Contract(
        config.govLstAddress,
        config.govLstAbi,
        config.provider
      ),
      new ethers.Contract(
        config.stakerAddress,
        config.stakerAbi,
        config.provider
      ),
      config.provider,
      this.logger,
      {
        minProfitMargin: BigInt(config.minProfitMargin),
        gasPriceBuffer: Number(config.gasPriceBuffer),
        maxBatchSize: config.maxBatchSize || 50,
        rewardTokenAddress: config.govLstAddress,
        defaultTipReceiver: config.tipReceiver,
        priceFeed: {
          cacheDuration: config.priceFeedCacheDuration
        }
      },
      executor
    )

    // Create worker
    this.worker = new Worker<ProfitabilityJobData, ProfitabilityJobResult>(
      QUEUE_NAMES.PROFITABILITY_ANALYSIS,
      this.processProfitabilityCheck.bind(this),
      {
        connection: config.connection,
        concurrency: config.concurrency || 3,
        lockDuration: 30000 // 30 seconds
      }
    )

    // Create queue events listener
    this.queueEvents = new QueueEvents(QUEUE_NAMES.PROFITABILITY_ANALYSIS, {
      connection: config.connection
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.worker.on('completed', job => {
      const processingTime = Date.now() - job.timestamp
      this.metrics.recordSuccess(processingTime)
      this.logger.info('Job completed successfully', {
        jobId: job.id,
        processingTime
      } as Record<string, any>)
    })

    this.worker.on('failed', (job, error) => {
      if (job) {
        const processingTime = Date.now() - job.timestamp
        this.metrics.recordFailure(processingTime)
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      this.logger.error(`Job ${job?.id} failed:`, {
        error: errorMessage,
        stack: errorStack,
        jobId: job?.id
      } as Record<string, any>)
    })

    this.queueEvents.on('waiting', ({ jobId }) => {
      this.logger.info(`Job ${jobId} is waiting to be processed`, {
        jobId
      } as Record<string, any>)
    })

    this.queueEvents.on('active', ({ jobId, prev }) => {
      this.logger.info(`Job ${jobId} is now active`, {
        jobId,
        previousState: prev
      } as Record<string, any>)
    })
  }

  private async processProfitabilityCheck(
    job: Job<ProfitabilityJobData, ProfitabilityJobResult>
  ): Promise<ProfitabilityJobResult> {
    const { deposits, batchId, timestamp } = job.data

    try {
      // First check rewards for all deposits
      const rewardsData = await this.checkRewardsForDeposits(deposits)

      // Filter deposits with rewards
      const depositsWithRewards = deposits.filter((deposit, index) =>
        rewardsData[index] && ethers.toBigInt(rewardsData[index].amount) > 0n
      )

      if (depositsWithRewards.length === 0) {
        this.logger.info('No deposits found with unclaimed rewards', {
          batchId,
          timestamp
        } as Record<string, any>)
        return {
          success: true,
          profitableRewards: [],
          batchId,
          timestamp
        }
      }

      // Analyze profitability using the engine
      const analysis = await this.profitabilityEngine.analyzeAndGroupDeposits(
        depositsWithRewards.map(deposit => ({
          deposit_id: BigInt(deposit.id),
          owner_address: deposit.owner,
          depositor_address: deposit.depositor,
          delegatee_address: deposit.delegatee || '',
          amount: BigInt(deposit.amount),
          shares_of: BigInt(deposit.amount),
          payout_amount: BigInt(0),
          rewards: BigInt(0),
          earning_power: BigInt(0),
          created_at: deposit.createdAt,
          updated_at: deposit.updatedAt
        }))
      )

      // Check profitability for each group
      const profitabilityResults: ProfitabilityResult[] = []
      for (const group of analysis.deposit_groups) {
        const deposits = await this.getDepositsForGroup(group)
        const profitabilityCheck = await this.profitabilityEngine.checkGroupProfitability(deposits)

        if (profitabilityCheck.is_profitable) {
          profitabilityResults.push(...deposits.map(deposit => ({
            depositId: deposit.deposit_id.toString(),
            rewardAmount: deposit.rewards.toString(),
            token: this.config.govLstAddress,
            estimatedGasCost: profitabilityCheck.estimates.gas_estimate.toString(),
            profitMargin: profitabilityCheck.estimates.expected_profit.toString(),
            isProfitable: true
          })))
        }
      }

      // Queue profitable transactions if any found
      if (profitabilityResults.length > 0) {
        await this.queueProfitableRewards(profitabilityResults, batchId)
      }

      return {
        success: true,
        profitableRewards: profitabilityResults,
        batchId,
        timestamp
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      this.logger.error('Error in profitability check:', {
        error: errorMessage,
        stack: errorStack,
        batchId,
        timestamp
      } as Record<string, any>)
      return {
        success: false,
        error: errorMessage,
        profitableRewards: [],
        batchId,
        timestamp
      }
    }
  }

  private async getDepositsForGroup(group: GovLstDepositGroup): Promise<GovLstDeposit[]> {
    const deposits: GovLstDeposit[] = []
    for (const depositId of group.deposit_ids) {
      const deposit = await this.database.getDeposit(depositId.toString())
      if (deposit) {
        deposits.push({
          deposit_id: BigInt(deposit.deposit_id),
          owner_address: deposit.owner_address,
          depositor_address: deposit.depositor_address,
          delegatee_address: deposit.delegatee_address || '',
          amount: BigInt(deposit.amount),
          shares_of: BigInt(deposit.amount),
          payout_amount: BigInt(0),
          rewards: BigInt(0),
          earning_power: BigInt(deposit.earning_power || '0'),
          created_at: deposit.created_at || new Date().toISOString(),
          updated_at: deposit.updated_at || new Date().toISOString()
        })
      }
    }
    return deposits
  }

  private async checkRewardsForDeposits(deposits: ProfitabilityJobData['deposits']): Promise<RewardData[]> {
    try {
      const stakerContract = new ethers.Contract(
        this.config.stakerAddress,
        this.config.stakerAbi,
        this.config.provider
      )

      // Use multicall to check rewards for all deposits
      const rewardCheckCalls = deposits.map(deposit => ({
        depositId: deposit.id,
        call: stakerContract.interface.encodeFunctionData('unclaimedReward', [deposit.id])
      }))

      const results = await Promise.all(
        rewardCheckCalls.map(async ({ depositId }) => {
          try {
            // Ensure the function exists before calling
            if (typeof stakerContract.unclaimedReward !== 'function') {
              this.logger.error('unclaimedReward function not found on stakerContract', { depositId })
              return null;
            }
            const unclaimedReward = await stakerContract.unclaimedReward(depositId)
            return {
              depositId,
              amount: unclaimedReward.toString(),
              token: this.config.govLstAddress,
              lastClaimBlock: await this.config.provider.getBlockNumber(),
              isClaimable: unclaimedReward > 0n
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            const errorStack = error instanceof Error ? error.stack : undefined
            this.logger.error(`Error checking rewards for deposit ${depositId}:`, {
              error: errorMessage,
              stack: errorStack,
              depositId
            } as Record<string, any>)
            return null
          }
        })
      )

      return results.filter((result): result is RewardData => result !== null)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : undefined
      this.logger.error('Error checking rewards:', {
        error: errorMessage,
        stack: errorStack
      } as Record<string, any>)
      return []
    }
  }

  private async queueProfitableRewards(
    rewards: ProfitabilityResult[],
    batchId: string
  ): Promise<void> {
    await this.config.executorQueue.add(
      'execute-claims',
      {
        rewards,
        batchId,
        timestamp: Date.now()
      },
      {
        ...PROFITABILITY_JOB_OPTIONS,
        jobId: `execute-${batchId}`
      }
    )
  }

  public async start(): Promise<void> {
    await this.profitabilityEngine.start()
  }

  public async stop(): Promise<void> {
    await this.profitabilityEngine.stop()
    await this.worker.close()
    await this.queueEvents.close()
  }

  public getMetrics(): WorkerMetricsData {
    return this.metrics.getMetrics()
  }
}
