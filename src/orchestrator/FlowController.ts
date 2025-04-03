import { Queue, Worker } from 'bullmq'
import { Logger } from '../shared/Logger'

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
}

interface RateLimiter {
  tokens: number
  lastRefill: number
  refillRate: number
  maxTokens: number
}

export interface FlowControlConfig {
  defaultRateLimit: {
    maxTokens: number
    refillRate: number // tokens per second
  }
  queueSpecificLimits?: Record<string, {
    maxTokens: number
    refillRate: number
  }>
  maxConcurrentJobs: number
  backpressureThreshold: number
}

export class FlowController {
  private rateLimiters: Map<string, RateLimiter> = new Map()
  private workers: Map<string, Worker> = new Map()

  constructor(
    private queues: Record<string, Queue>,
    private config: FlowControlConfig,
    private logger: Logger
  ) {
    this.setupRateLimiters()
    this.setupWorkers()
  }

  public async start(): Promise<void> {
    this.logger.info('Starting FlowController...')
    // Workers start automatically when created
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping FlowController...')
    await this.stopWorkers()
  }

  public async applyBackpressure(queueName: string): Promise<void> {
    const queue = this.queues[queueName]
    if (!queue) {
      this.logger.warn('Queue not found for backpressure', { queueName })
      return
    }

    try {
      const jobCounts = await queue.getJobCounts()
      const totalJobs = jobCounts.waiting + jobCounts.active

      if (totalJobs > this.config.backpressureThreshold) {
        await queue.pause()
        this.logger.info('Applied backpressure - paused queue', {
          queueName,
          totalJobs
        })

        // Resume queue when job count drops below threshold
        const checkAndResume = async () => {
          const currentCounts = await queue.getJobCounts()
          const currentTotal = currentCounts.waiting + currentCounts.active

          if (currentTotal <= this.config.backpressureThreshold) {
            await queue.resume()
            this.logger.info('Released backpressure - resumed queue', {
              queueName,
              currentTotal
            })
          } else {
            setTimeout(checkAndResume, 5000) // Check again in 5 seconds
          }
        }

        setTimeout(checkAndResume, 5000)
      }
    } catch (error) {
      this.logger.error('Error applying backpressure', {
        queueName,
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  public async checkRateLimit(queueName: string): Promise<boolean> {
    const limiter = this.rateLimiters.get(queueName)
    if (!limiter) return true // No rate limit configured

    this.refillTokens(limiter)

    if (limiter.tokens > 0) {
      limiter.tokens--
      return true
    }

    return false
  }

  private setupRateLimiters(): void {
    Object.keys(this.queues).forEach(queueName => {
      const queueConfig = this.config.queueSpecificLimits?.[queueName]
      const { maxTokens, refillRate } = queueConfig || this.config.defaultRateLimit

      this.rateLimiters.set(queueName, {
        tokens: maxTokens,
        lastRefill: Date.now(),
        refillRate,
        maxTokens
      })
    })
  }

  private refillTokens(limiter: RateLimiter): void {
    const now = Date.now()
    const timePassed = (now - limiter.lastRefill) / 1000 // Convert to seconds
    const tokensToAdd = Math.floor(timePassed * limiter.refillRate)

    if (tokensToAdd > 0) {
      limiter.tokens = Math.min(limiter.maxTokens, limiter.tokens + tokensToAdd)
      limiter.lastRefill = now
    }
  }

  private setupWorkers(): void {
    Object.entries(this.queues).forEach(([queueName, queue]) => {
      const worker = new Worker(queue.name, async (job) => {
        // This is a monitoring worker that doesn't process jobs
        // It just ensures the queue is properly maintained
        return job.data
      }, {
        connection: redisConfig,
        concurrency: this.config.maxConcurrentJobs,
        stalledInterval: 30000,
        maxStalledCount: 10
      })

      worker.on('failed', (job, err) => {
        this.logger.error('Job failed', {
          queueName,
          jobId: job?.id,
          error: err instanceof Error ? err : new Error(String(err))
        })
      })

      this.workers.set(queueName, worker)
    })
  }

  private async stopWorkers(): Promise<void> {
    const stopPromises = Array.from(this.workers.entries()).map(
      async ([queueName, worker]) => {
        try {
          await worker.close()
          this.logger.info('Stopped worker', { queueName })
        } catch (error) {
          this.logger.error('Failed to stop worker', {
            queueName,
            error: error instanceof Error ? error : new Error(String(error))
          })
        }
      }
    )

    await Promise.all(stopPromises)
    this.workers.clear()
  }
}
