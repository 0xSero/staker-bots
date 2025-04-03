import { Queue, Worker, QueueOptions, WorkerOptions, Processor, FlowProducer, Job, ConnectionOptions } from 'bullmq'
import { RedisConnectionManager } from './redis-connection-manager'

export interface QueueFactoryOptions {
  prefix?: string
  defaultJobOptions?: {
    attempts?: number
    backoff?: {
      type: 'exponential' | 'fixed'
      delay: number
    }
    removeOnComplete?: boolean | number
    removeOnFail?: boolean | number
    delay?: number
  }
}

// Default Redis connection options
const DEFAULT_REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  username: process.env.REDIS_USERNAME,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
}

export class QueueFactory {
  private readonly connectionManager: RedisConnectionManager
  private readonly defaultOptions: QueueFactoryOptions
  private readonly queues: Map<string, Queue>
  private readonly workers: Map<string, Worker>
  private readonly schedulers: Map<string, Queue>
  private readonly flowProducers: Map<string, FlowProducer>
  private static queues: Map<string, Queue> = new Map()
  private static defaultConnection: ConnectionOptions = DEFAULT_REDIS_CONFIG

  constructor(
    connectionManager: RedisConnectionManager,
    options: QueueFactoryOptions = {}
  ) {
    this.connectionManager = connectionManager
    this.defaultOptions = {
      prefix: 'staker-bots',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000 // Increased from 1000 to 5000ms
        },
        removeOnComplete: 1000,
        removeOnFail: false,
        // Add delay between jobs
        delay: 1000, // 1 second delay between jobs
      },
      ...options
    }
    this.queues = new Map()
    this.workers = new Map()
    this.schedulers = new Map()
    this.flowProducers = new Map()
  }

  public createQueue(name: string, options: Omit<QueueOptions, 'connection'> = {}): Queue {
    const existingQueue = this.queues.get(name)
    if (existingQueue) {
      return existingQueue
    }

    const queueSpecificOptions = this.getQueueSpecificOptions(name)

    const queueOptions: QueueOptions = {
      connection: this.connectionManager.getBullMQConnection(),
      prefix: this.defaultOptions.prefix,
      defaultJobOptions: {
        ...this.defaultOptions.defaultJobOptions,
        ...queueSpecificOptions.defaultJobOptions
      },
      ...options
    }

    const queue = new Queue(name, queueOptions)
    this.queues.set(name, queue)
    return queue
  }

  private getQueueSpecificOptions(queueName: string): any {
    const baseOptions = {
      limiter: {
        max: 5, // Default max jobs per interval
        duration: 5000 // Default interval (5 seconds)
      }
    }

    switch (queueName) {
      case 'event-processing':
        return {
          limiter: {
            max: 10,
            duration: 15000 // 15 seconds interval
          },
          defaultJobOptions: {
            delay: 2000 // 2 second delay between event processing
          }
        }
      case 'reward-check':
        return {
          limiter: {
            max: 1,
            duration: 300000 // 5 minutes interval (matching original)
          },
          defaultJobOptions: {
            delay: 5000 // 5 second delay between reward checks
          }
        }
      case 'profitability-analysis':
        return {
          limiter: {
            max: 3,
            duration: 10000 // 10 seconds interval
          },
          defaultJobOptions: {
            delay: 3000 // 3 second delay
          }
        }
      case 'transaction-execution':
        return {
          limiter: {
            max: 1,
            duration: 10000 // 10 seconds interval
          },
          defaultJobOptions: {
            delay: 5000 // 5 second delay
          }
        }
      default:
        return baseOptions
    }
  }

  public createWorker(
    queueName: string,
    processor: Processor,
    options: Omit<WorkerOptions, 'connection'> = {}
  ): Worker {
    const existingWorker = this.workers.get(queueName)
    if (existingWorker) {
      return existingWorker
    }

    const queueSpecificOptions = this.getQueueSpecificOptions(queueName)

    const workerOptions: WorkerOptions = {
      connection: this.connectionManager.getBullMQConnection(),
      prefix: this.defaultOptions.prefix,
      limiter: queueSpecificOptions.limiter,
      ...options
    }

    const worker = new Worker(queueName, processor, workerOptions)

    // Setup error handling
    worker.on('error', (error: Error) => {
      console.error(`Worker error in queue ${queueName}:`, error)
    })

    worker.on('failed', (job: Job | undefined, error: Error) => {
      if (job) {
        console.error(`Job ${job.id} failed in queue ${queueName}:`, error)
      } else {
        console.error(`Job failed in queue ${queueName}:`, error)
      }
    })

    this.workers.set(queueName, worker)
    return worker
  }

  public createScheduler(queueName: string): Queue {
    const existingScheduler = this.schedulers.get(queueName)
    if (existingScheduler) {
      return existingScheduler
    }

    const scheduler = this.createQueue(`${queueName}:scheduler`, {
      defaultJobOptions: {
        removeOnComplete: 0, // Don't keep completed scheduler jobs
        removeOnFail: 1000 // Keep last 1000 failed scheduler jobs
      }
    })

    this.schedulers.set(queueName, scheduler)
    return scheduler
  }

  public createFlowProducer(name: string = 'default'): FlowProducer {
    const existingProducer = this.flowProducers.get(name)
    if (existingProducer) {
      return existingProducer
    }

    const producer = new FlowProducer({
      connection: this.connectionManager.getBullMQConnection(),
      prefix: this.defaultOptions.prefix
    })

    this.flowProducers.set(name, producer)
    return producer
  }

  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name)
  }

  public getWorker(queueName: string): Worker | undefined {
    return this.workers.get(queueName)
  }

  public getScheduler(queueName: string): Queue | undefined {
    return this.schedulers.get(queueName)
  }

  public getFlowProducer(name: string = 'default'): FlowProducer | undefined {
    return this.flowProducers.get(name)
  }

  public async closeAll(): Promise<void> {
    // Close all queues
    const queueClosePromises = Array.from(this.queues.values()).map(queue =>
      queue.close().catch((error: Error) => {
        console.error('Error closing queue:', error)
      })
    )

    // Close all workers
    const workerClosePromises = Array.from(this.workers.values()).map(worker =>
      worker.close().catch((error: Error) => {
        console.error('Error closing worker:', error)
      })
    )

    // Close all schedulers
    const schedulerClosePromises = Array.from(this.schedulers.values()).map(scheduler =>
      scheduler.close().catch((error: Error) => {
        console.error('Error closing scheduler:', error)
      })
    )

    // Close all flow producers
    const producerClosePromises = Array.from(this.flowProducers.values()).map(producer =>
      producer.close().catch((error: Error) => {
        console.error('Error closing flow producer:', error)
      })
    )

    await Promise.all([
      ...queueClosePromises,
      ...workerClosePromises,
      ...schedulerClosePromises,
      ...producerClosePromises
    ])

    this.queues.clear()
    this.workers.clear()
    this.schedulers.clear()
    this.flowProducers.clear()
  }

  static getQueue(queueName: string, options: Partial<QueueOptions> = {}): Queue {
    if (!this.queues.has(queueName)) {
      const queue = new Queue(queueName, {
        ...options,
        connection: this.defaultConnection,
      })
      this.queues.set(queueName, queue)
    }
    return this.queues.get(queueName)!
  }

  static getConnectionOptions(): ConnectionOptions {
    return this.defaultConnection
  }

  static async closeAll(): Promise<void> {
    for (const queue of this.queues.values()) {
      await queue.close()
    }
    this.queues.clear()
  }
}
