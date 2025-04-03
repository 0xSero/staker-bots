import { z } from 'zod'

const envSchema = z.object({
  // Redis configuration
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().transform((val: string) => parseInt(val, 10)).default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform((val: string) => parseInt(val, 10)).default('0'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Queue configuration
  MAX_CONCURRENT_JOBS: z.string().transform((val: string) => parseInt(val, 10)).default('10'),
  HEALTH_CHECK_INTERVAL: z.string().transform((val: string) => parseInt(val, 10)).default('30000'),
  CIRCUIT_BREAKER_THRESHOLD: z.string().transform((val: string) => parseInt(val, 10)).default('5'),
  RECOVERY_TIMEOUT: z.string().transform((val: string) => parseInt(val, 10)).default('60000'),

  // Rate limiting
  DEFAULT_RATE_LIMIT_MAX_TOKENS: z.string().transform((val: string) => parseInt(val, 10)).default('100'),
  DEFAULT_RATE_LIMIT_REFILL_RATE: z.string().transform((val: string) => parseInt(val, 10)).default('10'),
  EXECUTION_RATE_LIMIT_MAX_TOKENS: z.string().transform((val: string) => parseInt(val, 10)).default('50'),
  EXECUTION_RATE_LIMIT_REFILL_RATE: z.string().transform((val: string) => parseInt(val, 10)).default('5'),

  // Flow control
  BACKPRESSURE_THRESHOLD: z.string().transform((val: string) => parseInt(val, 10)).default('1000'),

  // Health monitoring
  UNHEALTHY_THRESHOLD: z.string().transform((val: string) => parseInt(val, 10)).default('5'),
  RECOVERY_THRESHOLD: z.string().transform((val: string) => parseInt(val, 10)).default('3')
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Invalid environment variables:', error.errors)
    }
    throw error
  }
}
