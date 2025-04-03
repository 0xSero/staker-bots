import { Logger } from '@/shared/Logger'
import { MonitorWorker } from './monitor.worker'
import { DatabaseWorker } from './database.worker'
import { DepositScannerWorker } from './deposit-scanner.worker'
import { RewardCheckerWorker } from './reward-checker.worker'
import { ProfitabilityWorker } from './profitability.worker'
import { ExecutorWorker } from './executor.worker'
import { WorkerConfigFactory } from '../factories/WorkerConfigFactory'

export interface WorkerRegistry {
  monitor?: MonitorWorker
  database?: DatabaseWorker
  depositScanner?: DepositScannerWorker
  rewardChecker?: RewardCheckerWorker
  profitability?: ProfitabilityWorker
  executor?: ExecutorWorker
}

export class WorkerManager {
  private workers: WorkerRegistry = {}

  constructor(
    private readonly logger: Logger,
    private readonly configFactory: WorkerConfigFactory
  ) {}

  async registerWorkers(components: string[] = ['all']): Promise<void> {
    this.logger.info('Registering workers...', { components })

    const shouldRunAll = components.includes('all')

    try {
      // Database worker is always needed
      this.workers.database = new DatabaseWorker(
        this.configFactory.createDatabaseWorkerConfig()
      )
      await this.workers.database.start()
      this.logger.info('Database worker registered')

      // Register monitor worker if enabled
      if (shouldRunAll || components.includes('monitor')) {
        this.workers.monitor = new MonitorWorker(
          this.configFactory.createMonitorWorkerConfig()
        )
        await this.workers.monitor.start()
        this.logger.info('Monitor worker registered')
      }

      // Register executor worker if enabled
      if (shouldRunAll || components.includes('executor')) {
        const executorConfig = this.configFactory.createExecutorWorkerConfig()
        if (!executorConfig.resultQueue) {
          throw new Error('Executor worker requires a resultQueue in its configuration.')
        }
        this.workers.executor = new ExecutorWorker({
          ...executorConfig,
          resultQueue: executorConfig.resultQueue!
        })
        await this.workers.executor.start()
        this.logger.info('Executor worker registered')
      }

      // Register profitability-related workers if enabled
      if (shouldRunAll || components.includes('profitability')) {
        // Check required dependencies first
        if (!this.workers.database) {
            throw new Error('Database worker must be registered before profitability workers.')
        }
        if (!this.workers.executor) {
            throw new Error('Executor worker must be registered before profitability workers.')
        }

        // Register profitability worker
        const profitabilityConfig = this.configFactory.createProfitabilityWorkerConfig()
        if (!profitabilityConfig.executorQueue) {
          throw new Error('Profitability worker requires an executorQueue in its configuration.')
        }
        this.workers.profitability = new ProfitabilityWorker({
            ...profitabilityConfig,
            executorQueue: profitabilityConfig.executorQueue!
          },
          this.workers.database.getDatabase(),
          this.workers.executor.getExecutor(),
          new Logger('info') // Consider passing the main logger
        )
        await this.workers.profitability.start()
        this.logger.info('Profitability worker registered')

        // Register deposit scanner worker
        const depositScannerConfig = this.configFactory.createDepositScanWorkerConfig()
        if (!depositScannerConfig.rewardCheckQueue) {
          throw new Error('Deposit scanner worker requires a rewardCheckQueue in its configuration.')
        }
        this.workers.depositScanner = new DepositScannerWorker({
          ...depositScannerConfig,
          rewardCheckQueue: depositScannerConfig.rewardCheckQueue!
        })
        await this.workers.depositScanner.start()
        this.logger.info('Deposit scanner worker registered')

        // Register reward checker worker
        const rewardCheckerConfig = this.configFactory.createRewardCheckerWorkerConfig()
        if (!rewardCheckerConfig.profitabilityQueue) {
          throw new Error('Reward checker worker requires a profitabilityQueue in its configuration.')
        }
        this.workers.rewardChecker = new RewardCheckerWorker({
          ...rewardCheckerConfig,
          profitabilityQueue: rewardCheckerConfig.profitabilityQueue!
        })
        await this.workers.rewardChecker.start()
        this.logger.info('Reward checker worker registered')
      }

      this.logger.info('Worker registration complete', {
        registeredWorkers: Object.keys(this.workers)
      })
    } catch (error) {
      this.logger.error('Error registering workers', { error })
      // Stop any workers that were started
      await this.stopWorkers()
      throw error
    }
  }

  async stopWorkers(): Promise<void> {
    this.logger.info('Stopping workers...')

    const stopPromises = Object.entries(this.workers).map(async ([name, worker]) => {
      try {
        if (worker) {
          await worker.stop()
          this.logger.info(`Stopped ${name} worker`)
        }
      } catch (error) {
        this.logger.error(`Error stopping ${name} worker`, { error })
      }
    })

    await Promise.all(stopPromises)
    this.workers = {}
    this.logger.info('All workers stopped')
  }

  getWorker<T extends keyof WorkerRegistry>(name: T): WorkerRegistry[T] {
    const worker = this.workers[name]
    if (!worker) {
      throw new Error(`Worker ${String(name)} not found or not initialized`)
    }
    return worker
  }

  getActiveWorkers(): string[] {
    return Object.keys(this.workers)
  }
}
