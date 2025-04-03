import { Worker, QueueEvents, ConnectionOptions, Job } from 'bullmq'
import { ConsoleLogger } from 'modules/monitor/logging'
import { DatabaseWrapper, DatabaseConfig } from 'modules/database/DatabaseWrapper'
import { QUEUE_NAMES } from '@/lib/queue-definitions'

// Define job data types
export type DatabaseJobData = {
  operationType: string
  params: any
  requestId: string
}

export type DatabaseJobResult = {
  success: boolean
  data?: any
  error?: string
  requestId: string
  operationType: string
  timestamp: number
}

export enum DatabaseOperationType {
  // Deposits
  CREATE_DEPOSIT = 'CREATE_DEPOSIT',
  UPDATE_DEPOSIT = 'UPDATE_DEPOSIT',
  GET_DEPOSIT = 'GET_DEPOSIT',
  GET_DEPOSITS_BY_DELEGATEE = 'GET_DEPOSITS_BY_DELEGATEE',
  GET_DEPOSITS_BY_OWNER = 'GET_DEPOSITS_BY_OWNER',
  GET_DEPOSITS_BY_DEPOSITOR = 'GET_DEPOSITS_BY_DEPOSITOR',
  GET_ALL_DEPOSITS = 'GET_ALL_DEPOSITS',

  // Checkpoints
  UPDATE_CHECKPOINT = 'UPDATE_CHECKPOINT',
  GET_CHECKPOINT = 'GET_CHECKPOINT',

  // Processing Queue
  CREATE_PROCESSING_QUEUE_ITEM = 'CREATE_PROCESSING_QUEUE_ITEM',
  UPDATE_PROCESSING_QUEUE_ITEM = 'UPDATE_PROCESSING_QUEUE_ITEM',
  GET_PROCESSING_QUEUE_ITEM = 'GET_PROCESSING_QUEUE_ITEM',
  GET_PROCESSING_QUEUE_ITEMS_BY_STATUS = 'GET_PROCESSING_QUEUE_ITEMS_BY_STATUS',
  GET_PROCESSING_QUEUE_ITEM_BY_DEPOSIT_ID = 'GET_PROCESSING_QUEUE_ITEM_BY_DEPOSIT_ID',
  GET_PROCESSING_QUEUE_ITEMS_BY_DELEGATEE = 'GET_PROCESSING_QUEUE_ITEMS_BY_DELEGATEE',
  DELETE_PROCESSING_QUEUE_ITEM = 'DELETE_PROCESSING_QUEUE_ITEM',

  // Transaction Queue
  CREATE_TRANSACTION_QUEUE_ITEM = 'CREATE_TRANSACTION_QUEUE_ITEM',
  UPDATE_TRANSACTION_QUEUE_ITEM = 'UPDATE_TRANSACTION_QUEUE_ITEM',
  GET_TRANSACTION_QUEUE_ITEM = 'GET_TRANSACTION_QUEUE_ITEM',
  GET_TRANSACTION_QUEUE_ITEMS_BY_STATUS = 'GET_TRANSACTION_QUEUE_ITEMS_BY_STATUS',
  GET_TRANSACTION_QUEUE_ITEM_BY_DEPOSIT_ID = 'GET_TRANSACTION_QUEUE_ITEM_BY_DEPOSIT_ID',
  GET_TRANSACTION_QUEUE_ITEMS_BY_HASH = 'GET_TRANSACTION_QUEUE_ITEMS_BY_HASH',
  DELETE_TRANSACTION_QUEUE_ITEM = 'DELETE_TRANSACTION_QUEUE_ITEM',

  // GovLst Deposits
  CREATE_GOVLST_DEPOSIT = 'CREATE_GOVLST_DEPOSIT',
  UPDATE_GOVLST_DEPOSIT = 'UPDATE_GOVLST_DEPOSIT',
  GET_GOVLST_DEPOSIT = 'GET_GOVLST_DEPOSIT',
  GET_GOVLST_DEPOSITS_BY_ADDRESS = 'GET_GOVLST_DEPOSITS_BY_ADDRESS',
  GET_ALL_GOVLST_DEPOSITS = 'GET_ALL_GOVLST_DEPOSITS',

