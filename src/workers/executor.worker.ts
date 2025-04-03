import { Worker, QueueEvents, Job } from 'bullmq'
import { ethers } from 'ethers'
import {
  ExecutorJobData,
  ExecutorJobResult,
  ExecutorConfig,
  TransactionResult,
  TransactionStatus,
  EXECUTOR_JOB_OPTIONS
} from '../types/executor'
import { RewardData } from '../types/reward-check'
import { TransactionType, TransactionRequest, WithdrawData, UpdateDelegateeData } from '../types/transactions'
import { WorkerMetrics, WorkerMetricsData } from '../utils/metrics'
import { QUEUE_NAMES } from '../lib/queue-definitions'
import { IExecutor } from 'modules/executor'
import { ExecutorWrapper, ExecutorType } from 'modules/executor'

export class ExecutorWorker {
  private worker: Worker<ExecutorJobData, ExecutorJobResult>
  private metrics: WorkerMetrics
  private queueEvents: QueueEvents
  private contract: ethers.Contract
  private nonce: number
  private executor: IExecutor

  constructor(private readonly config: ExecutorConfig) {
    this.metrics = new WorkerMetrics('executor-worker')
    this.contract = new ethers.Contract(
      config.contractAddress,
      config.contractAbi,
      config.wallet
    )
    this.nonce = 0

    // Initialize executor
    const executorWrapper = new ExecutorWrapper(
      this.contract,
      config.provider,
      ExecutorType.WALLET,
      {
        wallet: {
          privateKey: config.wallet.privateKey,
          minBalance: ethers.parseEther('0.01'),
          maxPendingTransactions: 5
        }
      }
    )
    this.executor = executorWrapper.getExecutor()

    // Create worker
    this.worker = new Worker<ExecutorJobData, ExecutorJobResult>(
      QUEUE_NAMES.TRANSACTION_EXECUTION,
      this.processExecution.bind(this),
      {
        connection: config.connection,
        concurrency: config.concurrency || 1, // Default to 1 for nonce management
        lockDuration: 60000 // 60 seconds
      }
    )

    // Create queue events listener
    this.queueEvents = new QueueEvents(QUEUE_NAMES.TRANSACTION_EXECUTION, {
      connection: config.connection
    })

    this.setupEventListeners()
  }

  private setupEventListeners(): void {
    this.worker.on('completed', job => {
      const processingTime = Date.now() - job.timestamp
      this.metrics.recordSuccess(processingTime)
    })

    this.worker.on('failed', (job, error) => {
      if (job) {
        const processingTime = Date.now() - job.timestamp
        this.metrics.recordFailure(processingTime)
      }
      console.error(`Job ${job?.id} failed:`, error)
    })

    this.queueEvents.on('waiting', ({ jobId }) => {
      console.log(`Job ${jobId} is waiting to be processed`)
    })

    this.queueEvents.on('active', ({ jobId, prev }) => {
      console.log(`Job ${jobId} is now active; previous state was ${prev}`)
    })
  }

  private async processExecution(
    job: Job<ExecutorJobData, ExecutorJobResult>
  ): Promise<ExecutorJobResult> {
    const { type = TransactionType.CLAIM_REWARDS, data, batchId, timestamp, maxGasPrice } = job.data

    try {
      // Initialize nonce if not set
      if (this.nonce === 0) {
        this.nonce = await this.config.wallet.getNonce()
      }

      // Process transactions in smaller batches if needed
      const maxBatchSize = this.config.maxBatchSize || 50
      const transactionResults: TransactionResult[] = []

      switch (type) {
        case TransactionType.CLAIM_REWARDS: {
          const rewards = data as RewardData[]
          for (let i = 0; i < rewards.length; i += maxBatchSize) {
            const batchRewards = rewards.slice(i, i + maxBatchSize)
            const depositIds = batchRewards.map((r: RewardData) => r.depositId)

            const txRequest = await this.prepareTxRequest({
              type,
              depositIds,
              nonce: this.nonce
            }, maxGasPrice)

            const result = await this.executeTransaction(txRequest)
            transactionResults.push(result)

            if (result.status === TransactionStatus.CONFIRMED) {
              this.nonce++
            }
          }
          break
        }

        case TransactionType.WITHDRAW: {
          const withdrawData = data as WithdrawData
          const txRequest = await this.prepareTxRequest({
            type,
            depositId: withdrawData.depositId,
            amount: withdrawData.amount,
            nonce: this.nonce
          }, maxGasPrice)

          const result = await this.executeTransaction(txRequest)
          transactionResults.push(result)

          if (result.status === TransactionStatus.CONFIRMED) {
            this.nonce++
          }
          break
        }

        case TransactionType.UPDATE_DELEGATEE: {
          const delegateeData = data as UpdateDelegateeData
          const txRequest = await this.prepareTxRequest({
            type,
            depositId: delegateeData.depositId,
            newDelegatee: delegateeData.newDelegatee,
            nonce: this.nonce
          }, maxGasPrice)

          const result = await this.executeTransaction(txRequest)
          transactionResults.push(result)

          if (result.status === TransactionStatus.CONFIRMED) {
            this.nonce++
          }
          break
        }

        default:
          throw new Error(`Unsupported transaction type: ${type}`)
      }

      // Queue results for processing
      await this.queueResults(transactionResults, batchId)

      const success = transactionResults.every(
        r => r.status === TransactionStatus.CONFIRMED
      )

      return {
        success,
        error: success ? undefined : 'Some transactions failed',
        transactions: transactionResults,
        batchId,
        timestamp
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        transactions: [],
        batchId,
        timestamp
      }
    }
  }

