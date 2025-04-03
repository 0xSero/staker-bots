import { Worker, Queue, QueueEvents, ConnectionOptions, Job } from 'bullmq'
import { ethers, Log } from 'ethers'
import { QUEUE_NAMES } from '@/lib/queue-definitions'
import { EventProcessingJob, EventProcessingJobData, EventProcessingJobResult, EVENT_PROCESSING_JOB_OPTIONS } from '../types/event-processing'
import { WorkerMetrics, WorkerMetricsData } from '../utils/metrics'
import { ProfitabilityJobData } from '../types/profitability'

function isContractEvent(event: Log): event is ethers.EventLog {
  return 'fragment' in event && event.fragment !== undefined
}

export interface MonitorWorkerConfig {
  connection: ConnectionOptions
  provider: ethers.Provider
  contractAddress: string
  contractAbi: any
  concurrency?: number
  blockConfirmations?: number
  profitabilityQueue?: Queue<ProfitabilityJobData>
}

export class MonitorWorker {
  private worker: Worker<EventProcessingJobData, EventProcessingJobResult>
  private eventQueue: Queue<EventProcessingJobData, EventProcessingJobResult>
  private queueEvents: QueueEvents
  private metrics: WorkerMetrics
  private contract: ethers.Contract
  private isRunning: boolean = false
  private lastProcessedBlock: number = 0
  private readonly profitabilityQueue?: Queue<ProfitabilityJobData>

  constructor(private readonly config: MonitorWorkerConfig) {
    this.metrics = new WorkerMetrics('monitor-worker')
    this.contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      config.provider
    )
    this.profitabilityQueue = config.profitabilityQueue

    // Create queue for event processing
    this.eventQueue = new Queue<EventProcessingJobData, EventProcessingJobResult>(
      QUEUE_NAMES.EVENT_PROCESSING,
      {
        connection: config.connection,
        defaultJobOptions: EVENT_PROCESSING_JOB_OPTIONS
      }
    )

    // Create queue events listener
    this.queueEvents = new QueueEvents(QUEUE_NAMES.EVENT_PROCESSING, {
      connection: config.connection
    })

    // Create worker
    this.worker = new Worker<EventProcessingJobData, EventProcessingJobResult>(
      QUEUE_NAMES.EVENT_PROCESSING,
      this.processEvent.bind(this),
      {
        connection: config.connection,
        concurrency: config.concurrency || 1,
        lockDuration: 30000 // 30 seconds
      }
    )

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    // Worker events
    this.worker.on('completed', (job: Job<EventProcessingJobData, EventProcessingJobResult>) => {
      const processingTime = Date.now() - job.timestamp
      this.metrics.recordSuccess(processingTime)
    })

    this.worker.on('failed', (job: Job<EventProcessingJobData, EventProcessingJobResult> | undefined, error: Error) => {
      if (job) {
        const processingTime = Date.now() - job.timestamp
        this.metrics.recordFailure(processingTime)
      }
      console.error(`Job ${job?.id} failed:`, error)
    })

    // Queue events
    this.queueEvents.on('waiting', ({ jobId }) => {
      console.log(`Job ${jobId} is waiting to be processed`)
    })

