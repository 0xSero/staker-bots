import { Queue } from 'bullmq'
import { Logger } from '../shared/Logger'
import { JobOrchestrator, FlowController, HealthMonitor } from '@/orchestrator'
import { ApplicationConfig } from '../config/index'
import { redisConfig } from '@/config/redis'
import { MetricsDashboard } from '@/metrics/MetricsDashboard'

export class ComponentFactory {
  private queues: Record<string, Queue> = {}
  private components: Map<string, any> = new Map()
  private dashboard: MetricsDashboard | null = null

  constructor(
    private config: ApplicationConfig,
    private logger: Logger
  ) {}

  public async initialize(): Promise<void> {
    this.logger.info('Initializing components...')
    await this.createQueues()
    await this.createComponents()
    await this.setupDependencies()
    await this.initializeDashboard()

    // Add test jobs if BULL_BOARD is true
    if (process.env.BULL_BOARD === 'true') {
      await this.addTestJobs()
    }

    this.logger.info('Components initialized successfully')
  }

  public async start(): Promise<void> {
    this.logger.info('Starting components...')
    const orchestrator = this.getComponent<JobOrchestrator>('orchestrator')
    const flowController = this.getComponent<FlowController>('flowController')
    const healthMonitor = this.getComponent<HealthMonitor>('healthMonitor')

    await orchestrator.start()
    await flowController.start()
    healthMonitor.start()

    // Start dashboard if enabled
    if (process.env.BULL_BOARD === 'true' && this.dashboard) {
      await this.dashboard.start()
    }

    this.logger.info('Components started successfully')
  }

  public async stop(): Promise<void> {
    this.logger.info('Stopping components...')
    const orchestrator = this.getComponent<JobOrchestrator>('orchestrator')
    const flowController = this.getComponent<FlowController>('flowController')
    const healthMonitor = this.getComponent<HealthMonitor>('healthMonitor')

    await orchestrator.stop()
    await flowController.stop()
    healthMonitor.stop()

    // Stop dashboard if running
    if (this.dashboard) {
      await this.dashboard.stop()
    }

    // Close queues
    await Promise.all(Object.values(this.queues).map(queue => queue.close()))

    this.logger.info('Components stopped successfully')
  }

  public getQueue(name: string): Queue {
    const queue = this.queues[name]
    if (!queue) {
      throw new Error(`Queue ${name} not found`)
    }
    return queue
  }

  public getComponent<T>(name: string): T {
    const component = this.components.get(name)
    if (!component) {
      throw new Error(`Component ${name} not found`)
    }
    return component as T
  }

  private async createQueues(): Promise<void> {
    const queueNames = [
      'events',
      'database',
      'deposits',
      'rewards',
      'profitability',
      'execution',
      'results'
    ]

    for (const name of queueNames) {
      this.queues[name] = new Queue(name, { connection: redisConfig })
    }

    this.logger.info('Created queues', { queueNames: Object.keys(this.queues) })
  }

  private async createComponents(): Promise<void> {
    // Create orchestrator
    const orchestrator = new JobOrchestrator(
      this.queues,
      this.logger,
      this.config.orchestrator
    )
    this.components.set('orchestrator', orchestrator)

    // Create flow controller
    const flowController = new FlowController(
      this.queues,
      this.config.flowControl,
      this.logger
    )
    this.components.set('flowController', flowController)

    // Create health monitor
    const healthMonitor = HealthMonitor.getInstance(
      this.config.health,
      this.logger
    )
    this.components.set('healthMonitor', healthMonitor)

    this.logger.info('Created components', {
      components: Array.from(this.components.keys())
    })
  }

  private async setupDependencies(): Promise<void> {
    const orchestrator = this.getComponent<JobOrchestrator>('orchestrator')

    // Set up queue dependencies
    const dependencies: Array<{
      sourceQueue: string
      targetQueue: string
      condition?: (result: any) => boolean
    }> = [
      { sourceQueue: 'events', targetQueue: 'database' },
      { sourceQueue: 'database', targetQueue: 'deposits' },
      { sourceQueue: 'deposits', targetQueue: 'rewards' },
      {
        sourceQueue: 'rewards',
        targetQueue: 'profitability',
        condition: result => result.hasUnclaimedRewards
      },
      {
        sourceQueue: 'profitability',
        targetQueue: 'execution',
        condition: result => result.isProfitable
      },
      { sourceQueue: 'execution', targetQueue: 'results' }
    ]

    for (const dep of dependencies) {
      orchestrator.addQueueDependency(dep)
    }

    this.logger.info('Set up queue dependencies')
  }

  private async initializeDashboard(): Promise<void> {
    if (process.env.BULL_BOARD === 'true') {
      this.dashboard = MetricsDashboard.getInstance({
        port: parseInt(process.env.BULL_BOARD_PORT || '3000', 10),
        basePath: process.env.BULL_BOARD_BASE_PATH || '/',
        username: process.env.BULL_BOARD_USERNAME || 'admin',
        password: process.env.BULL_BOARD_PASSWORD || 'admin'
      })

      // Register all queues with the dashboard
      Object.values(this.queues).forEach(queue => {
        this.dashboard?.registerQueue(queue)
      })

      this.logger.info('Metrics dashboard initialized')
    }
  }

  private async addTestJobs(): Promise<void> {
    // Add a test job to each queue
    for (const [queueName, queue] of Object.entries(this.queues)) {
      await queue.add('test-job', {
        message: `Test job for ${queueName} queue`,
        timestamp: new Date().toISOString()
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      })
      this.logger.info('Added test job', { queue: queueName })
    }
  }
}
