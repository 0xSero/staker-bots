import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { DatabaseWorker } from '@/workers/database.worker'
import { DatabaseClient } from '@/clients/database.client'
import { QueueFactory } from '@/lib/queue-factory'
import { ProcessingQueueStatus } from 'modules/database/interfaces/types'

describe('Database Worker Integration Tests', () => {
  let worker: DatabaseWorker
  let client: DatabaseClient

  beforeAll(async () => {
    // Create and start worker
    worker = new DatabaseWorker({
      connection: QueueFactory.getConnectionOptions(),
      databaseConfig: {
        type: 'json', // Use JSON database for testing
        fallbackToJson: true,
      },
      concurrency: 1,
    })
    await worker.start()

    // Create client
    client = new DatabaseClient()
  })

  afterAll(async () => {
    await worker.stop()
    await QueueFactory.closeAll()
  })

  it('should create and retrieve a deposit', async () => {
    const deposit = {
      deposit_id: '1',
      owner_address: '0x123',
      depositor_address: '0x456',
      delegatee_address: '0x789',
      amount: '1000000000000000000', // 1 ETH
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    // Create deposit
    await client.createDeposit(deposit)

    // Retrieve deposit
    const retrieved = await client.getDeposit('1')
    expect(retrieved).toBeDefined()
    expect(retrieved?.deposit_id).toBe(deposit.deposit_id)
    expect(retrieved?.owner_address).toBe(deposit.owner_address)
    expect(retrieved?.amount).toBe(deposit.amount)
  })

  it('should create and update a processing queue item', async () => {
    const item = {
      deposit_id: '1',
      status: ProcessingQueueStatus.PENDING,
      delegatee: '0x789',
    }

    // Create item
    const created = await client.createProcessingQueueItem(item)
    expect(created).toBeDefined()
    expect(created.deposit_id).toBe(item.deposit_id)
    expect(created.status).toBe(item.status)

    // Update item
    await client.updateProcessingQueueItem(created.id, {
      status: ProcessingQueueStatus.PROCESSING,
    })

    // Retrieve updated item
    const updated = await client.getProcessingQueueItem(created.id)
    expect(updated).toBeDefined()
    expect(updated?.status).toBe(ProcessingQueueStatus.PROCESSING)
  })

  it('should handle errors gracefully', async () => {
    // Try to get non-existent deposit
    const nonExistent = await client.getDeposit('999')
    expect(nonExistent).toBeNull()

    // Try to update non-existent deposit
    await expect(
      client.updateDeposit('999', { amount: '1000000000000000000' }),
    ).rejects.toThrow()
  })

  it('should handle concurrent operations', async () => {
    const deposits = Array.from({ length: 5 }, (_, i) => ({
      deposit_id: `concurrent-${i}`,
      owner_address: '0x123',
      depositor_address: '0x456',
      delegatee_address: '0x789',
      amount: '1000000000000000000',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }))

    // Create deposits concurrently
    await Promise.all(deposits.map(d => client.createDeposit(d)))

    // Retrieve all deposits
    const allDeposits = await client.getAllDeposits()
    expect(allDeposits.length).toBeGreaterThanOrEqual(deposits.length)

    // Verify each deposit exists
    for (const deposit of deposits) {
      const retrieved = await client.getDeposit(deposit.deposit_id)
      expect(retrieved).toBeDefined()
      expect(retrieved?.deposit_id).toBe(deposit.deposit_id)
    }
  })
})
