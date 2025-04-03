import { Queue, ConnectionOptions } from 'bullmq'
import { v4 as uuidv4 } from 'uuid'
import { ethers } from 'ethers'
import {
  DepositScanJobData,
  DepositScanJobResult,
  DepositScanType,
  DEPOSIT_SCAN_JOB_OPTIONS,
  DepositScanSchedulerConfig
} from '../types/deposit-scan'
import { QUEUE_NAMES } from '@/lib/queue-definitions'
import { DatabaseClient } from '../clients/database.client'

export class DepositScanScheduler {
  private depositScanQueue: Queue<DepositScanJobData, DepositScanJobResult>
  private isRunning: boolean = false
  private lastProcessedBlock: number = 0
  private readonly COMPONENT_TYPE = 'deposit-scanner'
  private scanInterval: NodeJS.Timeout | null = null

  constructor(
    private readonly connection: ConnectionOptions,
    private readonly databaseClient: DatabaseClient,
    private readonly provider: ethers.Provider,
    private readonly config: DepositScanSchedulerConfig
  ) {
    // Create queue
    this.depositScanQueue = new Queue<DepositScanJobData, DepositScanJobResult>(
      QUEUE_NAMES.DEPOSIT_SCAN,
      {
        connection,
        defaultJobOptions: DEPOSIT_SCAN_JOB_OPTIONS
      }
    )
  }

  public async start(): Promise<void> {
    if (this.isRunning || !this.config.enabled) return

    this.isRunning = true

    // Load last processed block from checkpoint
    const checkpoint = await this.databaseClient.getCheckpoint(this.COMPONENT_TYPE)

    if (checkpoint) {
      this.lastProcessedBlock = checkpoint.last_block_number
    }

    // Start scheduling scans
    this.scheduleScan()
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return

    this.isRunning = false
    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }
    await this.depositScanQueue.close()
  }

  private async scheduleScan(): Promise<void> {
    // Initial scan
    await this.performScan()

    // Schedule periodic scans
    this.scanInterval = setInterval(async () => {
      if (!this.isRunning) return
      await this.performScan()
    }, this.config.scanInterval)
  }

  private async performScan(): Promise<void> {
    try {
      const currentBlock = await this.provider.getBlockNumber()
      const confirmedBlock = currentBlock - this.config.requiredConfirmations

      if (confirmedBlock <= this.lastProcessedBlock) {
        return
      }

      const fromBlock = this.lastProcessedBlock + 1
      const toBlock = Math.min(
        fromBlock + this.config.maxBlockRange - 1,
        confirmedBlock
      )

      // Queue deposit scan job
      await this.depositScanQueue.add(
        'scan-deposits',
        {
          scanType: DepositScanType.RANGE,
          fromBlock,
          toBlock,
          timestamp: Date.now(),
          batchId: uuidv4()
        },
        {
          ...DEPOSIT_SCAN_JOB_OPTIONS,
          jobId: `deposit-scan-${fromBlock}-${toBlock}`
        }
      )

      // Update checkpoint
      await this.databaseClient.updateCheckpoint({
        component_type: this.COMPONENT_TYPE,
        last_block_number: toBlock,
        block_hash: (await this.provider.getBlock(toBlock))?.hash || '',
        last_update: new Date().toISOString()
      })

      this.lastProcessedBlock = toBlock
    } catch (error) {
      console.error('Error in deposit scan scheduler:', error)
    }
  }

  public async triggerManualScan(fromBlock: number, toBlock: number): Promise<string> {
    const batchId = uuidv4()

    await this.depositScanQueue.add(
      'scan-deposits',
      {
        scanType: DepositScanType.RANGE,
        fromBlock,
        toBlock,
        timestamp: Date.now(),
        batchId
      },
      {
        ...DEPOSIT_SCAN_JOB_OPTIONS,
        jobId: `manual-scan-${fromBlock}-${toBlock}`
      }
    )

    return batchId
  }

  public async triggerSpecificScan(depositIds: string[]): Promise<string> {
    const batchId = uuidv4()

    await this.depositScanQueue.add(
      'scan-deposits',
      {
        scanType: DepositScanType.SPECIFIC,
        depositIds,
        timestamp: Date.now(),
        batchId
      },
      {
        ...DEPOSIT_SCAN_JOB_OPTIONS,
        jobId: `specific-scan-${batchId}`
      }
    )

    return batchId
  }

  public async triggerFullScan(): Promise<string> {
    const batchId = uuidv4()

    await this.depositScanQueue.add(
      'scan-deposits',
      {
        scanType: DepositScanType.ALL,
        timestamp: Date.now(),
        batchId
      },
      {
        ...DEPOSIT_SCAN_JOB_OPTIONS,
        jobId: `full-scan-${batchId}`
      }
    )

    return batchId
  }
}
