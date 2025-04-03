import { z } from 'zod'
import { OrchestratorConfig } from '../orchestrator/types'
import { FlowControlConfig } from '../orchestrator/FlowController'
import { HealthCheckConfig } from '../orchestrator/HealthMonitor'

const createNumberSchema = (min: number) =>
  z.union([
    z.string().transform((val) => Number(val)),
    z.number()
  ]).refine((val) => {
    console.log(`Validating value ${val} against min ${min}`)
    return !isNaN(val) && val >= min
  }, {
    message: `Number must be greater than or equal to ${min}`
  })

const orchestratorConfigSchema = z.object({
  maxConcurrentJobs: createNumberSchema(1),
  healthCheckInterval: createNumberSchema(1000),
  circuitBreakerThreshold: createNumberSchema(1),
  recoveryTimeout: createNumberSchema(1000)
})

const flowControlConfigSchema = z.object({
  defaultRateLimit: z.object({
    maxTokens: createNumberSchema(1),
    refillRate: createNumberSchema(1)
  }),
  queueSpecificLimits: z.record(z.object({
    maxTokens: createNumberSchema(1),
    refillRate: createNumberSchema(1)
  })).optional(),
  maxConcurrentJobs: createNumberSchema(1),
  backpressureThreshold: createNumberSchema(1)
})

const healthCheckConfigSchema = z.object({
  checkInterval: createNumberSchema(1000),
  unhealthyThreshold: createNumberSchema(1),
  recoveryThreshold: createNumberSchema(1)
})

export function validateOrchestratorConfig(config: OrchestratorConfig): void {
  console.log('Validating orchestrator config:', config)
  try {
    orchestratorConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.errors)
      throw new Error(`Invalid orchestrator configuration: ${error.errors.map(e => e.message).join(', ')}`)
    }
    throw error
  }
}

export function validateFlowControlConfig(config: FlowControlConfig): void {
  console.log('Validating flow control config:', config)
  try {
    flowControlConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.errors)
      throw new Error(`Invalid flow control configuration: ${error.errors.map(e => e.message).join(', ')}`)
    }
    throw error
  }
}

export function validateHealthCheckConfig(config: HealthCheckConfig): void {
  console.log('Validating health check config:', config)
  try {
    healthCheckConfigSchema.parse(config)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.errors)
      throw new Error(`Invalid health check configuration: ${error.errors.map(e => e.message).join(', ')}`)
    }
    throw error
  }
}
