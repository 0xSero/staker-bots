import { OrchestratorConfig } from '../orchestrator/types'
import { FlowControlConfig } from '../orchestrator/FlowController'
import { HealthCheckConfig } from '../orchestrator/HealthMonitor'
import { validateEnv } from './env'
import {
  validateOrchestratorConfig,
  validateFlowControlConfig,
  validateHealthCheckConfig
} from './validation'

export interface ApplicationConfig {
  orchestrator: OrchestratorConfig
  flowControl: FlowControlConfig
  health: HealthCheckConfig
}

export function loadConfig(): ApplicationConfig {
  const env = validateEnv()

  const config: ApplicationConfig = {
    orchestrator: {
      maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
      healthCheckInterval: env.HEALTH_CHECK_INTERVAL,
      circuitBreakerThreshold: env.CIRCUIT_BREAKER_THRESHOLD,
      recoveryTimeout: env.RECOVERY_TIMEOUT
    },
    flowControl: {
      defaultRateLimit: {
        maxTokens: env.DEFAULT_RATE_LIMIT_MAX_TOKENS,
        refillRate: env.DEFAULT_RATE_LIMIT_REFILL_RATE
      },
      queueSpecificLimits: {
        execution: {
          maxTokens: env.EXECUTION_RATE_LIMIT_MAX_TOKENS,
          refillRate: env.EXECUTION_RATE_LIMIT_REFILL_RATE
        }
      },
      maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
      backpressureThreshold: env.BACKPRESSURE_THRESHOLD
    },
    health: {
      checkInterval: env.HEALTH_CHECK_INTERVAL,
      unhealthyThreshold: env.UNHEALTHY_THRESHOLD,
      recoveryThreshold: env.RECOVERY_THRESHOLD
    }
  }

  // Validate each configuration section
  validateOrchestratorConfig(config.orchestrator)
  validateFlowControlConfig(config.flowControl)
  validateHealthCheckConfig(config.health)

  return config
}
