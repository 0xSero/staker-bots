import {
  Deposit,
  ProcessingCheckpoint,
  ProcessingQueueItem,
  TransactionQueueItem,
  ProcessingQueueStatus,
  TransactionQueueStatus,
  GovLstClaimHistory,
  ErrorLog,
  TransactionDetails,
  TransactionDetailsStatus,
} from './types';

export interface IDatabase {
  // Deposits
  createDeposit(deposit: Deposit): Promise<void>;
  updateDeposit(
    depositId: string,
    update: Partial<Omit<Deposit, 'deposit_id'>>,
  ): Promise<void>;
  getDeposit(depositId: string): Promise<Deposit | null>;
  getDepositsByDelegatee(delegateeAddress: string): Promise<Deposit[]>;
  getDepositsByOwner(ownerAddress: string): Promise<Deposit[]>;
  getDepositsByDepositor(depositorAddress: string): Promise<Deposit[]>;
  getAllDeposits(): Promise<Deposit[]>;
  // Checkpoints
  updateCheckpoint(checkpoint: ProcessingCheckpoint): Promise<void>;
  getCheckpoint(componentType: string): Promise<ProcessingCheckpoint | null>;
  // Processing Queue
  createProcessingQueueItem(
    item: Omit<
      ProcessingQueueItem,
      'id' | 'created_at' | 'updated_at' | 'attempts'
    >,
  ): Promise<ProcessingQueueItem>;
  updateProcessingQueueItem(
    id: string,
    update: Partial<
      Omit<ProcessingQueueItem, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void>;
  getProcessingQueueItem(id: string): Promise<ProcessingQueueItem | null>;
  getProcessingQueueItemsByStatus(
    status: ProcessingQueueStatus,
  ): Promise<ProcessingQueueItem[]>;
  getProcessingQueueItemByDepositId(
    depositId: string,
  ): Promise<ProcessingQueueItem | null>;
  getProcessingQueueItemsByDelegatee(
    delegatee: string,
  ): Promise<ProcessingQueueItem[]>;
  deleteProcessingQueueItem(id: string): Promise<void>;
  // Transaction Queue
  createTransactionQueueItem(
    item: Omit<
      TransactionQueueItem,
      'id' | 'created_at' | 'updated_at' | 'attempts'
    >,
  ): Promise<TransactionQueueItem>;
  updateTransactionQueueItem(
    id: string,
    update: Partial<
      Omit<TransactionQueueItem, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void>;
  getTransactionQueueItem(id: string): Promise<TransactionQueueItem | null>;
  getTransactionQueueItemsByStatus(
    status: TransactionQueueStatus,
  ): Promise<TransactionQueueItem[]>;
  getTransactionQueueItemByDepositId(
    depositId: string,
  ): Promise<TransactionQueueItem | null>;
  getTransactionQueueItemsByHash(hash: string): Promise<TransactionQueueItem[]>;
  deleteTransactionQueueItem(id: string): Promise<void>;

  // Transaction Details
  createTransactionDetails(
    details: Omit<TransactionDetails, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<TransactionDetails>;
  updateTransactionDetails(
    id: string,
    update: Partial<
      Omit<TransactionDetails, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void>;
  getTransactionDetailsByTransactionId(
    transactionId: string,
  ): Promise<TransactionDetails | null>;
  getTransactionDetailsByTransactionHash(
    transactionHash: string,
  ): Promise<TransactionDetails | null>;
  getTransactionDetailsByStatus(
    status: TransactionDetailsStatus,
  ): Promise<TransactionDetails[]>;
  getTransactionDetailsByDepositId(
    depositId: string,
  ): Promise<TransactionDetails[]>;
  getRecentTransactionDetails(
    limit?: number,
    offset?: number,
  ): Promise<TransactionDetails[]>;

  // GovLst Claim History
  createGovLstClaimHistory(
    claim: GovLstClaimHistory,
  ): Promise<GovLstClaimHistory>;
  getGovLstClaimHistory(id: string): Promise<GovLstClaimHistory | null>;
  getGovLstClaimHistoryByAddress(
    govLstAddress: string,
  ): Promise<GovLstClaimHistory[]>;
  updateGovLstClaimHistory(
    id: string,
    update: Partial<
      Omit<GovLstClaimHistory, 'id' | 'created_at' | 'updated_at'>
    >,
  ): Promise<void>;

  // Error Logs
  createErrorLog(errorLog: ErrorLog): Promise<ErrorLog>;
  getErrorLogs(limit?: number, offset?: number): Promise<ErrorLog[]>;
  getErrorLogsByService(
    serviceName: string,
    limit?: number,
    offset?: number,
  ): Promise<ErrorLog[]>;
  getErrorLogsBySeverity(
    severity: string,
    limit?: number,
    offset?: number,
  ): Promise<ErrorLog[]>;
  deleteErrorLog(id: string): Promise<void>;
}
