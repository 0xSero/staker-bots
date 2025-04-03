import { ConnectionOptions, Queue, QueueEvents } from 'bullmq'
import { ethers } from 'ethers'
import { DatabaseWrapper } from 'modules/database'
import { DatabaseConfig } from 'modules/database/DatabaseWrapper'
import { QUEUE_NAMES } from '../lib/queue-definitions'
import { Logger } from '../types/logger'
import { DatabaseClient } from '../clients/database.client'

export class WorkerConfigFactory {
  constructor(
    private readonly connection: ConnectionOptions,
    private readonly databaseWrapper: DatabaseWrapper,
    private readonly provider: ethers.Provider,
    private readonly queues: Record<string, Queue>,
    private readonly logger: Logger,
    private readonly contractAbi: any, // TODO: Load from file
    private readonly govLstAbi: any, // TODO: Load from file
  ) {}

  createDatabaseWorkerConfig() {
    const config: DatabaseConfig = {
      type: 'json',
      fallbackToJson: true
    }
    return {
      connection: this.connection,
      databaseConfig: config,
      concurrency: 2,
      stalledInterval: 30000,
      maxStalledCount: 3
    }
  }

  createMonitorWorkerConfig() {
    return {
      connection: this.connection,
      provider: this.provider,
      contractAddress: process.env.STAKER_CONTRACT_ADDRESS!,
      contractAbi: this.contractAbi,
      logger: this.logger,
      databaseQueue: this.queues[QUEUE_NAMES.DATABASE_OPERATIONS],
      database: this.databaseWrapper,
      concurrency: 1,
      pollingInterval: 15000,
      maxBlockRange: 500,
      confirmations: 3,
      stalledInterval: 30000,
      maxStalledCount: 3
    }
  }

  createExecutorWorkerConfig() {
    const wallet = new ethers.Wallet(
      process.env.EXECUTOR_PRIVATE_KEY!,
      this.provider
    )

    return {
      connection: this.connection,
      provider: this.provider,
      contractAddress: process.env.STAKER_CONTRACT_ADDRESS!,
      contractAbi: this.contractAbi,
      wallet,
      resultQueue: this.queues[QUEUE_NAMES.RESULT_PROCESSING],
      maxBatchSize: 50,
      concurrency: 1,
      minConfirmations: 3,
      maxGasPrice: ethers.parseUnits('100', 'gwei').toString(),
      gasLimitMultiplier: 1.1,
      retryIntervalMs: 15000,
      maxRetries: 3,
      stalledInterval: 60000,
      maxStalledCount: 2,
      logger: this.logger
    }
  }

  createProfitabilityWorkerConfig() {
    return {
      connection: this.connection,
      provider: this.provider,
      govLstAddress: process.env.GOVLST_ADDRESS!,
      govLstAbi: this.govLstAbi,
      stakerAddress: process.env.STAKER_CONTRACT_ADDRESS!,
      stakerAbi: this.contractAbi,
      executorQueue: this.queues[QUEUE_NAMES.TRANSACTION_EXECUTION],
      minProfitMargin: ethers.parseEther('0.01').toString(),
      gasPriceBuffer: '20',
      maxBatchSize: 50,
      concurrency: 2,
      tipReceiver: process.env.TIP_RECEIVER || ethers.ZeroAddress,
      priceFeedCacheDuration: 300000,
      stalledInterval: 30000,
      maxStalledCount: 3
    }
  }

  createDepositScanWorkerConfig() {
    const databaseClient = new DatabaseClient()

    return {
      connection: this.connection,
      databaseClient,
      rewardCheckQueue: this.queues[QUEUE_NAMES.REWARD_CHECK],
      logger: this.logger,
      scanInterval: 300000, // 5 minutes
      batchSize: 100
    }
  }

  createRewardCheckerWorkerConfig() {
    return {
      connection: this.connection,
      provider: this.provider,
      contractAddress: process.env.STAKER_CONTRACT_ADDRESS!,
      contractAbi: this.contractAbi,
      profitabilityQueue: this.queues[QUEUE_NAMES.PROFITABILITY_ANALYSIS],
      logger: this.logger,
      concurrency: 1,
      batchSize: 50,
      retryDelayMs: 15000,
      maxRetries: 3,
      stalledInterval: 30000,
      maxStalledCount: 3
    }
  }
}
