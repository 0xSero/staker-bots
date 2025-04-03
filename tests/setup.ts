import { GenericContainer, StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll } from 'vitest'

let redisContainer: StartedTestContainer

beforeAll(async () => {
  // Start Redis container
  redisContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start()

  // Set environment variables for tests
  process.env.REDIS_HOST = redisContainer.getHost()
  process.env.REDIS_PORT = redisContainer.getMappedPort(6379).toString()
  process.env.REDIS_PASSWORD = ''
  process.env.REDIS_DB = '0'

  // Set other required environment variables with test values
  process.env.LOG_LEVEL = 'debug'
  process.env.MAX_CONCURRENT_JOBS = '5'
  process.env.HEALTH_CHECK_INTERVAL = '1000'
  process.env.CIRCUIT_BREAKER_THRESHOLD = '3'
  process.env.RECOVERY_TIMEOUT = '5000'
  process.env.DEFAULT_RATE_LIMIT_MAX_TOKENS = '50'
  process.env.DEFAULT_RATE_LIMIT_REFILL_RATE = '5'
  process.env.EXECUTION_RATE_LIMIT_MAX_TOKENS = '25'
  process.env.EXECUTION_RATE_LIMIT_REFILL_RATE = '2'
  process.env.BACKPRESSURE_THRESHOLD = '100'
  process.env.UNHEALTHY_THRESHOLD = '3'
  process.env.RECOVERY_THRESHOLD = '2'
})

afterAll(async () => {
  // Stop Redis container
  if (redisContainer) {
    await redisContainer.stop()
  }
})
