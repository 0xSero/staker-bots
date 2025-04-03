import 'dotenv/config'
import { Logger } from './types/logger'
import { loadConfig } from './config/index'
import { ComponentFactory } from './factories/ComponentFactory'

class ConsoleLogger implements Logger {
  constructor(private level: 'debug' | 'info' | 'warn' | 'error' = 'info') {}

  info(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      console.log(message, meta || '')
    }
  }

  error(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      console.error(message, meta || '')
    }
  }

  warn(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      console.warn(message, meta || '')
    }
  }

  debug(message: string, meta?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      console.debug(message, meta || '')
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error']
    return levels.indexOf(level) >= levels.indexOf(this.level)
  }
}

async function main() {
  const logger = new ConsoleLogger(process.env.LOG_LEVEL as any || 'info')
  logger.info('Starting GovLst Staking Application with BullMQ...')

  try {
    // Load configuration
    const config = loadConfig()

    // Create component factory
    const factory = new ComponentFactory(config, logger)

    // Initialize and start components
    await factory.initialize()
    await factory.start()

    logger.info('Application startup complete')

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down application...')
      await factory.stop()
      logger.info('Application shutdown complete')
      process.exit(0)
    }

    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (error) {
    logger.error('Error during application startup', {
      error: error instanceof Error ? error : new Error(String(error))
    })
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Unhandled error:', error)
  process.exit(1)
})
