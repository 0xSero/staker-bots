import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import express from 'express'
import { Queue } from 'bullmq'
import { Logger } from '../shared/Logger'

export interface MetricsDashboardConfig {
  port: number
  basePath: string
  username: string
  password: string
}

export class MetricsDashboard {
  private static instance: MetricsDashboard
  private server: express.Application | null = null
  private serverInstance: ReturnType<express.Application['listen']> | null = null
  private queues: Set<Queue> = new Set()
  private readonly logger: Logger

  private constructor(private readonly config: MetricsDashboardConfig) {
    this.logger = new Logger('info')
  }

  public static getInstance(config: MetricsDashboardConfig): MetricsDashboard {
    if (!MetricsDashboard.instance) {
      MetricsDashboard.instance = new MetricsDashboard(config)
    }
    return MetricsDashboard.instance
  }

  public async start(): Promise<void> {
    if (this.server) {
      this.logger.warn('Dashboard already running')
      return
    }

    const serverAdapter = new ExpressAdapter()
    serverAdapter.setBasePath(this.config.basePath)

    const board = createBullBoard({
      queues: Array.from(this.queues).map(queue => new BullMQAdapter(queue)),
      serverAdapter
    })

    const { addQueue, removeQueue, setQueues } = board

    const app = express()

    // Basic authentication middleware
    app.use(this.config.basePath, (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const authHeader = req.headers.authorization
      if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic')
        return res.status(401).send('Authentication required')
      }

      const auth = Buffer.from(authHeader.split(' ')[1], 'base64')
        .toString()
        .split(':')
      const username = auth[0]
      const password = auth[1]

      if (username === this.config.username && password === this.config.password) {
        next()
      } else {
        res.setHeader('WWW-Authenticate', 'Basic')
        return res.status(401).send('Invalid credentials')
      }
    })

    app.use(this.config.basePath, serverAdapter.getRouter())

    this.server = app
    this.serverInstance = app.listen(this.config.port, () => {
      this.logger.info('Metrics dashboard started', {
        port: this.config.port,
        basePath: this.config.basePath
      })
    })
  }

  public async stop(): Promise<void> {
    if (this.serverInstance) {
      await new Promise<void>((resolve, reject) => {
        if (!this.serverInstance) return resolve()
        this.serverInstance.close((err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
      this.server = null
      this.serverInstance = null
      this.logger.info('Metrics dashboard stopped')
    }
  }

  public registerQueue(queue: Queue): void {
    this.queues.add(queue)
    this.logger.info('Queue registered with dashboard', { queue: queue.name })
  }

  public unregisterQueue(queue: Queue): void {
    this.queues.delete(queue)
    this.logger.info('Queue unregistered from dashboard', { queue: queue.name })
  }
}