    this.queueEvents.on('active', ({ jobId, prev }) => {
      console.log(`Job ${jobId} is now active; previous state was ${prev}`)
    })
  }

  private async processEvent(job: EventProcessingJob): Promise<EventProcessingJobResult> {
    const startTime = Date.now()

    try {
      const { eventType, blockNumber, eventData } = job.data

      // Process the event based on its type
      switch (eventType) {
        case 'StakeDeposited': {
          // Queue deposit for profitability check
          if (this.profitabilityQueue) {
            await this.profitabilityQueue.add('check-profitability', {
              deposits: [{
                id: eventData.depositId,
                owner: eventData.owner,
                depositor: eventData.depositor,
                delegatee: eventData.delegatee,
                amount: eventData.amount.toString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              }],
              batchId: `deposit-${eventData.depositId}-${blockNumber}`,
              timestamp: Date.now()
            })
          }
          break
        }
        case 'StakeWithdrawn': {
          // Handle stake withdrawal by checking if we need to recheck profitability
          // for any remaining deposits from the same owner
          if (this.profitabilityQueue) {
            if (typeof this.contract.deposits !== 'function') {
              console.error('deposits function not found on contract');
              break;
            }
            const deposit = await this.contract.deposits(eventData.depositId)
            if (deposit) {
              if (typeof this.contract.getDepositsForOwner !== 'function') {
                console.error('getDepositsForOwner function not found on contract');
                break;
              }
              const ownerDeposits = await this.contract.getDepositsForOwner(deposit[0])
              if (ownerDeposits && ownerDeposits.length > 0) {
                await this.profitabilityQueue.add('check-profitability', {
                  deposits: ownerDeposits.map((d: { depositId: ethers.BigNumberish, owner: string, delegatee: string, amount: ethers.BigNumberish }) => ({
                    id: d.depositId.toString(),
                    owner: d.owner,
                    delegatee: d.delegatee,
                    amount: d.amount.toString(),
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                  })),
                  batchId: `withdraw-${eventData.depositId}-${blockNumber}`,
                  timestamp: Date.now()
                })
              }
            }
          }
          break
        }
        case 'DelegateeAltered': {
          // Queue deposit for profitability check after delegatee change
          if (this.profitabilityQueue) {
            if (typeof this.contract.deposits !== 'function') {
              console.error('deposits function not found on contract');
              break;
            }
            const deposit = await this.contract.deposits(eventData.depositId)
            if (deposit) {
              await this.profitabilityQueue.add('check-profitability', {
                deposits: [{
                  id: eventData.depositId,
                  owner: deposit[0],
                  delegatee: eventData.newDelegatee,
                  amount: deposit[1].toString(),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }],
                batchId: `delegate-${eventData.depositId}-${blockNumber}`,
                timestamp: Date.now()
              })
            }
          }
          break
        }
        case 'DepositUpdated': {
          // Handle deposit updates by checking profitability for both old and new deposit IDs
          if (this.profitabilityQueue) {
            if (typeof this.contract.deposits !== 'function') {
              console.error('deposits function not found on contract');
              break;
            }
            const [oldDeposit, newDeposit] = await Promise.all([
              this.contract.deposits(eventData.oldDepositId),
              this.contract.deposits(eventData.newDepositId)
            ])

            const deposits = []
            if (oldDeposit) {
              deposits.push({
                id: eventData.oldDepositId,
                owner: oldDeposit[0],
                delegatee: oldDeposit[3],
                amount: oldDeposit[1].toString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
            }
            if (newDeposit) {
              deposits.push({
                id: eventData.newDepositId,
                owner: newDeposit[0],
                delegatee: newDeposit[3],
                amount: newDeposit[1].toString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              })
            }

            if (deposits.length > 0) {
              await this.profitabilityQueue.add('check-profitability', {
                deposits,
                batchId: `update-${eventData.oldDepositId}-${eventData.newDepositId}-${blockNumber}`,
                timestamp: Date.now()
              })
            }
          }
          break
        }
        case 'StakedWithAttribution': {
          // Handle staked with attribution by checking profitability for the deposit
          if (this.profitabilityQueue) {
            if (typeof this.contract.deposits !== 'function') {
              console.error('deposits function not found on contract');
              break;
            }
            const deposit = await this.contract.deposits(eventData.depositId)
            if (deposit) {
              await this.profitabilityQueue.add('check-profitability', {
                deposits: [{
                  id: eventData.depositId,
                  owner: deposit[0],
                  delegatee: eventData.referrer,
                  amount: deposit[1].toString(),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }],
                batchId: `attribution-${eventData.depositId}-${blockNumber}`,
                timestamp: Date.now()
              })
            }
          }
          break
        }
        case 'DepositInitialized': {
          // Handle deposit initialization by checking initial profitability
          if (this.profitabilityQueue) {
            if (typeof this.contract.deposits !== 'function') {
              console.error('deposits function not found on contract');
              break;
            }
            const deposit = await this.contract.deposits(eventData.depositId)
            if (deposit) {
              await this.profitabilityQueue.add('check-profitability', {
                deposits: [{
                  id: eventData.depositId,
                  owner: deposit[0],
                  delegatee: eventData.delegatee,
                  amount: deposit[1].toString(),
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString()
                }],
                batchId: `init-${eventData.depositId}-${blockNumber}`,
                timestamp: Date.now()
              })
            }
          }
          break
        }
        default:
          throw new Error(`Unknown event type: ${eventType}`)
      }

      return {
        success: true,
        processedAt: Date.now(),
        blockNumber,
        eventType
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        processedAt: Date.now(),
        blockNumber: job.data.blockNumber,
        eventType: job.data.eventType
      }
    }
  }

  public async start(): Promise<void> {
    if (this.isRunning) return

    this.isRunning = true
    await this.startEventPolling()
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return

    this.isRunning = false
    await this.worker.close()
    await this.eventQueue.close()
    await this.queueEvents.close()
  }

  private async startEventPolling(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await this.config.provider.getBlockNumber()
        const confirmedBlock = currentBlock - (this.config.blockConfirmations || 1)

        if (confirmedBlock <= this.lastProcessedBlock) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        const fromBlock = this.lastProcessedBlock + 1
        const toBlock = confirmedBlock

        const events = await this.contract.queryFilter('*', fromBlock, toBlock)

        // Group deposits by block for batch profitability checks
        const depositsByBlock = new Map<number, Array<{
          id: string
          owner: string
          depositor?: string
          delegatee?: string
          amount: string
          createdAt: string
          updatedAt: string
        }>>()

        for (const event of events) {
          const eventType = isContractEvent(event) ? event.fragment.name : 'unknown'

          // Add event to processing queue
          await this.eventQueue.add(
            'process-event',
            {
              eventType,
              blockNumber: event.blockNumber,
              transactionHash: event.transactionHash,
              eventData: isContractEvent(event) ? event.args || {} : {},
              timestamp: Date.now()
            }
          )

          // Group deposits for batch profitability checks
          if (eventType === 'StakeDeposited' && isContractEvent(event)) {
            const blockDeposits = depositsByBlock.get(event.blockNumber!) || []
            blockDeposits.push({
              id: event.args.depositId.toString(),
              owner: event.args.owner,
              depositor: event.args.depositor,
              delegatee: event.args.delegatee,
              amount: event.args.amount.toString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            })
            depositsByBlock.set(event.blockNumber!, blockDeposits)
          }
        }

        // Queue batch profitability checks
        if (this.profitabilityQueue) {
          for (const [blockNumber, deposits] of depositsByBlock.entries()) {
            await this.profitabilityQueue.add('check-profitability', {
              deposits,
              batchId: `block-${blockNumber}`,
              timestamp: Date.now()
            })
          }
        }

        this.lastProcessedBlock = toBlock
      } catch (error) {
        console.error('Error in event polling:', error)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  public getMetrics(): WorkerMetricsData {
    return this.metrics.getMetrics()
  }
}
