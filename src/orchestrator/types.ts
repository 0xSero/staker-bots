export interface OrchestratorConfig {
  maxConcurrentJobs: number
  healthCheckInterval: number
  circuitBreakerThreshold: number
  recoveryTimeout: number
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy' | 'degraded'
  lastChecked: Date
  errorCount: number
  message?: string
}

export interface SystemHealth {
  overall: 'healthy' | 'unhealthy' | 'degraded'
  components: Record<string, ComponentHealth>
  timestamp: Date
}

export interface JobCompletionHandler {
  queueName: string
  handler: (jobId: string, result: any) => Promise<void>
}

export interface CircuitBreakerConfig {
  threshold: number
  timeout: number
}

export interface QueueDependency {
  sourceQueue: string
  targetQueue: string
  condition?: (result: any) => boolean
}
