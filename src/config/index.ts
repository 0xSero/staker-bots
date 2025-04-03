import { z } from 'zod'
import { JsonRpcProvider } from 'ethers'
import { OrchestratorConfig } from '@/orchestrator/types'
import { FlowControlConfig } from '@/orchestrator/FlowController'
import { HealthCheckConfig } from '@/orchestrator/HealthMonitor'
import {
  validateOrchestratorConfig,
  validateFlowControlConfig,
  validateHealthCheckConfig
} from './validation'
import { govlst } from 'modules/constants'
import stakerAbi from '../../modules/tests/abis/staker.json'

// Environment Schema
const envSchema = z.object({
  // Redis Configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.number().default(6379),
  REDIS_DB: z.number().default(0),
  REDIS_PASSWORD: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Queue Configuration
  MAX_CONCURRENT_JOBS: z.number().default(5),
  HEALTH_CHECK_INTERVAL: z.number().default(30000),
  CIRCUIT_BREAKER_THRESHOLD: z.number().default(10),
  RECOVERY_TIMEOUT: z.number().default(60000),

  // Contract Configuration
  STAKER_CONTRACT_ADDRESS: z.string(),
  GOV_LST_CONTRACT_ADDRESS: z.string(),
  RPC_URL: z.string(),
  EXECUTOR_PRIVATE_KEY: z.string(),

  // Provider Configuration
  PROVIDER: z.instanceof(JsonRpcProvider),
  CONTRACT_ABI: z.any(),
  GOV_LST_ABI: z.any(),

  // Bull Board Configuration
  BULL_BOARD: z.boolean().default(false),
  BULL_BOARD_PORT: z.number().default(3000),
  BULL_BOARD_BASE_PATH: z.string().default('/'),
  BULL_BOARD_USERNAME: z.string().default('admin'),
  BULL_BOARD_PASSWORD: z.string().default('admin'),

  // Rate limiting
  DEFAULT_RATE_LIMIT_MAX_TOKENS: z.number().default(100),
  DEFAULT_RATE_LIMIT_REFILL_RATE: z.number().default(10),
  EXECUTION_RATE_LIMIT_MAX_TOKENS: z.number().default(50),
  EXECUTION_RATE_LIMIT_REFILL_RATE: z.number().default(5),

  // Flow control
  BACKPRESSURE_THRESHOLD: z.number().default(1000),

  // Health monitoring
  UNHEALTHY_THRESHOLD: z.number().default(5),
  RECOVERY_THRESHOLD: z.number().default(3),

  // Production Configuration
  PROFITABILITY_CHECK_INTERVAL: z.number().default(300),
  PROFITABILITY_MAX_BATCH_SIZE: z.number().default(50),
  PROFITABILITY_MIN_PROFIT_MARGIN: z.number().default(0.15),
  PROFITABILITY_GAS_PRICE_BUFFER: z.number().default(1.2),
  PROFITABILITY_RETRY_DELAY: z.number().default(60),
  PROFITABILITY_MAX_RETRIES: z.number().default(3),

  MONITOR_CONFIRMATIONS: z.number().default(12),
  MONITOR_MAX_BLOCK_RANGE: z.number().default(5000),
  MONITOR_POLL_INTERVAL: z.number().default(13),
  MONITOR_HEALTH_CHECK_INTERVAL: z.number().default(60),
  MONITOR_MAX_REORG_DEPTH: z.number().default(100),

  EXECUTOR_QUEUE_POLL_INTERVAL: z.number().default(60),
  EXECUTOR_MIN_BALANCE: z.string().default('0.1'),
  EXECUTOR_MAX_PENDING_TXS: z.number().default(10),
  EXECUTOR_GAS_LIMIT_BUFFER: z.number().default(1.3),
  EXECUTOR_MAX_BATCH_SIZE: z.number().default(50),
  EXECUTOR_RETRY_DELAY: z.number().default(60),
  EXECUTOR_MAX_RETRIES: z.number().default(3),

  DATABASE_BATCH_TIMEOUT: z.number().default(3600),
  DATABASE_MAX_QUEUE_SIZE: z.number().default(1000),
  DATABASE_PRUNE_INTERVAL: z.number().default(86400),
  DATABASE_MAX_ARCHIVE_AGE: z.number().default(604800),

  CIRCUIT_BREAKER_MAX_FAILED_TXS: z.number().default(3),
  CIRCUIT_BREAKER_COOLDOWN_PERIOD: z.number().default(1800),
  CIRCUIT_BREAKER_MIN_SUCCESS_RATE: z.number().default(0.8)
})

