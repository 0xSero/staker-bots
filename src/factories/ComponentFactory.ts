import { Queue } from 'bullmq'
import { Logger } from '../types/logger'
import { JobOrchestrator, FlowController, HealthMonitor } from '@/orchestrator'
import { ApplicationConfig } from '../config/index'
import { redisConfig } from '@/config/redis'

export class ComponentFactory {
  private queues: Record<string, Queue> = {}
  private components: Map<string, any> = new Map()

  constructor(
    private config: ApplicationConfig,
    private logger: Logger
  ) {}

  public async initialize(): Promise<void> {
    this.logger.info('Initializing components...')
    await this.createQueues()
    await this.createComponents()
    await this.setupDependencies()
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
}