  private async prepareTxRequest(
    request: TransactionRequest,
    maxGasPrice?: string
  ): Promise<TransactionRequest> {
    let gasLimit: bigint

    // Estimate gas based on transaction type
    switch (request.type) {
      case TransactionType.CLAIM_REWARDS:
        if (typeof this.contract.claimRewards?.estimateGas !== 'function') {
          throw new Error('claimRewards.estimateGas function not found on contract')
        }
        gasLimit = await this.contract.claimRewards.estimateGas(request.depositIds)
        break
      case TransactionType.WITHDRAW:
        if (typeof this.contract.withdraw?.estimateGas !== 'function') {
          throw new Error('withdraw.estimateGas function not found on contract')
        }
        gasLimit = await this.contract.withdraw.estimateGas(request.depositId, request.amount)
        break
      case TransactionType.UPDATE_DELEGATEE:
        if (typeof this.contract.updateDelegatee?.estimateGas !== 'function') {
          throw new Error('updateDelegatee.estimateGas function not found on contract')
        }
        gasLimit = await this.contract.updateDelegatee.estimateGas(request.depositId, request.newDelegatee)
        break
      default:
        throw new Error(`Unsupported transaction type: ${request.type}`)
    }

    // Apply gas limit multiplier for safety
    const adjustedGasLimit = ethers.toBigInt(
      Math.ceil(
        Number(gasLimit) * (this.config.gasLimitMultiplier || 1.1)
      )
    )

    // Get current fee data
    const feeData = await this.config.provider.getFeeData()

    // Check if gas price is within limits
    const maxAllowedGasPrice = maxGasPrice
      ? ethers.toBigInt(maxGasPrice)
      : this.config.maxGasPrice
        ? ethers.toBigInt(this.config.maxGasPrice)
        : undefined

    if (
      maxAllowedGasPrice &&
      feeData.maxFeePerGas &&
      feeData.maxFeePerGas > maxAllowedGasPrice
    ) {
      throw new Error('Gas price too high')
    }

    return {
      ...request,
      nonce: request.nonce,
      maxFeePerGas: feeData.maxFeePerGas?.toString(),
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
      gasLimit: adjustedGasLimit.toString()
    }
  }

  private async executeTransaction(
    request: TransactionRequest
  ): Promise<TransactionResult> {
    // Create the appropriate result type based on the request
    const result: TransactionResult = {
      depositIds: request.depositIds || [request.depositId!],
      status: TransactionStatus.PENDING,
      timestamp: Date.now()
    }

    try {
      // Send transaction based on type
      let tx: ethers.ContractTransactionResponse
      const txOptions = {
        nonce: request.nonce,
        maxFeePerGas: request.maxFeePerGas
          ? ethers.toBigInt(request.maxFeePerGas)
          : undefined,
        maxPriorityFeePerGas: request.maxPriorityFeePerGas
          ? ethers.toBigInt(request.maxPriorityFeePerGas)
          : undefined,
        gasLimit: request.gasLimit
          ? ethers.toBigInt(request.gasLimit)
          : undefined
      }

      switch (request.type) {
        case TransactionType.CLAIM_REWARDS:
          if (!request.depositIds) throw new Error('depositIds required for CLAIM_REWARDS')
          if (typeof this.contract.claimRewards !== 'function') {
            throw new Error('claimRewards function not found on contract')
          }
          tx = await this.contract.claimRewards(request.depositIds, txOptions)
          break
        case TransactionType.WITHDRAW:
          if (!request.depositId || !request.amount) throw new Error('depositId and amount required for WITHDRAW')
          if (typeof this.contract.withdraw !== 'function') {
            throw new Error('withdraw function not found on contract')
          }
          tx = await this.contract.withdraw(request.depositId, request.amount, txOptions)
          break
        case TransactionType.UPDATE_DELEGATEE:
          if (!request.depositId || !request.newDelegatee) throw new Error('depositId and newDelegatee required for UPDATE_DELEGATEE')
          if (typeof this.contract.updateDelegatee !== 'function') {
            throw new Error('updateDelegatee function not found on contract')
          }
          tx = await this.contract.updateDelegatee(request.depositId, request.newDelegatee, txOptions)
          break
        default:
          throw new Error(`Unsupported transaction type: ${request.type}`)
      }

      result.transactionHash = tx.hash

      // Wait for confirmations
      const receipt = await tx.wait(this.config.minConfirmations || 1)
      if (!receipt) throw new Error('No transaction receipt received')

      result.status = TransactionStatus.CONFIRMED
      result.gasUsed = receipt.gasUsed?.toString()

      // Get gas price from receipt
      const gasPrice = receipt.gasPrice
      if (gasPrice) {
        result.effectiveGasPrice = gasPrice.toString()
        if (receipt.gasUsed) {
          result.totalCost = (receipt.gasUsed * gasPrice).toString()
        }
      }

      result.blockNumber = receipt.blockNumber
    } catch (error) {
      result.status = TransactionStatus.FAILED
      result.error = error instanceof Error ? error.message : 'Unknown error'
    }

    return result
  }

  private async queueResults(
    results: TransactionResult[],
    batchId: string
  ): Promise<void> {
    await this.config.resultQueue.add(
      'process-results',
      {
        results,
        batchId,
        timestamp: Date.now()
      },
      {
        ...EXECUTOR_JOB_OPTIONS,
        jobId: `results-${batchId}`
      }
    )
  }

  public getExecutor(): IExecutor {
    return this.executor
  }

  public async start(): Promise<void> {
    // Worker is automatically started on creation
    // Initialize nonce
    this.nonce = await this.config.wallet.getNonce()
  }

  public async stop(): Promise<void> {
    await this.worker.close()
    await this.queueEvents.close()
  }

  public getMetrics(): WorkerMetricsData {
    return this.metrics.getMetrics()
  }
}