export type Env = z.infer<typeof envSchema>

// Application Configuration
export interface ApplicationConfig {
  orchestrator: OrchestratorConfig
  flowControl: FlowControlConfig
  health: HealthCheckConfig
  provider: JsonRpcProvider
  contractAbi: any
  govLstAbi: any
  production: {
    profitability: {
      checkInterval: number
      maxBatchSize: number
      minProfitMargin: number
      gasPriceBuffer: number
      retryDelay: number
      maxRetries: number
    }
    monitor: {
      confirmations: number
      maxBlockRange: number
      pollInterval: number
      healthCheckInterval: number
      maxReorgDepth: number
    }
    executor: {
      queuePollInterval: number
      minBalance: string
      maxPendingTransactions: number
      gasLimitBuffer: number
      maxBatchSize: number
      retryDelay: number
      maxRetries: number
    }
    database: {
      batchTimeout: number
      maxQueueSize: number
      pruneInterval: number
      maxArchiveAge: number
    }
    circuitBreaker: {
      maxFailedTransactions: number
      cooldownPeriod: number
      minSuccessRate: number
    }
  }
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
        'event-processing': {
          maxTokens: 100,
          refillRate: 10
        },
        'reward-check': {
          maxTokens: 10,
          refillRate: 1
        },
        'profitability-analysis': {
          maxTokens: 30,
          refillRate: 3
        },
        'transaction-execution': {
          maxTokens: 20,
          refillRate: 2
        }
      },
      maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
      backpressureThreshold: env.BACKPRESSURE_THRESHOLD
    },
    health: {
      checkInterval: env.HEALTH_CHECK_INTERVAL,
      unhealthyThreshold: env.UNHEALTHY_THRESHOLD,
      recoveryThreshold: env.RECOVERY_THRESHOLD
    },
    provider: env.PROVIDER,
    contractAbi: env.CONTRACT_ABI,
    govLstAbi: env.GOV_LST_ABI,
    production: {
      profitability: {
        checkInterval: env.PROFITABILITY_CHECK_INTERVAL,
        maxBatchSize: env.PROFITABILITY_MAX_BATCH_SIZE,
        minProfitMargin: env.PROFITABILITY_MIN_PROFIT_MARGIN,
        gasPriceBuffer: env.PROFITABILITY_GAS_PRICE_BUFFER,
        retryDelay: env.PROFITABILITY_RETRY_DELAY,
        maxRetries: env.PROFITABILITY_MAX_RETRIES
      },
      monitor: {
        confirmations: env.MONITOR_CONFIRMATIONS,
        maxBlockRange: env.MONITOR_MAX_BLOCK_RANGE,
        pollInterval: env.MONITOR_POLL_INTERVAL,
        healthCheckInterval: env.MONITOR_HEALTH_CHECK_INTERVAL,
        maxReorgDepth: env.MONITOR_MAX_REORG_DEPTH
      },
      executor: {
        queuePollInterval: env.EXECUTOR_QUEUE_POLL_INTERVAL,
        minBalance: env.EXECUTOR_MIN_BALANCE,
        maxPendingTransactions: env.EXECUTOR_MAX_PENDING_TXS,
        gasLimitBuffer: env.EXECUTOR_GAS_LIMIT_BUFFER,
        maxBatchSize: env.EXECUTOR_MAX_BATCH_SIZE,
        retryDelay: env.EXECUTOR_RETRY_DELAY,
        maxRetries: env.EXECUTOR_MAX_RETRIES
      },
      database: {
        batchTimeout: env.DATABASE_BATCH_TIMEOUT,
        maxQueueSize: env.DATABASE_MAX_QUEUE_SIZE,
        pruneInterval: env.DATABASE_PRUNE_INTERVAL,
        maxArchiveAge: env.DATABASE_MAX_ARCHIVE_AGE
      },
      circuitBreaker: {
        maxFailedTransactions: env.CIRCUIT_BREAKER_MAX_FAILED_TXS,
        cooldownPeriod: env.CIRCUIT_BREAKER_COOLDOWN_PERIOD,
        minSuccessRate: env.CIRCUIT_BREAKER_MIN_SUCCESS_RATE
      }
    }
  }

  // Validate each configuration section
  validateOrchestratorConfig(config.orchestrator)
  validateFlowControlConfig(config.flowControl)
  validateHealthCheckConfig(config.health)

  return config
}

