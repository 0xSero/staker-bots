import fs from 'fs'
import { Database, ProcessingCheckpoint, Deposit, BotStatus, TransactionRecord } from '../../common/database/interfaces/database'
import { DatabaseError } from '../../common/database/factory'

export class JsonDatabase implements Database {
  private data: {
    checkpoints: Record<string, ProcessingCheckpoint>
    deposits: Record<string, Deposit>
    botStatus: Record<string, BotStatus>
    transactions: Record<string, TransactionRecord>
  }

  constructor(private readonly filePath: string) {
    this.data = {
      checkpoints: {},
      deposits: {},
      botStatus: {},
      transactions: {},
    }
    this.loadData()
  }

  private loadData(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const fileContent = fs.readFileSync(this.filePath, 'utf-8')
        this.data = JSON.parse(fileContent)
      }
    } catch (error) {
      throw new DatabaseError(`Failed to load database file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private saveData(): void {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
    } catch (error) {
      throw new DatabaseError(`Failed to save database file: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async connect(): Promise<void> {
    // No-op for JSON database
  }

  async disconnect(): Promise<void> {
    // No-op for JSON database
  }

  async getCheckpoint(componentType: string): Promise<ProcessingCheckpoint | null> {
    return this.data.checkpoints[componentType] || null
  }

  async updateCheckpoint(checkpoint: ProcessingCheckpoint): Promise<void> {
    this.data.checkpoints[checkpoint.component_type] = checkpoint
    this.saveData()
  }

  async getDeposit(depositId: string): Promise<Deposit | null> {
    return this.data.deposits[depositId] || null
  }

  async createDeposit(deposit: Deposit): Promise<void> {
    this.data.deposits[deposit.deposit_id] = deposit
    this.saveData()
  }

  async updateDeposit(depositId: string, update: Partial<Deposit>): Promise<void> {
    const deposit = this.data.deposits[depositId]
    if (!deposit) {
      throw new DatabaseError(`Deposit not found: ${depositId}`)
    }
    this.data.deposits[depositId] = { ...deposit, ...update }
    this.saveData()
  }

  async getAllDeposits(): Promise<Deposit[]> {
    return Object.values(this.data.deposits)
  }

  async getBotStatus(botType: string, chain: string): Promise<BotStatus | null> {
    const key = `${botType}-${chain}`
    return this.data.botStatus[key] || null
  }

  async saveBotStatus(status: BotStatus): Promise<BotStatus> {
    const key = `${status.botType}-${status.chain}`
    this.data.botStatus[key] = status
    this.saveData()
    return status
  }

  async saveTransaction(tx: TransactionRecord): Promise<TransactionRecord> {
    this.data.transactions[tx.id] = tx
    this.saveData()
    return tx
  }

  async updateTransaction(id: string, update: Partial<TransactionRecord>): Promise<TransactionRecord> {
    const tx = this.data.transactions[id]
    if (!tx) {
      throw new DatabaseError(`Transaction not found: ${id}`)
    }
    const updatedTx = { ...tx, ...update }
    this.data.transactions[id] = updatedTx
    this.saveData()
    return updatedTx
  }

  async getTransaction(id: string): Promise<TransactionRecord | null> {
    return this.data.transactions[id] || null
  }

  async getTransactionByHash(hash: string): Promise<TransactionRecord | null> {
    return Object.values(this.data.transactions).find(tx => tx.hash === hash) || null
  }

  async getPendingTransactions(): Promise<TransactionRecord[]> {
    return this.getTransactionsByStatus('pending')
  }

  async getFailedTransactions(): Promise<TransactionRecord[]> {
    return this.getTransactionsByStatus('failed')
  }

  async getConfirmedTransactions(): Promise<TransactionRecord[]> {
    return this.getTransactionsByStatus('confirmed')
  }

  async getTransactionsByStatus(status: 'pending' | 'confirmed' | 'failed'): Promise<TransactionRecord[]> {
    return Object.values(this.data.transactions).filter(tx => tx.status === status)
  }

  async deleteTransaction(id: string): Promise<void> {
    delete this.data.transactions[id]
    this.saveData()
  }
} 