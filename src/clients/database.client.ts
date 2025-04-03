import { Queue, QueueEvents } from 'bullmq'
import { v4 as uuidv4 } from 'uuid'
import { ConsoleLogger } from '../../modules/monitor/logging'
import { QueueFactory } from '@/lib/queue-factory'
import { QUEUE_NAMES } from '@/lib/queue-definitions'
import { DatabaseOperationType } from '@/workers/database.worker'
import {
  Deposit,
  ProcessingCheckpoint,
  ProcessingQueueItem,
  TransactionQueueItem,
  ProcessingQueueStatus,
  TransactionQueueStatus,
  GovLstDeposit,
  GovLstClaimHistory,
} from '../../modules/database/interfaces/types'

export class DatabaseClient {
  private queue: Queue
  private queueEvents: QueueEvents
  private logger = new ConsoleLogger('info', {
    color: '\x1b[35m',
    prefix: '[DatabaseClient]',
  })

  constructor() {
    this.queue = QueueFactory.getQueue(QUEUE_NAMES.DATABASE_OPERATIONS)
    this.queueEvents = new QueueEvents(QUEUE_NAMES.DATABASE_OPERATIONS)
  }

  private async addJob<T>(
    operationType: DatabaseOperationType,
    params: any,
  ): Promise<T> {
    const requestId = uuidv4()
    this.logger.info(`Adding job: ${operationType}`, { requestId })

    const job = await this.queue.add(operationType, {
      operationType,
      params,
      requestId,
    })

    const result = await job.waitUntilFinished(this.queueEvents)
    if (!result.success) {
      throw new Error(result.error || 'Unknown error')
    }

    return result.data
  }

  // Deposits
  async createDeposit(deposit: Deposit): Promise<void> {
    return this.addJob(DatabaseOperationType.CREATE_DEPOSIT, { deposit })
  }

  async updateDeposit(
    depositId: string,
    update: Partial<Omit<Deposit, 'deposit_id'>>,
  ): Promise<void> {
    return this.addJob(DatabaseOperationType.UPDATE_DEPOSIT, { depositId, update })
  }

  async getDeposit(depositId: string): Promise<Deposit | null> {
    return this.addJob(DatabaseOperationType.GET_DEPOSIT, { depositId })
  }

  async getDepositsByDelegatee(delegateeAddress: string): Promise<Deposit[]> {
    return this.addJob(DatabaseOperationType.GET_DEPOSITS_BY_DELEGATEE, {
      delegateeAddress,
    })
  }

  async getDepositsByOwner(ownerAddress: string): Promise<Deposit[]> {
    return this.addJob(DatabaseOperationType.GET_DEPOSITS_BY_OWNER, {
      ownerAddress,
    })
  }

  async getDepositsByDepositor(depositorAddress: string): Promise<Deposit[]> {
    return this.addJob(DatabaseOperationType.GET_DEPOSITS_BY_DEPOSITOR, {
      depositorAddress,
    })
  }

  async getAllDeposits(): Promise<Deposit[]> {
    return this.addJob(DatabaseOperationType.GET_ALL_DEPOSITS, {})
  }

  // Checkpoints
  async updateCheckpoint(checkpoint: ProcessingCheckpoint): Promise<void> {
    return this.addJob(DatabaseOperationType.UPDATE_CHECKPOINT, { checkpoint })
  }

  async getCheckpoint(componentType: string): Promise<ProcessingCheckpoint | null> {
    return this.addJob(DatabaseOperationType.GET_CHECKPOINT, { componentType })
  }

  // Processing Queue
  async createProcessingQueueItem(
    item: Omit<
      ProcessingQueueItem,
      'id' | 'created_at' | 'updated_at' | 'attempts'
    >,
  ): Promise<ProcessingQueueItem> {
    return this.addJob(DatabaseOperationType.CREATE_PROCESSING_QUEUE_ITEM, {
      item,
    })
  }