function validateEnv(): Env {
  try {
    // Set up provider from RPC_URL
    if (!process.env.RPC_URL) {
      throw new Error('RPC_URL environment variable is required')
    }
    const provider = new JsonRpcProvider(process.env.RPC_URL)

    // Load contract ABIs - use imported ABIs
    const contractAbi = stakerAbi
    const govLstAbi = govlst

    // Parse numeric environment variables
    const env = {
      ...process.env,
      REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
      REDIS_DB: parseInt(process.env.REDIS_DB || '0', 10),
      MAX_CONCURRENT_JOBS: parseInt(process.env.MAX_CONCURRENT_JOBS || '5', 10),
      HEALTH_CHECK_INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
      CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD || '10', 10),
      RECOVERY_TIMEOUT: parseInt(process.env.RECOVERY_TIMEOUT || '60000', 10),
      BULL_BOARD: process.env.BULL_BOARD === 'true',
      BULL_BOARD_PORT: parseInt(process.env.BULL_BOARD_PORT || '3000', 10),
      DEFAULT_RATE_LIMIT_MAX_TOKENS: parseInt(process.env.DEFAULT_RATE_LIMIT_MAX_TOKENS || '100', 10),
      DEFAULT_RATE_LIMIT_REFILL_RATE: parseInt(process.env.DEFAULT_RATE_LIMIT_REFILL_RATE || '10', 10),
      EXECUTION_RATE_LIMIT_MAX_TOKENS: parseInt(process.env.EXECUTION_RATE_LIMIT_MAX_TOKENS || '50', 10),
      EXECUTION_RATE_LIMIT_REFILL_RATE: parseInt(process.env.EXECUTION_RATE_LIMIT_REFILL_RATE || '5', 10),
      BACKPRESSURE_THRESHOLD: parseInt(process.env.BACKPRESSURE_THRESHOLD || '1000', 10),
      UNHEALTHY_THRESHOLD: parseInt(process.env.UNHEALTHY_THRESHOLD || '5', 10),
      RECOVERY_THRESHOLD: parseInt(process.env.RECOVERY_THRESHOLD || '3', 10),
      PROFITABILITY_CHECK_INTERVAL: parseInt(process.env.PROFITABILITY_CHECK_INTERVAL || '300', 10),
      PROFITABILITY_MAX_BATCH_SIZE: parseInt(process.env.PROFITABILITY_MAX_BATCH_SIZE || '50', 10),
      PROFITABILITY_MIN_PROFIT_MARGIN: parseFloat(process.env.PROFITABILITY_MIN_PROFIT_MARGIN || '0.15'),
      PROFITABILITY_GAS_PRICE_BUFFER: parseFloat(process.env.PROFITABILITY_GAS_PRICE_BUFFER || '1.2'),
      PROFITABILITY_RETRY_DELAY: parseInt(process.env.PROFITABILITY_RETRY_DELAY || '60', 10),
      PROFITABILITY_MAX_RETRIES: parseInt(process.env.PROFITABILITY_MAX_RETRIES || '3', 10),
      MONITOR_CONFIRMATIONS: parseInt(process.env.MONITOR_CONFIRMATIONS || '12', 10),
      MONITOR_MAX_BLOCK_RANGE: parseInt(process.env.MONITOR_MAX_BLOCK_RANGE || '5000', 10),
      MONITOR_POLL_INTERVAL: parseInt(process.env.MONITOR_POLL_INTERVAL || '13', 10),
      MONITOR_HEALTH_CHECK_INTERVAL: parseInt(process.env.MONITOR_HEALTH_CHECK_INTERVAL || '60', 10),
      MONITOR_MAX_REORG_DEPTH: parseInt(process.env.MONITOR_MAX_REORG_DEPTH || '100', 10),
      EXECUTOR_QUEUE_POLL_INTERVAL: parseInt(process.env.EXECUTOR_QUEUE_POLL_INTERVAL || '60', 10),
      EXECUTOR_MIN_BALANCE: process.env.EXECUTOR_MIN_BALANCE || '0.1',
      EXECUTOR_MAX_PENDING_TXS: parseInt(process.env.EXECUTOR_MAX_PENDING_TXS || '10', 10),
      EXECUTOR_GAS_LIMIT_BUFFER: parseFloat(process.env.EXECUTOR_GAS_LIMIT_BUFFER || '1.3'),
      EXECUTOR_MAX_BATCH_SIZE: parseInt(process.env.EXECUTOR_MAX_BATCH_SIZE || '50', 10),
      EXECUTOR_RETRY_DELAY: parseInt(process.env.EXECUTOR_RETRY_DELAY || '60', 10),
      EXECUTOR_MAX_RETRIES: parseInt(process.env.EXECUTOR_MAX_RETRIES || '3', 10),
      DATABASE_BATCH_TIMEOUT: parseInt(process.env.DATABASE_BATCH_TIMEOUT || '3600', 10),
      DATABASE_MAX_QUEUE_SIZE: parseInt(process.env.DATABASE_MAX_QUEUE_SIZE || '1000', 10),
      DATABASE_PRUNE_INTERVAL: parseInt(process.env.DATABASE_PRUNE_INTERVAL || '86400', 10),
      DATABASE_MAX_ARCHIVE_AGE: parseInt(process.env.DATABASE_MAX_ARCHIVE_AGE || '604800', 10),
      CIRCUIT_BREAKER_MAX_FAILED_TXS: parseInt(process.env.CIRCUIT_BREAKER_MAX_FAILED_TXS || '3', 10),
      CIRCUIT_BREAKER_COOLDOWN_PERIOD: parseInt(process.env.CIRCUIT_BREAKER_COOLDOWN_PERIOD || '1800', 10),
      CIRCUIT_BREAKER_MIN_SUCCESS_RATE: parseFloat(process.env.CIRCUIT_BREAKER_MIN_SUCCESS_RATE || '0.8'),
      PROVIDER: provider,
      CONTRACT_ABI: contractAbi,
      GOV_LST_ABI: govLstAbi,
      STAKER_CONTRACT_ADDRESS: process.env.STAKER_CONTRACT_ADDRESS || '',
      GOV_LST_CONTRACT_ADDRESS: process.env.GOV_LST_CONTRACT_ADDRESS || '',
      EXECUTOR_PRIVATE_KEY: process.env.EXECUTOR_PRIVATE_KEY || ''
    }

    return envSchema.parse(env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid environment variables:', error.errors)
    } else {
      console.error('Error validating environment:', error)
    }
    throw error
  }
}
