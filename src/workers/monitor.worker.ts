import { Worker, Queue, QueueEvents, ConnectionOptions, Job } from 'bullmq'
import { ethers, Log } from 'ethers'
import { QUEUE_NAMES } from '@/lib/queue-definitions'
import { EventProcessingJob, EventProcessingJobData, EventProcessingJobResult, EVENT_PROCESSING_JOB_OPTIONS } from '../types/event-processing'
import { WorkerMetrics, WorkerMetricsData } from '../utils/metrics'
import { ProfitabilityJobData } from '../types/profitability'
import { IDatabase } from 'modules/database'

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
  database: IDatabase
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
  private readonly db: IDatabase

  constructor(private readonly config: MonitorWorkerConfig) {
    this.metrics = new WorkerMetrics('monitor-worker')
    this.contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      config.provider
    )
    this.profitabilityQueue = config.profitabilityQueue
    this.db = config.database

    // Initialize lastProcessedBlock from START_BLOCK environment variable
    const startBlock = parseInt(process.env.START_BLOCK || '0', 10);
    if (startBlock > 0) {
      this.lastProcessedBlock = startBlock - 1; // Subtract 1 so we start FROM the startBlock
      console.log(`Initializing monitor to start from block ${startBlock}`);
    }

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
      const { eventType, blockNumber, eventData, transactionHash } = job.data

      // Skip processing for unknown events but still mark as success
      if (eventType === 'unknown') {
        return {
          success: true,
          processedAt: Date.now(),
          blockNumber,
          eventType,
          message: 'Skipped unknown event type'
        }
      }

      // Create database entry for the event
      const dbEntry = {
        deposit_id: eventData.depositId?.toString(),
        owner_address: eventData.owner || eventData._owner,
        depositor_address: eventData.depositor || eventData._depositor || eventData.owner || eventData._owner,
        delegatee_address: eventData.delegatee || eventData._delegatee || eventData.newDelegatee,
        amount: eventData.amount?.toString() || '0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      // Process the event based on its type
      switch (eventType) {
        case 'StakeDeposited': {
          // Save to database first
          if (typeof this.db?.createDeposit === 'function') {
            await this.db.createDeposit(dbEntry)
          }

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
            }, {
              // Add job options for visibility
              removeOnComplete: false,
              removeOnFail: false
            })
          }
          break
        }
        case 'StakeWithdrawn': {
          // Update database
          if (typeof this.db?.updateDeposit === 'function') {
            await this.db.updateDeposit(eventData.depositId.toString(), {
              amount: '0',
              updated_at: new Date().toISOString()
            })
          }

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
          // Update database
          if (typeof this.db?.updateDeposit === 'function') {
            await this.db.updateDeposit(eventData.depositId.toString(), {
              delegatee_address: eventData.newDelegatee,
              updated_at: new Date().toISOString()
            })
          }

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
          console.log(`Unhandled event type: ${eventType}`)
          return {
            success: true,
            processedAt: Date.now(),
            blockNumber,
            eventType,
            message: `Unhandled event type: ${eventType}`
          }
      }

      // Update checkpoint after successful processing
      if (typeof this.db?.updateCheckpoint === 'function') {
        await this.db.updateCheckpoint({
          component_type: 'monitor',
          last_block_number: blockNumber,
          block_hash: transactionHash,
          last_update: new Date().toISOString()
        })
      }

      return {
        success: true,
        processedAt: Date.now(),
        blockNumber,
        eventType
      }
    } catch (error) {
      console.error('Error processing event:', error)
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
    // Get the configured max block range from environment or config
    let maxBlockRange = parseInt(process.env.MONITOR_MAX_BLOCK_RANGE || '500', 10);
    console.log(`Starting event polling with max block range: ${maxBlockRange}`);

    while (this.isRunning) {
      try {
        const currentBlock = await this.config.provider.getBlockNumber();
        const confirmedBlock = currentBlock - (this.config.blockConfirmations || 1);

        if (confirmedBlock <= this.lastProcessedBlock) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        const fromBlock = this.lastProcessedBlock + 1;

        // Calculate the range, but don't exceed max range
        const blockDifference = confirmedBlock - fromBlock + 1;
        const blockRange = Math.min(blockDifference, maxBlockRange);
        const toBlock = fromBlock + blockRange - 1;

        console.log(`Querying blocks ${fromBlock} to ${toBlock} (range: ${blockRange})`);

        const events = await this.contract.queryFilter('*', fromBlock, toBlock);
        console.log(`Found ${events.length} events in block range ${fromBlock}-${toBlock}`);

        // Group deposits by block for batch profitability checks
        const depositsByBlock = new Map<number, Array<{
          id: string
          owner: string
          depositor?: string
          delegatee?: string
          amount: string
          createdAt: string
          updatedAt: string
        }>>();

        for (const event of events) {
          const eventType = isContractEvent(event) ? event.fragment.name : 'unknown';

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
          );

          // Group deposits for batch profitability checks
          if (eventType === 'StakeDeposited' && isContractEvent(event)) {
            const blockDeposits = depositsByBlock.get(event.blockNumber!) || [];
            blockDeposits.push({
              id: event.args.depositId.toString(),
              owner: event.args.owner,
              depositor: event.args.depositor,
              delegatee: event.args.delegatee,
              amount: event.args.amount.toString(),
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
            depositsByBlock.set(event.blockNumber!, blockDeposits);
          }
        }

        // Queue batch profitability checks
        if (this.profitabilityQueue) {
          for (const [blockNumber, deposits] of depositsByBlock.entries()) {
            await this.profitabilityQueue.add('check-profitability', {
              deposits,
              batchId: `block-${blockNumber}`,
              timestamp: Date.now()
            });
          }
        }

        this.lastProcessedBlock = toBlock;

        // If successful, we can gradually increase the range up to our configured max
        const configuredMax = parseInt(process.env.MONITOR_MAX_BLOCK_RANGE || '500', 10);
        maxBlockRange = Math.min(Math.floor(maxBlockRange * 1.1), configuredMax);
      } catch (error) {
        console.error('Error in event polling:', error);

        // Reduce block range on error, but don't go below 10 blocks
        maxBlockRange = Math.max(Math.floor(maxBlockRange / 2), 10);
        console.log(`Reduced block range to ${maxBlockRange} due to error`);

        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  public getMetrics(): WorkerMetricsData {
    return this.metrics.getMetrics()
  }
}
