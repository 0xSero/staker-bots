/**
 * Database interface for all database implementations
 */

import { BigNumberish } from 'ethers'

export interface DatabaseRecord {
  id: string
  [key: string]: any
}

export interface BotStatusRecord extends DatabaseRecord {
  botType: string
  chain: string
  lastRunTimestamp: number
  isRunning: boolean
  status: Record<string, any>
}

export interface TransactionRecord extends DatabaseRecord {
  hash?: string
  status: 'queued' | 'sent' | 'confirmed' | 'failed'
  timestamp: number
  data: string
  to: string
  value?: string
  gasLimit?: string
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  chain: string
  botType: string
  error?: string
  receipt?: Record<string, any>
  metadata?: Record<string, any>
}

export interface ProfitabilityRecord extends DatabaseRecord {
  timestamp: number
  chain: string
  botType: string
  target: string
  type: string
  estimatedProfit: string
  estimatedGasCost: string
  estimatedNetProfit: string
  executed: boolean
  transactionId?: string
  metadata?: Record<string, any>
}

export interface ProcessingCheckpoint {
  component_type: string
  last_block_number: number
  block_hash: string
  last_update: string
}

export interface Deposit {
  deposit_id: string
  owner_address: string
  depositor_address: string
  delegatee_address: string
  amount: string
  earning_power?: string
  created_at: string
  updated_at: string
}

export interface BotStatus {
  id: string
  botType: string
  chain: string
  lastRunTimestamp: number
  isRunning: boolean
  status: {
    lastProcessedBlock?: number
    eventsProcessed?: number
    deposits?: Record<string, Deposit>
    recentEvents?: Array<{
      type: string
      timestamp: number
      [key: string]: any
    }>
  }
}

export interface DatabaseConnection {
  /**
   * Connect to the database
   */
  connect(): Promise<void>
  
  /**
   * Disconnect from the database
   */
  disconnect(): Promise<void>
  
  /**
   * Get database status
   */
  getStatus(): Promise<{
    isConnected: boolean
    lastConnectionTimestamp?: number
    error?: string
  }>
}

export interface Database extends DatabaseConnection {
  /**
   * Save bot status
   */
  saveBotStatus(status: BotStatusRecord): Promise<BotStatusRecord>
  
  /**
   * Get bot status
   */
  getBotStatus(botType: string, chain: string): Promise<BotStatusRecord | null>
  
  /**
   * Save transaction
   */
  saveTransaction(tx: TransactionRecord): Promise<TransactionRecord>
  
  /**
   * Update transaction
   */
  updateTransaction(id: string, update: Partial<TransactionRecord>): Promise<TransactionRecord>
  
  /**
   * Get transaction by ID
   */
  getTransaction(id: string): Promise<TransactionRecord | null>
  
  /**
   * Get transaction by hash
   */
  getTransactionByHash(hash: string): Promise<TransactionRecord | null>
  
  /**
   * Get pending transactions
   */
  getPendingTransactions(botType: string, chain: string): Promise<TransactionRecord[]>
  
  /**
   * Save profitability record
   */
  saveProfitability(record: ProfitabilityRecord): Promise<ProfitabilityRecord>
  
  /**
   * Get recent profitability records
   */
  getRecentProfitability(
    botType: string,
    chain: string,
    limit: number
  ): Promise<ProfitabilityRecord[]>
  
  /**
   * Mark profitability record as executed
   */
  markProfitabilityExecuted(
    id: string,
    transactionId: string
  ): Promise<ProfitabilityRecord>

  // Checkpoint operations
  getCheckpoint(componentType: string): Promise<ProcessingCheckpoint | null>
  updateCheckpoint(checkpoint: ProcessingCheckpoint): Promise<void>
  
  // Deposit operations
  getDeposit(depositId: string): Promise<Deposit | null>
  createDeposit(deposit: Deposit): Promise<void>
  updateDeposit(depositId: string, update: Partial<Deposit>): Promise<void>
  getAllDeposits(): Promise<Deposit[]>
  
  // Bot status operations
  getBotStatus(botType: string, chain: string): Promise<BotStatus | null>
  saveBotStatus(status: BotStatus): Promise<void>
  
  // Transaction operations
  getFailedTransactions(): Promise<TransactionRecord[]>
  getConfirmedTransactions(): Promise<TransactionRecord[]>
  getTransactionsByStatus(status: 'pending' | 'confirmed' | 'failed'): Promise<TransactionRecord[]>
  deleteTransaction(id: string): Promise<void>
} 