  // GovLst Claim History
  CREATE_GOVLST_CLAIM_HISTORY = 'CREATE_GOVLST_CLAIM_HISTORY',
  GET_GOVLST_CLAIM_HISTORY = 'GET_GOVLST_CLAIM_HISTORY',
  GET_GOVLST_CLAIM_HISTORY_BY_ADDRESS = 'GET_GOVLST_CLAIM_HISTORY_BY_ADDRESS',
  UPDATE_GOVLST_CLAIM_HISTORY = 'UPDATE_GOVLST_CLAIM_HISTORY',
}

export interface DatabaseWorkerConfig {
  connection: ConnectionOptions
  databaseConfig: DatabaseConfig
  concurrency?: number
}

export class DatabaseWorker {
  private worker: Worker<DatabaseJobData, DatabaseJobResult>
  private queueEvents: QueueEvents
  private database: DatabaseWrapper
  private logger = new ConsoleLogger('info', {
    color: '\x1b[35m',
    prefix: '[DatabaseWorker]',
  })

  constructor(private readonly config: DatabaseWorkerConfig) {
    // Initialize database wrapper
    this.database = new DatabaseWrapper(config.databaseConfig)

    // Create worker
    this.worker = new Worker<DatabaseJobData, DatabaseJobResult>(
      QUEUE_NAMES.DATABASE_OPERATIONS,
      this.processOperation.bind(this),
      {
        connection: config.connection,
        concurrency: config.concurrency || 5,
        lockDuration: 30000, // 30 seconds
      }
    )

    // Create queue events listener
    this.queueEvents = new QueueEvents(QUEUE_NAMES.DATABASE_OPERATIONS, {
      connection: config.connection,
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.worker.on('completed', job => {
      this.logger.info(`Job ${job.id} completed successfully`, {
        operationType: job.data.operationType,
        requestId: job.data.requestId,
      })
    })

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.id} failed:`, {
        error,
        operationType: job?.data.operationType,
        requestId: job?.data.requestId,
      })
    })

    this.queueEvents.on('waiting', ({ jobId }) => {
      this.logger.info(`Job ${jobId} is waiting to be processed`)
    })

    this.queueEvents.on('active', ({ jobId, prev }) => {
      this.logger.info(`Job ${jobId} is now active; previous state was ${prev}`)
    })
  }

  private async processOperation(job: Job<DatabaseJobData, DatabaseJobResult>): Promise<DatabaseJobResult> {
    const { operationType, params, requestId } = job.data
    this.logger.info(`Processing ${operationType} operation`, { requestId })

    try {
      let data: any

      switch (operationType) {
        // Deposits
        case DatabaseOperationType.CREATE_DEPOSIT:
          await this.database.createDeposit(params.deposit)
          data = { success: true }
          break

        case DatabaseOperationType.UPDATE_DEPOSIT:
          await this.database.updateDeposit(params.depositId, params.update)
          data = { success: true }
          break

        case DatabaseOperationType.GET_DEPOSIT:
          data = await this.database.getDeposit(params.depositId)
          break

        case DatabaseOperationType.GET_DEPOSITS_BY_DELEGATEE:
          data = await this.database.getDepositsByDelegatee(params.delegateeAddress)
          break

        case DatabaseOperationType.GET_DEPOSITS_BY_OWNER:
          data = await this.database.getDepositsByOwner(params.ownerAddress)
          break

        case DatabaseOperationType.GET_DEPOSITS_BY_DEPOSITOR:
          data = await this.database.getDepositsByDepositor(params.depositorAddress)
          break

        case DatabaseOperationType.GET_ALL_DEPOSITS:
          data = await this.database.getAllDeposits()
          break

        // Checkpoints
        case DatabaseOperationType.UPDATE_CHECKPOINT:
          await this.database.updateCheckpoint(params.checkpoint)
          data = { success: true }
          break

        case DatabaseOperationType.GET_CHECKPOINT:
          data = await this.database.getCheckpoint(params.componentType)
          break

        // Processing Queue
        case DatabaseOperationType.CREATE_PROCESSING_QUEUE_ITEM:
          data = await this.database.createProcessingQueueItem(params.item)
          break

        case DatabaseOperationType.UPDATE_PROCESSING_QUEUE_ITEM:
          await this.database.updateProcessingQueueItem(params.id, params.update)
          data = { success: true }
          break

        case DatabaseOperationType.GET_PROCESSING_QUEUE_ITEM:
          data = await this.database.getProcessingQueueItem(params.id)
          break

        case DatabaseOperationType.GET_PROCESSING_QUEUE_ITEMS_BY_STATUS:
          data = await this.database.getProcessingQueueItemsByStatus(params.status)
          break

        case DatabaseOperationType.GET_PROCESSING_QUEUE_ITEM_BY_DEPOSIT_ID:
          data = await this.database.getProcessingQueueItemByDepositId(params.depositId)
          break

        case DatabaseOperationType.GET_PROCESSING_QUEUE_ITEMS_BY_DELEGATEE:
          data = await this.database.getProcessingQueueItemsByDelegatee(params.delegatee)
          break

        case DatabaseOperationType.DELETE_PROCESSING_QUEUE_ITEM:
          await this.database.deleteProcessingQueueItem(params.id)
          data = { success: true }
          break

        // Transaction Queue
        case DatabaseOperationType.CREATE_TRANSACTION_QUEUE_ITEM:
          data = await this.database.createTransactionQueueItem(params.item)
          break

        case DatabaseOperationType.UPDATE_TRANSACTION_QUEUE_ITEM:
          await this.database.updateTransactionQueueItem(params.id, params.update)
          data = { success: true }
          break

        case DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEM:
          data = await this.database.getTransactionQueueItem(params.id)
          break

        case DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEMS_BY_STATUS:
          data = await this.database.getTransactionQueueItemsByStatus(params.status)
          break

        case DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEM_BY_DEPOSIT_ID:
          data = await this.database.getTransactionQueueItemByDepositId(params.depositId)
          break

        case DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEMS_BY_HASH:
          data = await this.database.getTransactionQueueItemsByHash(params.hash)
          break

        case DatabaseOperationType.DELETE_TRANSACTION_QUEUE_ITEM:
          await this.database.deleteTransactionQueueItem(params.id)
          data = { success: true }
          break

        // GovLst Deposits
        case DatabaseOperationType.CREATE_GOVLST_DEPOSIT:
          await this.database.createGovLstDeposit(params.deposit)
          data = { success: true }
          break

        case DatabaseOperationType.UPDATE_GOVLST_DEPOSIT:
          await this.database.updateGovLstDeposit(params.depositId, params.update)
          data = { success: true }
          break

        case DatabaseOperationType.GET_GOVLST_DEPOSIT:
          data = await this.database.getGovLstDeposit(params.depositId)
          break

        case DatabaseOperationType.GET_GOVLST_DEPOSITS_BY_ADDRESS:
          data = await this.database.getGovLstDepositsByAddress(params.govLstAddress)
          break

        case DatabaseOperationType.GET_ALL_GOVLST_DEPOSITS:
          data = await this.database.getAllGovLstDeposits()
          break

        // GovLst Claim History
        case DatabaseOperationType.CREATE_GOVLST_CLAIM_HISTORY:
          data = await this.database.createGovLstClaimHistory(params.claim)
          break

        case DatabaseOperationType.GET_GOVLST_CLAIM_HISTORY:
          data = await this.database.getGovLstClaimHistory(params.id)
          break

        case DatabaseOperationType.GET_GOVLST_CLAIM_HISTORY_BY_ADDRESS:
          data = await this.database.getGovLstClaimHistoryByAddress(params.govLstAddress)
          break

        case DatabaseOperationType.UPDATE_GOVLST_CLAIM_HISTORY:
          await this.database.updateGovLstClaimHistory(params.id, params.update)
          data = { success: true }
          break

        default:
          throw new Error(`Unknown operation type: ${operationType}`)
      }

      return {
        success: true,
        data,
        requestId,
        operationType,
        timestamp: Date.now(),
      }
    } catch (error) {
      this.logger.error(`Error processing ${operationType} operation:`, { error, requestId })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requestId,
        operationType,
        timestamp: Date.now(),
      }
    }
  }

  public getDatabase(): DatabaseWrapper {
    return this.database
  }

  public async start(): Promise<void> {
    this.logger.info('Database worker started')
  }

  public async stop(): Promise<void> {
    await this.worker.close()
    await this.queueEvents.close()
    this.logger.info('Database worker stopped')
  }
}
