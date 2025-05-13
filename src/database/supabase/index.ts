import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database, ProcessingCheckpoint, Deposit, BotStatus, TransactionRecord } from '../../common/database/interfaces/database'
import { DatabaseError } from '../../common/database/factory'

export class SupabaseDatabase implements Database {
  private client: SupabaseClient

  constructor(connectionString: string) {
    const [url, key] = connectionString.split('|')
    if (!url || !key) {
      throw new DatabaseError('Invalid Supabase connection string format. Expected format: "url|key"')
    }
    this.client = createClient(url, key)
  }

  async connect(): Promise<void> {
    try {
      const { error } = await this.client.auth.getSession()
      if (error) {
        throw error
      }
    } catch (error) {
      throw new DatabaseError(`Failed to connect to Supabase: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.auth.signOut()
    } catch (error) {
      throw new DatabaseError(`Failed to disconnect from Supabase: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getCheckpoint(componentType: string): Promise<ProcessingCheckpoint | null> {
    try {
      const { data, error } = await this.client
        .from('checkpoints')
        .select('*')
        .eq('component_type', componentType)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to get checkpoint: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async updateCheckpoint(checkpoint: ProcessingCheckpoint): Promise<void> {
    try {
      const { error } = await this.client
        .from('checkpoints')
        .upsert(checkpoint)

      if (error) throw error
    } catch (error) {
      throw new DatabaseError(`Failed to update checkpoint: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getDeposit(depositId: string): Promise<Deposit | null> {
    try {
      const { data, error } = await this.client
        .from('deposits')
        .select('*')
        .eq('deposit_id', depositId)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to get deposit: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async createDeposit(deposit: Deposit): Promise<void> {
    try {
      const { error } = await this.client
        .from('deposits')
        .insert(deposit)

      if (error) throw error
    } catch (error) {
      throw new DatabaseError(`Failed to create deposit: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async updateDeposit(depositId: string, update: Partial<Deposit>): Promise<void> {
    try {
      const { error } = await this.client
        .from('deposits')
        .update(update)
        .eq('deposit_id', depositId)

      if (error) throw error
    } catch (error) {
      throw new DatabaseError(`Failed to update deposit: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getAllDeposits(): Promise<Deposit[]> {
    try {
      const { data, error } = await this.client
        .from('deposits')
        .select('*')

      if (error) throw error
      return data || []
    } catch (error) {
      throw new DatabaseError(`Failed to get all deposits: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getBotStatus(botType: string, chain: string): Promise<BotStatus | null> {
    try {
      const { data, error } = await this.client
        .from('bot_status')
        .select('*')
        .eq('botType', botType)
        .eq('chain', chain)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to get bot status: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async saveBotStatus(status: BotStatus): Promise<void> {
    try {
      const { error } = await this.client
        .from('bot_status')
        .upsert(status)

      if (error) throw error
    } catch (error) {
      throw new DatabaseError(`Failed to save bot status: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async saveTransaction(tx: TransactionRecord): Promise<TransactionRecord> {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .upsert(tx)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to save transaction: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async updateTransaction(id: string, update: Partial<TransactionRecord>): Promise<TransactionRecord> {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .update(update)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to update transaction: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getTransaction(id: string): Promise<TransactionRecord | null> {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to get transaction: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async getTransactionByHash(hash: string): Promise<TransactionRecord | null> {
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .eq('hash', hash)
        .single()

      if (error) throw error
      return data
    } catch (error) {
      throw new DatabaseError(`Failed to get transaction by hash: ${error instanceof Error ? error.message : String(error)}`)
    }
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
    try {
      const { data, error } = await this.client
        .from('transactions')
        .select('*')
        .eq('status', status)

      if (error) throw error
      return data || []
    } catch (error) {
      throw new DatabaseError(`Failed to get transactions by status: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async deleteTransaction(id: string): Promise<void> {
    try {
      const { error } = await this.client
        .from('transactions')
        .delete()
        .eq('id', id)

      if (error) throw error
    } catch (error) {
      throw new DatabaseError(`Failed to delete transaction: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 