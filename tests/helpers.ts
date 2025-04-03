import { Logger } from '../src/types/logger'
import { ApplicationConfig } from '../src/config';
import { ComponentFactory } from '../src/factories/ComponentFactory'
import { Queue } from 'bullmq'

export class TestLogger implements Logger {
  public logs: Array<{ level: string; message: string; meta?: Record<string, any> }> = []

  info(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'info', message, meta })
  }

  error(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'error', message, meta })
  }

  warn(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'warn', message, meta })
  }

  debug(message: string, meta?: Record<string, any>): void {
    this.logs.push({ level: 'debug', message, meta })
  }

  clear(): void {
    this.logs = []
  }

  getLogsByLevel(level: string): Array<{ message: string; meta?: Record<string, any> }> {
    return this.logs
      .filter(log => log.level === level)
      .map(({ message, meta }) => ({ message, meta }))
  }
}

export function createTestConfig(): ApplicationConfig {
  return {
    orchestrator: {
      maxConcurrentJobs: 5,
      healthCheckInterval: 1000,
      circuitBreakerThreshold: 3,
      recoveryTimeout: 5000
    },
    flowControl: {
      defaultRateLimit: {
        maxTokens: 50,
        refillRate: 5
      },
      queueSpecificLimits: {
        execution: {
          maxTokens: 25,
          refillRate: 2
        }
      },
      maxConcurrentJobs: 5,
      backpressureThreshold: 100
    },
    health: {
      checkInterval: 1000,
      unhealthyThreshold: 3,
      recoveryThreshold: 2
    }
  }
}

export async function createTestFactory(): Promise<{
  factory: ComponentFactory
  logger: TestLogger
  cleanup: () => Promise<void>
}> {
  const logger = new TestLogger()
  const config = createTestConfig()
  const factory = new ComponentFactory(config, logger)

  const cleanup = async () => {
    await factory.stop()
    logger.clear()
  }

  return { factory, logger, cleanup }
}

export async function waitForQueueSize(queue: Queue, size: number, timeout = 5000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const jobCounts = await queue.getJobCounts()
    if (jobCounts.waiting === size) return
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Queue size did not reach ${size} within ${timeout}ms`)
}

export async function waitForQueueEmpty(queue: Queue, timeout = 5000): Promise<void> {
  return waitForQueueSize(queue, 0, timeout)
}

export async function waitForCondition(
  condition: () => Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await condition()) return
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  throw new Error(`Condition not met within ${timeout}ms`)
}
