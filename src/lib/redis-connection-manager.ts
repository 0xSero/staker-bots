import IORedis, { RedisOptions } from 'ioredis'
import { ConnectionOptions } from 'bullmq'

export interface RedisConfig extends Omit<RedisOptions, 'tls'> {
  host: string
  port: number
  password?: string
  db?: number
  tls?: boolean
  maxRetriesPerRequest?: number
  enableReadyCheck?: boolean
  maxRetriesOnNetworkError?: number
  retryStrategy?: (times: number) => number | null
}

export class RedisConnectionManager {
  private static instance: RedisConnectionManager
  private connections: Map<string, IORedis>
  private defaultConfig: RedisConfig

  private constructor(config: RedisConfig) {
    this.connections = new Map()
    this.defaultConfig = {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      maxRetriesOnNetworkError: 5,
      retryStrategy: (times: number) => {
        // Exponential backoff with max delay of 5 seconds
        const delay = Math.min(times * 50, 5000)
        return delay
      },
      ...config
    }
  }

  public static getInstance(config?: RedisConfig): RedisConnectionManager {
    if (!RedisConnectionManager.instance) {
      if (!config) {
        throw new Error('Initial configuration required for RedisConnectionManager')
      }
      RedisConnectionManager.instance = new RedisConnectionManager(config)
    }
    return RedisConnectionManager.instance
  }

  public getConnection(name: string = 'default'): IORedis {
    let connection = this.connections.get(name)

    if (!connection) {
      connection = this.createConnection()
      this.connections.set(name, connection)

      // Setup error handling
      connection.on('error', (error: Error) => {
        console.error(`Redis connection error (${name}):`, error)
      })

      connection.on('close', () => {
        console.warn(`Redis connection closed (${name}), attempting to reconnect...`)
      })
    }

    return connection
  }

  public getBullMQConnection(): ConnectionOptions {
    return {
      host: this.defaultConfig.host,
      port: this.defaultConfig.port,
      password: this.defaultConfig.password,
      db: this.defaultConfig.db,
      tls: this.defaultConfig.tls ? {} : undefined,
      maxRetriesPerRequest: this.defaultConfig.maxRetriesPerRequest,
      enableReadyCheck: this.defaultConfig.enableReadyCheck,
      retryStrategy: this.defaultConfig.retryStrategy
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      const promises = Array.from(this.connections.entries()).map(async ([name, connection]) => {
        try {
          await connection.ping()
          return true
        } catch (error: unknown) {
          console.error(`Health check failed for connection ${name}:`, error instanceof Error ? error.message : error)
          return false
        }
      })

      const results = await Promise.all(promises)
      return results.every(result => result)
    } catch (error: unknown) {
      console.error('Health check error:', error instanceof Error ? error.message : error)
      return false
    }
  }

  public async closeAll(): Promise<void> {
    const closePromises = Array.from(this.connections.values()).map(connection =>
      connection.quit().catch((error: Error) => {
        console.error('Error closing Redis connection:', error)
      })
    )

    await Promise.all(closePromises)
    this.connections.clear()
  }

  private createConnection(): IORedis {
    const redisOptions: RedisOptions = {
      ...this.defaultConfig,
      lazyConnect: true,
      tls: this.defaultConfig.tls ? {} : undefined
    }
    return new IORedis(redisOptions)
  }
}