  async updateProcessingQueueItem(
    id: string,
    update: Partial<
      Omit<ProcessingQueueItem, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void> {
    return this.addJob(DatabaseOperationType.UPDATE_PROCESSING_QUEUE_ITEM, {
      id,
      update,
    })
  }

  async getProcessingQueueItem(id: string): Promise<ProcessingQueueItem | null> {
    return this.addJob(DatabaseOperationType.GET_PROCESSING_QUEUE_ITEM, { id })
  }

  async getProcessingQueueItemsByStatus(
    status: ProcessingQueueStatus,
  ): Promise<ProcessingQueueItem[]> {
    return this.addJob(DatabaseOperationType.GET_PROCESSING_QUEUE_ITEMS_BY_STATUS, {
      status,
    })
  }

  async getProcessingQueueItemByDepositId(
    depositId: string,
  ): Promise<ProcessingQueueItem | null> {
    return this.addJob(
      DatabaseOperationType.GET_PROCESSING_QUEUE_ITEM_BY_DEPOSIT_ID,
      { depositId },
    )
  }

  async getProcessingQueueItemsByDelegatee(
    delegatee: string,
  ): Promise<ProcessingQueueItem[]> {
    return this.addJob(
      DatabaseOperationType.GET_PROCESSING_QUEUE_ITEMS_BY_DELEGATEE,
      { delegatee },
    )
  }

  async deleteProcessingQueueItem(id: string): Promise<void> {
    return this.addJob(DatabaseOperationType.DELETE_PROCESSING_QUEUE_ITEM, { id })
  }

  // Transaction Queue
  async createTransactionQueueItem(
    item: Omit<
      TransactionQueueItem,
      'id' | 'created_at' | 'updated_at' | 'attempts'
    >,
  ): Promise<TransactionQueueItem> {
    return this.addJob(DatabaseOperationType.CREATE_TRANSACTION_QUEUE_ITEM, {
      item,
    })
  }

  async updateTransactionQueueItem(
    id: string,
    update: Partial<
      Omit<TransactionQueueItem, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void> {
    return this.addJob(DatabaseOperationType.UPDATE_TRANSACTION_QUEUE_ITEM, {
      id,
      update,
    })
  }

  async getTransactionQueueItem(id: string): Promise<TransactionQueueItem | null> {
    return this.addJob(DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEM, { id })
  }

  async getTransactionQueueItemsByStatus(
    status: TransactionQueueStatus,
  ): Promise<TransactionQueueItem[]> {
    return this.addJob(
      DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEMS_BY_STATUS,
      { status },
    )
  }

  async getTransactionQueueItemByDepositId(
    depositId: string,
  ): Promise<TransactionQueueItem | null> {
    return this.addJob(
      DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEM_BY_DEPOSIT_ID,
      { depositId },
    )
  }

  async getTransactionQueueItemsByHash(
    hash: string,
  ): Promise<TransactionQueueItem[]> {
    return this.addJob(DatabaseOperationType.GET_TRANSACTION_QUEUE_ITEMS_BY_HASH, {
      hash,
    })
  }

  async deleteTransactionQueueItem(id: string): Promise<void> {
    return this.addJob(DatabaseOperationType.DELETE_TRANSACTION_QUEUE_ITEM, { id })
  }

  // GovLst Deposits
  async createGovLstDeposit(deposit: GovLstDeposit): Promise<void> {
    return this.addJob(DatabaseOperationType.CREATE_GOVLST_DEPOSIT, { deposit })
  }

  async updateGovLstDeposit(
    depositId: string,
    update: Partial<Omit<GovLstDeposit, 'deposit_id'>>,
  ): Promise<void> {
    return this.addJob(DatabaseOperationType.UPDATE_GOVLST_DEPOSIT, {
      depositId,
      update,
    })
  }

  async getGovLstDeposit(depositId: string): Promise<GovLstDeposit | null> {
    return this.addJob(DatabaseOperationType.GET_GOVLST_DEPOSIT, { depositId })
  }

  async getGovLstDepositsByAddress(
    govLstAddress: string,
  ): Promise<GovLstDeposit[]> {
    return this.addJob(DatabaseOperationType.GET_GOVLST_DEPOSITS_BY_ADDRESS, {
      govLstAddress,
    })
  }

  async getAllGovLstDeposits(): Promise<GovLstDeposit[]> {
    return this.addJob(DatabaseOperationType.GET_ALL_GOVLST_DEPOSITS, {})
  }

  // GovLst Claim History
  async createGovLstClaimHistory(
    claim: GovLstClaimHistory,
  ): Promise<GovLstClaimHistory> {
    return this.addJob(DatabaseOperationType.CREATE_GOVLST_CLAIM_HISTORY, {
      claim,
    })
  }

  async getGovLstClaimHistory(id: string): Promise<GovLstClaimHistory | null> {
    return this.addJob(DatabaseOperationType.GET_GOVLST_CLAIM_HISTORY, { id })
  }

  async getGovLstClaimHistoryByAddress(
    govLstAddress: string,
  ): Promise<GovLstClaimHistory[]> {
    return this.addJob(
      DatabaseOperationType.GET_GOVLST_CLAIM_HISTORY_BY_ADDRESS,
      { govLstAddress },
    )
  }

  async updateGovLstClaimHistory(
    id: string,
    update: Partial<
      Omit<GovLstClaimHistory, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void> {
    return this.addJob(DatabaseOperationType.UPDATE_GOVLST_CLAIM_HISTORY, {
      id,
      update,
    })
  }
}
