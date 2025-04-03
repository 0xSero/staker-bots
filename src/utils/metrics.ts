export class WorkerMetrics {
  private successCount: number = 0
  private failureCount: number = 0
  private processingTimes: number[] = []
  private lastResetTime: number

  constructor(private readonly workerName: string) {
    this.lastResetTime = Date.now()
  }

  public recordSuccess(processingTimeMs: number): void {
    this.successCount++
    this.processingTimes.push(processingTimeMs)
  }

  public recordFailure(processingTimeMs: number): void {
    this.failureCount++
    this.processingTimes.push(processingTimeMs)
  }

  public getMetrics(): WorkerMetricsData {
    const totalJobs = this.successCount + this.failureCount
    const avgProcessingTime = this.processingTimes.length > 0
      ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
      : 0

    return {
      workerName: this.workerName,
      successCount: this.successCount,
      failureCount: this.failureCount,
      totalJobs,
      successRate: totalJobs > 0 ? (this.successCount / totalJobs) * 100 : 0,
      avgProcessingTimeMs: avgProcessingTime,
      uptime: Date.now() - this.lastResetTime
    }
  }

  public reset(): void {
    this.successCount = 0
    this.failureCount = 0
    this.processingTimes = []
    this.lastResetTime = Date.now()
  }
}

export interface WorkerMetricsData {
  workerName: string
  successCount: number
  failureCount: number
  totalJobs: number
  successRate: number
  avgProcessingTimeMs: number
  uptime: number
}
