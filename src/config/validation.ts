import { z } from 'zod'
import { OrchestratorConfig } from '../orchestrator/types'
import { FlowControlConfig } from '../orchestrator/FlowController'
import { HealthCheckConfig } from '../orchestrator/HealthMonitor'

const orchestratorConfigSchema = z.object({
  maxConcurrentJobs: z.number().min(1),
  healthCheckInterval: z.number().min(1000),
  circuitBreakerThreshold: z.number().min(1),
  recoveryTimeout: z.number().min(1000)
})

const flowControlConfigSchema = z.object({
  defaultRateLimit: z.object({
    maxTokens: z.number().min(1),
    refillRate: z.number().min(1)
  }),
  queueSpecificLimits: z.record(z.object({
    maxTokens: z.number().min(1),
    refillRate: z.number().min(1)
  })).optional(),
  maxConcurrentJobs: z.number().min(1),
  backpressureThreshold: z.number().min(1)
})

const healthCheckConfigSchema = z.object({
  checkInterval: z.number().min(1000),
  unhealthyThreshold: z.number().min(1),
  recoveryThreshold: z.number().min(1)
})

export function validateOrchestratorConfig(config: OrchestratorConfig): void {
  try {
    orchestratorConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid orchestrator configuration: ${error.errors.map(e => e.message).join(', ')}`)
    }
    throw error
  }
}

export function validateFlowControlConfig(config: FlowControlConfig): void {
  try {
    flowControlConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid flow control configuration: ${error.errors.map(e => e.message).join(', ')}`)
    }
    throw error
  }
}

export function validateHealthCheckConfig(config: HealthCheckConfig): void {
  try {
    healthCheckConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid health check configuration: ${error.errors.map(e => e.message).join(', ')}`)
    }
    throw error
  }
}
