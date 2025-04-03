import { Queue, QueueEvents } from 'bullmq'
import { Logger } from '../shared/Logger'

export interface QueueMetricData {
  waiting: number
  active: number
  completed: number
  failed: number
  delayed: number
  paused: boolean
  waitTime: {
    avg: number
    min: number
    max: number
    count: number
  }
  processingTime: {
    avg: number
    min: number
    max: number
    count: number
  }
  lastUpdate: number
}

export class QueueMetrics {
  private static instance: QueueMetrics
  private metrics: Map<string, QueueMetricData>
  private waitTimes: Map<string, number[]>
  private processingTimes: Map<string, number[]>
  private queueEvents: Map<string, QueueEvents>
  private logger: Logger

  private constructor() {
    this.metrics = new Map()
    this.waitTimes = new Map()
    this.processingTimes = new Map()
    this.queueEvents = new Map()
    this.logger = new Logger('info')
  }

  public static getInstance(): QueueMetrics {
    if (!QueueMetrics.instance) {
      QueueMetrics.instance = new QueueMetrics()
    }
    return QueueMetrics.instance
  }

  public async registerQueue(queue: Queue): Promise<void> {
    const queueName = queue.name
    if (this.queueEvents.has(queueName)) return

    const queueEvents = new QueueEvents(queueName, {
      connection: queue.opts.connection
    })

    // Initialize metrics
    this.metrics.set(queueName, this.createEmptyMetrics())
    this.waitTimes.set(queueName, [])
    this.processingTimes.set(queueName, [])

    // Track wait times
    queueEvents.on('active', ({ jobId, prev }) => {
      if (typeof prev !== 'number') return
      const waitTime = Date.now() - prev
      const times = this.waitTimes.get(queueName) || []
      times.push(waitTime)
      this.waitTimes.set(queueName, times)
    })

    // Track processing times
    queueEvents.on('completed', ({ jobId, returnvalue, prev }) => {
      const processedOn = prev
      if (typeof processedOn !== 'number') return
      const processingTime = Date.now() - processedOn
      const times = this.processingTimes.get(queueName) || []
      times.push(processingTime)
      this.processingTimes.set(queueName, times)
    })

    this.queueEvents.set(queueName, queueEvents)
    this.logger.info('Queue registered for metrics', { queue: queueName })
  }

  public async updateMetrics(queueName: string, queue: Queue): Promise<void> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ])

    const isPaused = await queue.isPaused()
    const waitTimes = this.waitTimes.get(queueName) || []
    const processingTimes = this.processingTimes.get(queueName) || []

    const metrics: QueueMetricData = {
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused: isPaused,
      waitTime: this.calculateTimeMetrics(waitTimes),
      processingTime: this.calculateTimeMetrics(processingTimes),
      lastUpdate: Date.now()
    }

    this.metrics.set(queueName, metrics)
    this.logger.debug('Queue metrics updated', { queue: queueName, metrics })
  }

  public getMetrics(): Record<string, QueueMetricData> {
    const result: Record<string, QueueMetricData> = {}
    for (const [queueName, metrics] of this.metrics.entries()) {
      result[queueName] = { ...metrics }
    }
    return result
  }

  public async cleanup(): Promise<void> {
    for (const [queueName, events] of this.queueEvents.entries()) {
      await events.close()
      this.logger.info('Queue events closed', { queue: queueName })
    }
    this.queueEvents.clear()
    this.metrics.clear()
    this.waitTimes.clear()
    this.processingTimes.clear()
  }

  private createEmptyMetrics(): QueueMetricData {
    return {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
      waitTime: this.createEmptyTimeMetrics(),
      processingTime: this.createEmptyTimeMetrics(),
      lastUpdate: Date.now()
    }
  }

  private createEmptyTimeMetrics() {
    return {
      avg: 0,
      min: 0,
      max: 0,
      count: 0
    }
  }

  private calculateTimeMetrics(times: number[]) {
    if (times.length === 0) {
      return this.createEmptyTimeMetrics()
    }

    const sum = times.reduce((a, b) => a + b, 0)
    return {
      avg: sum / times.length,
      min: Math.min(...times),
      max: Math.max(...times),
      count: times.length
    }
  }
}
