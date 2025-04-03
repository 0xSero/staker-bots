import { Logger } from "../shared/Logger";

export interface WorkerMetricsData {
  counters: Record<string, number>
  timers: Record<string, { avg: number; min: number; max: number; count: number }>
  lastUpdate: number
}

export class WorkerMetrics {
  private counters: Map<string, number>
  private timers: Map<string, number[]>
  private lastUpdate: number

  constructor(
    private readonly workerName: string,
    private readonly logger: Logger
  ) {
    this.counters = new Map()
    this.timers = new Map()
    this.lastUpdate = Date.now()
  }

  public incrementCounter(name: string, value = 1): void {
    const currentValue = this.counters.get(name) || 0
    this.counters.set(name, currentValue + value)
    this.lastUpdate = Date.now()
  }

  public recordTime(name: string, timeMs: number): void {
    const times = this.timers.get(name) || []
    times.push(timeMs)
    this.timers.set(name, times)
    this.lastUpdate = Date.now()

    this.logger.debug('Recorded time', {
      worker: this.workerName,
      metric: name,
      timeMs
    })
  }

  public getMetrics(): WorkerMetricsData {
    const metrics: WorkerMetricsData = {
      counters: {},
      timers: {},
      lastUpdate: this.lastUpdate
    }

    // Convert counters
    for (const [name, value] of this.counters.entries()) {
      metrics.counters[name] = value
    }

    // Convert timers
    for (const [name, times] of this.timers.entries()) {
      if (times.length === 0) continue

      const sum = times.reduce((a, b) => a + b, 0)
      metrics.timers[name] = {
        avg: sum / times.length,
        min: Math.min(...times),
        max: Math.max(...times),
        count: times.length
      }
    }

    return metrics
  }

  public reset(): void {
    this.counters.clear()
    this.timers.clear()
    this.lastUpdate = Date.now()
    this.logger.debug('Metrics reset', { worker: this.workerName })
  }
}
