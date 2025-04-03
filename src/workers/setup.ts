import { Queue, ConnectionOptions } from 'bullmq'
import { ethers } from 'ethers'
import { MonitorWorker, MonitorWorkerConfig } from './monitor.worker'
import { ProfitabilityWorker } from './profitability.worker'
import { QUEUE_NAMES } from '@/lib/queue-definitions'
import { ProfitabilityJobData } from '../types/profitability'
import { DatabaseWrapper } from 'modules/database'
import { Logger } from '@/shared/Logger'
import { IExecutor } from 'modules/executor'

export interface WorkerSetupConfig {
  connection: ConnectionOptions
  provider: ethers.Provider
  stakerAddress: string
  stakerAbi: any
  govLstAddress: string
  govLstAbi: any
  database: DatabaseWrapper
  executor: IExecutor
  blockConfirmations?: number
  concurrency?: number
  minProfitMargin: string
  gasPriceBuffer: string
  maxBatchSize?: number
  tipReceiver: string
  priceFeedConfig: {
    apiKey: string
    baseUrl: string
    timeout: number
    cacheDuration: number
  }
  executorQueue: Queue
}

export async function setupWorkers(config: WorkerSetupConfig) {
  // Create loggers
  const monitorLogger = new Logger('info')
  const profitabilityLogger = new Logger('info')

  // Create profitability queue
  const profitabilityQueue = new Queue<ProfitabilityJobData>(
    QUEUE_NAMES.PROFITABILITY_ANALYSIS,
    {
      connection: config.connection
    }
  )

  // Initialize profitability worker
  const profitabilityWorker = new ProfitabilityWorker(
    {
      connection: config.connection,
      provider: config.provider,
      govLstAddress: config.govLstAddress,
      govLstAbi: config.govLstAbi,
      stakerAddress: config.stakerAddress,
      stakerAbi: config.stakerAbi,
      executorQueue: config.executorQueue,
      minProfitMargin: config.minProfitMargin,
      gasPriceBuffer: config.gasPriceBuffer,
      maxBatchSize: config.maxBatchSize,
      concurrency: config.concurrency,
      tipReceiver: config.tipReceiver,
      priceFeedCacheDuration: config.priceFeedConfig.cacheDuration
    },
    config.database,
    config.executor,
    profitabilityLogger
  )

  // Initialize monitor worker
  const monitorConfig: MonitorWorkerConfig = {
    connection: config.connection,
    provider: config.provider,
    contractAddress: config.stakerAddress,
    contractAbi: config.stakerAbi,
    blockConfirmations: config.blockConfirmations,
    concurrency: config.concurrency,
    profitabilityQueue
  }

  const monitorWorker = new MonitorWorker(monitorConfig)

  // Start workers
  await Promise.all([
    profitabilityWorker.start(),
    monitorWorker.start()
  ])

  // Return worker instances for management
  return {
    monitorWorker,
    profitabilityWorker,
    profitabilityQueue,
    cleanup: async () => {
      await Promise.all([
        profitabilityWorker.stop(),
        monitorWorker.stop(),
        profitabilityQueue.close()
      ])
    }
  }
}
