import { Worker, QueueEvents, Job } from 'bullmq'
import {
  DepositScanJobData,
  DepositScanJobResult,
  DepositScanType,
  DEPOSIT_SCAN_JOB_OPTIONS,
  DepositScanWorkerConfig,
  DepositBatch,
} from '../types/deposit-scan'
import { WorkerMetrics, WorkerMetricsData } from '../utils/metrics'
import { QUEUE_NAMES } from '@/lib/queue-definitions'
import { Deposit as OperationsDeposit } from '../types/database-operations'
import { Deposit as DatabaseDeposit } from '../../modules/database/interfaces/types'

function mapDatabaseDepositToOperationsDeposit(dbDeposit: DatabaseDeposit): OperationsDeposit {
  return {
    id: dbDeposit.deposit_id,
    ownerAddress: dbDeposit.owner_address,
    delegateeAddress: dbDeposit.delegatee_address,
    amount: dbDeposit.amount,
    blockNumber: parseInt(dbDeposit.created_at), // Using created_at timestamp as block number
    transactionHash: '0x' + dbDeposit.deposit_id, // Using deposit_id as transaction hash
    timestamp: new Date(dbDeposit.created_at).getTime()
  }
}

export class DepositScannerWorker {
  private worker: Worker<DepositScanJobData, DepositScanJobResult>
  private metrics: WorkerMetrics
  private queueEvents: QueueEvents

  constructor(private readonly config: DepositScanWorkerConfig) {
    this.metrics = new WorkerMetrics('deposit-scanner-worker')

    // Create worker
    this.worker = new Worker<DepositScanJobData, DepositScanJobResult>(
      QUEUE_NAMES.DEPOSIT_SCAN,
      this.processScan.bind(this),
      {
        connection: config.connection,
        concurrency: config.concurrency || 3,
        lockDuration: 30000 // 30 seconds
      }
    )

    // Create queue events listener
    this.queueEvents = new QueueEvents(QUEUE_NAMES.DEPOSIT_SCAN, {
      connection: config.connection
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.worker.on('completed', job => {
      const processingTime = Date.now() - job.timestamp
      this.metrics.recordSuccess(processingTime)
    })

    this.worker.on('failed', (job, error) => {
      if (job) {
        const processingTime = Date.now() - job.timestamp
        this.metrics.recordFailure(processingTime)
      }
      console.error(`Job ${job?.id} failed:`, error)
    })

    this.queueEvents.on('waiting', ({ jobId }) => {
      console.log(`Job ${jobId} is waiting to be processed`)
    })

    this.queueEvents.on('active', ({ jobId, prev }) => {
      console.log(`Job ${jobId} is now active; previous state was ${prev}`)
    })
  }

  private async processScan(job: Job<DepositScanJobData, DepositScanJobResult>): Promise<DepositScanJobResult> {
    const { scanType, depositIds, fromBlock, toBlock, batchId } = job.data
    const timestamp = Date.now()

    try {
      let dbDeposits: DatabaseDeposit[] = []

      switch (scanType) {
        case DepositScanType.SPECIFIC:
          if (!depositIds?.length) {
            throw new Error('No deposit IDs provided for specific scan')
          }

          // Get specific deposits
          const depositPromises = depositIds.map(id =>
            this.config.databaseClient.getDeposit(id)
          )
          const results = await Promise.all(depositPromises)
          dbDeposits = results.filter((d): d is DatabaseDeposit => d !== null)
          break

        case DepositScanType.RANGE:
          if (typeof fromBlock !== 'number' || typeof toBlock !== 'number') {
            throw new Error('Block range not provided for range scan')
          }

          // Get deposits within block range
          dbDeposits = await this.config.databaseClient.getAllDeposits()
          // Filter by block range if needed
          break

        case DepositScanType.ALL:
          // Get all deposits
          dbDeposits = await this.config.databaseClient.getAllDeposits()
          break

        default:
          throw new Error(`Unknown scan type: ${scanType}`)
      }

      // Convert database deposits to operations deposits
      const deposits = dbDeposits.map(mapDatabaseDepositToOperationsDeposit)

      // Split deposits into batches if needed
      const batches = this.batchDeposits(deposits, batchId)

      // Queue reward check jobs for each batch
      await Promise.all(
        batches.map(batch =>
          this.config.rewardCheckQueue.add(
            'check-rewards',
            {
              deposits: batch.deposits,
              batchId: batch.batchId,
              timestamp: batch.timestamp
            },
            {
              ...DEPOSIT_SCAN_JOB_OPTIONS,
              jobId: `reward-check-${batch.batchId}`
            }
          )
        )
      )

      return {
        success: true,
        scannedDeposits: deposits,
        scanType,
        fromBlock,
        toBlock,
        timestamp,
        batchId
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        scannedDeposits: [],
        scanType,
        fromBlock,
        toBlock,
        timestamp,
        batchId
      }
    }
  }

  private batchDeposits(deposits: OperationsDeposit[], parentBatchId: string): DepositBatch[] {
    const maxBatchSize = this.config.maxBatchSize || 100
    const batches: DepositBatch[] = []
    const timestamp = Date.now()

    for (let i = 0; i < deposits.length; i += maxBatchSize) {
      const batchDeposits = deposits.slice(i, i + maxBatchSize)
      batches.push({
        batchId: `${parentBatchId}-${i / maxBatchSize}`,
        deposits: batchDeposits,
        timestamp
      })
    }

    return batches
  }

  public async start(): Promise<void> {
    // Worker is automatically started on creation
  }

  public async stop(): Promise<void> {
    await this.worker.close()
    await this.queueEvents.close()
  }

  public getMetrics(): WorkerMetricsData {
    return this.metrics.getMetrics()
  }
}
