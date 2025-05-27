import { GovLstProfitabilityCheck } from '@/profitability/interfaces/types';
import { ErrorLogger } from '@/configuration/errorLogger';
import { ethers } from 'ethers';

export interface WalletConfig {
  privateKey: string;
  minBalance: bigint;
  maxPendingTransactions: number;
}

// OpenZeppelin Defender Relayer configuration
export interface RelayerConfig {
  apiKey: string;
  apiSecret: string;
  address: string;
  minBalance: bigint;
  maxPendingTransactions: number;
  gasPolicy?: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
}

export interface QueuedTransaction {
  id: string;
  depositIds: bigint[];
  profitability: GovLstProfitabilityCheck;
  status: TransactionStatus;
  createdAt: Date;
  executedAt?: Date;
  hash?: string;
  gasPrice?: bigint;
  gasLimit?: bigint;
  error?: Error;
  tx_data?: string;
  metadata?: {
    queueItemId?: string;
    depositIds?: string[];
    [key: string]: string | string[] | undefined;
  };
}

export enum TransactionStatus {
  QUEUED = 'QUEUED',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
  REPLACED = 'REPLACED',
}

export interface ExecutorConfig {
  wallet: {
    privateKey: string;
    minBalance: bigint;
    maxPendingTransactions: number;
  };
  gasPolicy?: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
  maxQueueSize: number;
  minConfirmations: number;
  maxRetries: number;
  retryDelayMs: number;
  transferOutThreshold: bigint;
  gasBoostPercentage: number;
  concurrentTransactions: number;
  defaultTipReceiver: string;
  minProfitMargin: number;
  staleTransactionThresholdMinutes?: number;
  // Flashbots configuration
  flashbots?: {
    enabled: boolean;
    authKey?: string; // Optional auth key for Flashbots reputation
    relayUrl?: string; // Custom relay URL
    mode?: 'normal' | 'fast'; // Transaction mode
    maxBlockNumber?: number; // Max blocks to wait
  };
}

export interface RelayerExecutorConfig {
  apiKey: string;
  apiSecret: string;
  address: string;
  minBalance: bigint;
  maxPendingTransactions: number;
  gasPolicy?: {
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  };
  maxQueueSize: number;
  minConfirmations: number;
  maxRetries: number;
  retryDelayMs: number;
  transferOutThreshold: bigint;
  gasBoostPercentage: number;
  concurrentTransactions: number;
  defaultTipReceiver: string;
  minProfitMargin: number;
  staleTransactionThresholdMinutes?: number;
  isPrivate?: boolean;
}

export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  gasUsed: bigint;
  gasPrice: bigint;
  status: number;
  logs: Array<{
    address: string;
    topics: Array<string>;
    data: string;
  }>;
}

export interface QueueStats {
  totalQueued: number;
  totalPending: number;
  totalConfirmed: number;
  totalFailed: number;
  averageGasPrice: bigint;
  averageGasLimit: bigint;
  totalProfits: bigint;
}

export interface GovLstExecutorError extends Error {
  context?: Record<string, unknown>;
}

// Type guard for GovLstExecutorError
export function isGovLstExecutorError(
  error: unknown,
): error is GovLstExecutorError {
  return error instanceof Error && 'context' in error;
}

// Type for ethers.js v6 TransactionReceipt
export interface EthersTransactionReceipt {
  to: string;
  from: string;
  contractAddress: string | null;
  transactionIndex: number;
  gasUsed: bigint;
  logsBloom: string;
  blockHash: string;
  transactionHash: string;
  logs: Array<{
    transactionIndex: number;
    blockNumber: number;
    transactionHash: string;
    address: string;
    topics: Array<string>;
    data: string;
    logIndex: number;
    blockHash: string;
    removed: boolean;
  }>;
  blockNumber: number;
  confirmations: number;
  cumulativeGasUsed: bigint;
  effectiveGasPrice: bigint;
  status: number;
  type: number;
  byzantium: boolean;
}

// Add Defender API error interfaces
export interface DefenderErrorResponse {
  status: number;
  statusText: string;
  data: {
    error?: {
      code: string;
      message: string;
      suggestedNonce?: number;
      suggestedGasLimit?: string;
    };
  };
}

export interface DefenderErrorConfig {
  method?: string;
  url?: string;
  data?: unknown;
}

export interface DefenderError extends Error {
  response?: DefenderErrorResponse;
  config?: DefenderErrorConfig;
}

// Add gas estimation error interface
export interface GasEstimationError extends Error {
  data?: unknown;
}

export enum ExecutorType {
  WALLET = 'wallet',
  DEFENDER = 'defender',
}

// Extended executor config with error logger - single source of truth
export interface ExtendedExecutorConfig extends Omit<ExecutorConfig, 'wallet'> {
  errorLogger?: ErrorLogger;
  wallet: {
    privateKey: string;
    minBalance: bigint;
    maxPendingTransactions: number;
  };
}

export type DefenderTransactionRequest = ethers.TransactionRequest & {
  isPrivate?: boolean;
  flashbots?: 'normal' | 'fast';
};

export interface RelayerTransactionState {
  id: string;
  transactionId?: string;
  hash?: string;
  submittedAt: number;
  lastChecked: number;
  retryCount: number;
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
}

// Add similar transaction state for BaseExecutor
export interface BaseTransactionState {
  id: string;
  hash?: string;
  submittedAt: number;
  lastChecked: number;
  retryCount: number;
  gasLimit: bigint;
  gasPrice?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  isFlashbots?: boolean;
}

// Flashbots transaction options
export interface FlashbotsTransactionOptions {
  maxBlockNumber?: number;
  minTimestamp?: number;
  maxTimestamp?: number;
  revertingTxHashes?: string[];
}

// Enhanced transaction request for Flashbots
export interface FlashbotsTransactionRequest extends ethers.TransactionRequest {
  isFlashbots?: boolean;
  flashbotsOptions?: FlashbotsTransactionOptions;
}
