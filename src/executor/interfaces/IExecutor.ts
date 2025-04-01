import { GovLstProfitabilityCheck } from '@/profitability/interfaces/types';
import { QueuedTransaction, QueueStats, TransactionReceipt } from './types';
import { DatabaseWrapper } from '@/database';

export interface IExecutor {
  /**
   * Start the executor service
   */
  start(): Promise<void>;

  /**
   * Stop the executor service
   */
  stop(): Promise<void>;

  /**
   * Set the database for accessing transaction queue
   */
  setDatabase?(db: DatabaseWrapper): void;

  /**
   * Get the current status of the executor
   */
  getStatus(): Promise<{
    isRunning: boolean;
    walletBalance: bigint;
    pendingTransactions: number;
    queueSize: number;
  }>;

  /**
   * Validate a transaction before queueing
   * Returns true if the transaction is valid, throws TransactionValidationError otherwise
   */
  validateTransaction(
    depositIds: bigint[],
    profitability: GovLstProfitabilityCheck,
  ): Promise<boolean>;

  /**
   * Queue a transaction for execution
   */
  queueTransaction(
    depositIds: bigint[],
    profitability: GovLstProfitabilityCheck,
    txData?: string,
  ): Promise<QueuedTransaction>;

  /**
   * Get statistics about the transaction queue
   */
  getQueueStats(): Promise<QueueStats>;

  /**
   * Get a specific transaction by ID
   */
  getTransaction(id: string): Promise<QueuedTransaction | null>;

  /**
   * Get transaction receipt
   */
  getTransactionReceipt(hash: string): Promise<TransactionReceipt | null>;

  /**
   * Transfer accumulated tips to the configured receiver
   */
  transferOutTips(): Promise<TransactionReceipt | null>;

  /**
   * Clear the transaction queue
   */
  clearQueue(): Promise<void>;
}
