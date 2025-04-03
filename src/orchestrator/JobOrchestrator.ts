import { Queue, QueueEvents } from 'bullmq'
import { Logger } from '../shared/Logger'
import {
  OrchestratorConfig,
  JobCompletionHandler,
  QueueDependency,
  ComponentHealth,
  SystemHealth
} from './types'
import { EventEmitter } from 'events'

export class JobOrchestrator extends EventEmitter {
  private queueEvents: Map<string, QueueEvents> = new Map()
  private completionHandlers: Map<string, JobCompletionHandler[]> = new Map()
  private queueDependencies: QueueDependency[] = []
  private componentHealth: Map<string, ComponentHealth> = new Map()
  private isRunning: boolean = false
  private healthCheckInterval?: NodeJS.Timeout

  constructor(
    private queues: Record<string, Queue>,
    private logger: Logger,
    private config: OrchestratorConfig
  ) {
    super()
    this.initializeComponentHealth()
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('JobOrchestrator is already running')
      return
    }

    try {
      this.logger.info('Starting JobOrchestrator...')
      await this.setupQueueEvents()
      this.setupCompletionHandlers()
      this.startHealthCheck()
      this.isRunning = true
      this.logger.info('JobOrchestrator started successfully')
    } catch (error) {
      this.logger.error('Failed to start JobOrchestrator', { error })
      throw error
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('JobOrchestrator is not running')
      return
    }

    try {
      this.logger.info('Stopping JobOrchestrator...')
      await this.cleanupQueueEvents()
      this.stopHealthCheck()
      this.isRunning = false
      this.logger.info('JobOrchestrator stopped successfully')
    } catch (error) {
      this.logger.error('Failed to stop JobOrchestrator', { error })
      throw error
    }
  }

  public addCompletionHandler(handler: JobCompletionHandler): void {
    const handlers = this.completionHandlers.get(handler.queueName) || []
    handlers.push(handler)
    this.completionHandlers.set(handler.queueName, handlers)
  }

  public addQueueDependency(dependency: QueueDependency): void {
    this.queueDependencies.push(dependency)
  }

  public getSystemHealth(): SystemHealth {
    const components = Object.fromEntries(this.componentHealth)
    const unhealthyCount = Array.from(this.componentHealth.values())
      .filter(health => health.status === 'unhealthy').length

    let overall: SystemHealth['overall'] = 'healthy'
    if (unhealthyCount > 0) {
      overall = unhealthyCount >= this.componentHealth.size / 2 ? 'unhealthy' : 'degraded'
    }

    return {
      overall,
      components,
      timestamp: new Date()
    }
  }

  private initializeComponentHealth(): void {
    Object.keys(this.queues).forEach(queueName => {
      this.componentHealth.set(queueName, {
        status: 'healthy',
        lastChecked: new Date(),
        errorCount: 0
      })
    })
  }

  private async setupQueueEvents(): Promise<void> {
    for (const [queueName, queue] of Object.entries(this.queues)) {
      const queueEvents = new QueueEvents(queue.name)

      queueEvents.on('completed', async ({ jobId, returnvalue }) => {
        await this.handleJobCompletion(queueName, jobId, returnvalue)
      })

      queueEvents.on('failed', ({ jobId, failedReason }) => {
        this.handleJobFailure(queueName, jobId, failedReason)
      })

      this.queueEvents.set(queueName, queueEvents)
    }
  }

  private setupCompletionHandlers(): void {
    // Set up default completion handlers based on queue dependencies
    this.queueDependencies.forEach(dependency => {
      this.addCompletionHandler({
        queueName: dependency.sourceQueue,
        handler: async (jobId: string, result: any) => {
          if (!dependency.condition || dependency.condition(result)) {
            await this.queues[dependency.targetQueue]?.add(
              `${dependency.sourceQueue}-${jobId}`,
              result
            )
          }
        }
      })
    })
  }

  private async handleJobCompletion(queueName: string, jobId: string, result: any): Promise<void> {
    try {
      const handlers = this.completionHandlers.get(queueName) || []
      await Promise.all(handlers.map(handler => handler.handler(jobId, result)))

      this.updateComponentHealth(queueName, 'healthy')
      this.emit('jobCompleted', { queueName, jobId, result })
    } catch (error) {
      this.logger.error('Error handling job completion', {
        queueName,
        jobId,
        error
      })
      this.updateComponentHealth(queueName, 'degraded', error instanceof Error ? error : new Error(String(error)))
    }
  }

  private handleJobFailure(queueName: string, jobId: string, reason: string): void {
    this.logger.error('Job failed', { queueName, jobId, reason })
    this.updateComponentHealth(queueName, 'degraded', new Error(reason))
    this.emit('jobFailed', { queueName, jobId, reason })
  }

  private updateComponentHealth(
    queueName: string,
    status: ComponentHealth['status'],
    error?: Error
  ): void {
    const health = this.componentHealth.get(queueName)
    if (!health) return

    health.status = status
    health.lastChecked = new Date()

    if (status === 'unhealthy' || status === 'degraded') {
      health.errorCount++
      health.message = error?.message

      if (health.errorCount >= this.config.circuitBreakerThreshold) {
        health.status = 'unhealthy'
        this.emit('circuitBreaker', { queueName, health })
      }
    } else {
      health.errorCount = 0
      health.message = undefined
    }

    this.componentHealth.set(queueName, health)
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.checkQueueHealth()
    }, this.config.healthCheckInterval)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }
  }

  private async checkQueueHealth(): Promise<void> {
    for (const [queueName, queue] of Object.entries(this.queues)) {
      try {
        const isPaused = await queue.isPaused()
        const jobCounts = await queue.getJobCounts()

        if (isPaused) {
          this.updateComponentHealth(queueName, 'degraded', new Error('Queue is paused'))
        } else if (jobCounts.failed && jobCounts.failed > this.config.circuitBreakerThreshold) {
          this.updateComponentHealth(queueName, 'unhealthy', new Error('Too many failed jobs'))
        } else {
          this.updateComponentHealth(queueName, 'healthy')
        }
      } catch (error) {
        this.updateComponentHealth(queueName, 'unhealthy', error as Error)
      }
    }
  }

  private async cleanupQueueEvents(): Promise<void> {
    const closePromises = Array.from(this.queueEvents.values()).map(queueEvents => {
      queueEvents.removeAllListeners()
      return queueEvents.close()
    })

    await Promise.all(closePromises)
    this.queueEvents.clear()
  }
}
