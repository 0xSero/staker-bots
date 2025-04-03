import 'dotenv/config'
import { Logger } from './shared/Logger'
import { loadConfig } from './config/index'
import { ComponentFactory } from './factories/ComponentFactory'
import { WorkerManager } from './workers'
import { WorkerConfigFactory } from './factories/WorkerConfigFactory'
import { createQueues } from './lib/queue-definitions'
import { DatabaseWrapper } from 'modules/database'
import { QueueFactory } from './lib/queue-factory'
import { RedisConnectionManager, RedisConfig } from './lib/redis-connection-manager'
import { MetricsDashboard } from './metrics/MetricsDashboard'
import { CONFIG } from 'modules/config'

async function main() {
  const logger = new Logger(process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error' || 'info')
  logger.info('Starting GovLst Staking Application with BullMQ...')

  try {
    // Load configuration
    const config = loadConfig()

    // Use the correct start block from modules/config.ts
    if (!process.env.START_BLOCK && CONFIG.monitor.startBlock) {
      process.env.START_BLOCK = CONFIG.monitor.startBlock.toString();
      logger.info(`Using start block from config: ${CONFIG.monitor.startBlock}`);
    }

    // Parse components to run
    const componentsParam = process.env.COMPONENTS || 'all'
    const components = componentsParam === 'all'
      ? ['all']
      : componentsParam.split(',').map(c => c.trim())

    logger.info('Initializing components', { components })

    // Set up Redis connection manager
    const redisConfig: RedisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (times: number) => {
        return Math.min(times * 50, 2000)
      }
    }

    const redisConnectionManager = RedisConnectionManager.getInstance(redisConfig)

    // Set up queues using QueueFactory
    const queueFactory = new QueueFactory(redisConnectionManager)
    const queues = createQueues(queueFactory)

    logger.info('Created queues', { queueNames: Object.keys(queues) })

    // Initialize database
    const database = new DatabaseWrapper({
      type: 'json',
      fallbackToJson: true
    })

    // Create worker config factory
    const workerConfigFactory = new WorkerConfigFactory(
      redisConnectionManager.getBullMQConnection(),
      database,
      config.provider,
      queues,
      logger,
      config.contractAbi,
      config.govLstAbi
    )

    // Create worker manager
    const workerManager = new WorkerManager(logger, workerConfigFactory)

    // Start bull board if enabled
    let dashboard: MetricsDashboard | null = null

    if (process.env.BULL_BOARD === 'true') {
      logger.info('Initializing BullBoard dashboard...')

      const port = parseInt(process.env.BULL_BOARD_PORT || '3000', 10)
      const basePath = process.env.BULL_BOARD_BASE_PATH || '/'

      // Initialize dashboard
      dashboard = MetricsDashboard.getInstance({
        port,
        basePath,
        username: process.env.BULL_BOARD_USERNAME || 'admin',
        password: process.env.BULL_BOARD_PASSWORD || 'admin'
      })

      // Register all queues with the dashboard
      for (const queue of Object.values(queues)) {
        dashboard.registerQueue(queue)
      }

      // Start the dashboard
      await dashboard.start()
      logger.info(`BullBoard dashboard started at http://localhost:${port}${basePath}`, {
        port,
        basePath,
        username: process.env.BULL_BOARD_USERNAME || 'admin'
      })
    }

    // Register workers based on components
    await workerManager.registerWorkers(components)

    logger.info('Application startup complete', {
      activeComponents: workerManager.getActiveWorkers(),
      bullBoardEnabled: process.env.BULL_BOARD === 'true'
    })

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down application...')

      // Stop workers
      await workerManager.stopWorkers()

      // Stop dashboard if running
      if (dashboard) {
        await dashboard.stop()
      }

      // Close queues
      await queueFactory.closeAll()
      await redisConnectionManager.closeAll()

      logger.info('Application shutdown complete')
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    logger.error('Error during application startup', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
