import { EventEmitter } from 'events'
import { ethers } from 'ethers'
import { BaseMonitor, MonitorStatus } from '../../../core/base-monitor'
import { ClaimBotConfig } from '../../../common/config/types'
import { loadConfig } from '../../../common/config/loader'
import { createBotError, ErrorType, ErrorSeverity, ConsoleErrorLogger } from '../../../common/errors'
import { Database } from '../../../common/database/interfaces/database'
import { createDatabase, DatabaseConfig } from '../../../common/database/factory'
import { MONITOR_EVENTS, EVENT_TYPES, PROCESSING_COMPONENT, DEFAULT_DELEGATEE_ADDRESS } from '../../../common/config/constants'
import { stakerAbi } from '../../../configuration/abis'
import {
  StakeDepositedEvent,
  StakeWithdrawnEvent,
  DelegateeAlteredEvent,
  StakedWithAttributionEvent,
  UnstakedEvent,
  DepositInitializedEvent,
  DepositUpdatedEvent,
  ClaimerAlteredEvent,
  RewardClaimedEvent,
  DepositSubsidizedEvent,
  EarningPowerBumpedEvent,
  EventGroup,
  TransactionEntry,
} from '../../../common/types/events'

export default class ArbitrumClaimMonitor extends EventEmitter implements BaseMonitor {
  private config: ClaimBotConfig
  private provider: ethers.Provider
  private contract: ethers.Contract
  private lstContract: ethers.Contract
  private db?: Database
  private logger: ConsoleErrorLogger
  private isRunning: boolean = false
  private processingPromise?: Promise<void>
  private lastProcessedBlock: number
  private eventsProcessed: number = 0
  private errors: Array<{ timestamp: number, message: string }> = []
  private depositScanInProgress: boolean = false

  constructor() {
    super()
    this.config = loadConfig('claim', 'arbitrum') as ClaimBotConfig
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl)
    this.contract = new ethers.Contract(
      this.config.claimContractAddress,
      stakerAbi,
      this.provider
    )
    this.lstContract = new ethers.Contract(
      this.config.lstAddress,
      stakerAbi,
      this.provider
    )
    this.logger = new ConsoleErrorLogger('arbitrum-claim-monitor')
    this.lastProcessedBlock = this.config.startBlock
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      await this.logger.warn('Monitor is already running')
      return
    }

    try {
      // Initialize database connection
      const dbConfig: DatabaseConfig = {
        type: this.config.databaseType,
        connectionString: this.config.dbConnectionString,
        filePath: 'arbitrum-claim-db.json'
      }
      
      this.db = await createDatabase(dbConfig)
      
      // Get checkpoint from database or use configured start block
      const checkpoint = await this.db.getCheckpoint(PROCESSING_COMPONENT.TYPE)
      
      if (checkpoint) {
        this.lastProcessedBlock = checkpoint.last_block_number
      } else {
        this.lastProcessedBlock = this.config.startBlock
        
        // Create initial checkpoint
        await this.db.updateCheckpoint({
          component_type: PROCESSING_COMPONENT.TYPE,
          last_block_number: this.config.startBlock,
          block_hash: PROCESSING_COMPONENT.INITIAL_BLOCK_HASH,
          last_update: new Date().toISOString()
        })
      }

      this.isRunning = true
      this.processingPromise = this.processLoop()
      
      await this.logger.info('Arbitrum Claim Monitor started successfully', {
        startBlock: this.lastProcessedBlock,
        contractAddress: this.config.claimContractAddress
      })
    } catch (error) {
      await this.logger.error(error as Error, { 
        context: 'monitor-start',
        chain: 'arbitrum',
        botType: 'claim'
      })
      
      this.errors.push({
        timestamp: Date.now(),
        message: `Start error: ${error instanceof Error ? error.message : String(error)}`
      })
      
      throw createBotError(
        ErrorType.MONITOR_ERROR,
        `Failed to start Arbitrum Claim Monitor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      )
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return

    try {
      this.isRunning = false
      if (this.processingPromise) {
        await this.processingPromise
      }
      await this.logger.info('Arbitrum Claim Monitor stopped successfully')
    } catch (error) {
      await this.logger.error(error as Error, { context: 'monitor-stop' })
      throw createBotError(
        ErrorType.MONITOR_ERROR,
        `Failed to stop monitor: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      )
    }
  }

  async getStatus(): Promise<MonitorStatus> {
    try {
      const currentBlock = await this.getCurrentBlock()
      
      return {
        isRunning: this.isRunning,
        lastCheckTimestamp: Date.now(),
        lastEventTimestamp: this.eventsProcessed > 0 ? Date.now() : undefined,
        eventsProcessed: this.eventsProcessed,
        errors: [...this.errors]
      }
    } catch (error) {
      await this.logger.error(error as Error, { context: 'get-status' })
      throw createBotError(
        ErrorType.MONITOR_ERROR,
        `Failed to get monitor status: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      )
    }
  }

  private async getCurrentBlock(): Promise<number> {
    try {
      return await this.provider.getBlockNumber()
    } catch (error) {
      await this.logger.error(error as Error, { context: 'get-current-block' })
      throw error
    }
  }

  private async processLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        const currentBlock = await this.getCurrentBlock()
        const targetBlock = currentBlock - this.config.confirmations

        if (targetBlock <= this.lastProcessedBlock) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.pollInterval * 1000),
          )
          continue
        }

        const fromBlock = this.lastProcessedBlock + 1
        const toBlock = Math.min(
          targetBlock,
          fromBlock + this.config.maxBlockRange - 1,
        )

        await this.processBlockRange(fromBlock, toBlock)
        
        // Get block hash for checkpoint
        const block = await this.provider.getBlock(toBlock)
        if (!block) throw new Error(`Block ${toBlock} not found`)

        // Update checkpoint
        await this.db?.updateCheckpoint({
          component_type: PROCESSING_COMPONENT.TYPE,
          last_block_number: toBlock,
          block_hash: block.hash!,
          last_update: new Date().toISOString()
        })

        this.lastProcessedBlock = toBlock
      } catch (error) {
        await this.logger.error(error as Error, {
          context: 'processing-loop',
          fromBlock: this.lastProcessedBlock + 1,
        })
        
        this.errors.push({
          timestamp: Date.now(),
          message: `Process loop error: ${error instanceof Error ? error.message : String(error)}`
        })

        await new Promise((resolve) =>
          setTimeout(resolve, this.config.pollInterval * 1000),
        )
      }
    }
  }

  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    try {
      await this.logger.info(`Processing blocks ${fromBlock} to ${toBlock}`)

      // Define a helper function to safely query event filters
      const safeQueryFilter = async (
        contract: ethers.Contract,
        eventName: string,
        fromBlock: number,
        toBlock: number,
      ): Promise<ethers.EventLog[]> => {
        try {
          if (contract.filters[eventName] && typeof contract.filters[eventName] === 'function') {
            const filter = contract.filters[eventName]()
            const events = await contract.queryFilter(filter, fromBlock, toBlock)
            return events.filter(event => 'args' in event) as ethers.EventLog[]
          }
          return []
        } catch (error) {
          await this.logger.warn(`Failed to query ${eventName} events: ${error instanceof Error ? error.message : String(error)}`)
          return []
        }
      }

      // Query for all event types
      const [
        lstDepositEvents,
        depositedEvents,
        withdrawnEvents,
        alteredEvents,
        stakedWithAttributionEvents,
        unstakedEvents,
        depositInitializedEvents,
        depositUpdatedEvents,
        claimerAlteredEvents,
        rewardClaimedEvents,
        depositSubsidizedEvents,
        earningPowerBumpedEvents,
      ] = await Promise.all([
        safeQueryFilter(this.lstContract, EVENT_TYPES.STAKED, fromBlock, toBlock),
        safeQueryFilter(this.contract, EVENT_TYPES.STAKE_DEPOSITED, fromBlock, toBlock),
        safeQueryFilter(this.contract, EVENT_TYPES.STAKE_WITHDRAWN, fromBlock, toBlock),
        safeQueryFilter(this.contract, EVENT_TYPES.DELEGATEE_ALTERED, fromBlock, toBlock),
        safeQueryFilter(this.lstContract, EVENT_TYPES.STAKE_WITH_ATTRIBUTION, fromBlock, toBlock),
        safeQueryFilter(this.lstContract, EVENT_TYPES.UNSTAKED, fromBlock, toBlock),
        safeQueryFilter(this.lstContract, EVENT_TYPES.DEPOSIT_INITIALIZED, fromBlock, toBlock),
        safeQueryFilter(this.lstContract, EVENT_TYPES.DEPOSIT_UPDATED, fromBlock, toBlock),
        safeQueryFilter(this.contract, EVENT_TYPES.CLAIMER_ALTERED, fromBlock, toBlock),
        safeQueryFilter(this.contract, EVENT_TYPES.REWARD_CLAIMED, fromBlock, toBlock),
        safeQueryFilter(this.lstContract, EVENT_TYPES.DEPOSIT_SUBSIDIZED, fromBlock, toBlock),
        safeQueryFilter(this.contract, EVENT_TYPES.EARNING_POWER_BUMPED, fromBlock, toBlock),
      ])

      await this.logger.info('Events found:', {
        lstDeposit: lstDepositEvents.length,
        deposited: depositedEvents.length,
        withdrawn: withdrawnEvents.length,
        altered: alteredEvents.length,
        stakedWithAttribution: stakedWithAttributionEvents.length,
        unstaked: unstakedEvents.length,
        depositInitialized: depositInitializedEvents.length,
        depositUpdated: depositUpdatedEvents.length,
        claimerAltered: claimerAlteredEvents.length,
        rewardClaimed: rewardClaimedEvents.length,
        depositSubsidized: depositSubsidizedEvents.length,
        earningPowerBumped: earningPowerBumpedEvents.length,
      })

      // Group events by transaction
      const eventsByTx = new Map<string, EventGroup>()

      const addEventsToGroup = (events: ethers.EventLog[], key: keyof EventGroup) => {
        for (const event of events) {
          const existing = eventsByTx.get(event.transactionHash) || {}
          eventsByTx.set(event.transactionHash, {
            ...existing,
            [key]: event,
          })
        }
      }

      addEventsToGroup(depositedEvents, 'deposited')
      addEventsToGroup(lstDepositEvents, 'lstDeposited')
      addEventsToGroup(alteredEvents, 'altered')
      addEventsToGroup(stakedWithAttributionEvents, 'stakedWithAttribution')
      addEventsToGroup(unstakedEvents, 'unstaked')
      addEventsToGroup(depositInitializedEvents, 'depositInitialized')
      addEventsToGroup(depositUpdatedEvents, 'depositUpdated')
      addEventsToGroup(claimerAlteredEvents, 'claimerAltered')
      addEventsToGroup(rewardClaimedEvents, 'rewardClaimed')
      addEventsToGroup(depositSubsidizedEvents, 'depositSubsidized')
      addEventsToGroup(earningPowerBumpedEvents, 'earningPowerBumped')

      // Process events chronologically
      const txEntries = [...eventsByTx.entries()]
        .map(([txHash, events]) => ({
          txHash,
          events,
          blockNumber:
            events.deposited?.blockNumber ||
            events.lstDeposited?.blockNumber ||
            events.altered?.blockNumber ||
            events.stakedWithAttribution?.blockNumber ||
            events.unstaked?.blockNumber ||
            events.depositInitialized?.blockNumber ||
            events.depositUpdated?.blockNumber ||
            events.claimerAltered?.blockNumber ||
            events.rewardClaimed?.blockNumber ||
            events.depositSubsidized?.blockNumber ||
            events.earningPowerBumped?.blockNumber ||
            0,
        }))
        .sort((a, b) => a.blockNumber - b.blockNumber)

      await this.processTransactions(txEntries)
      await this.processStandaloneEvents({
        withdrawn: withdrawnEvents,
        altered: alteredEvents,
      })

      this.eventsProcessed += txEntries.length
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'process-block-range',
        fromBlock,
        toBlock,
      })
      throw error
    }
  }

  private async processTransactions(txEntries: TransactionEntry[]): Promise<void> {
    for (const { events } of txEntries) {
      try {
        // Process stake deposits
        if (events.deposited) {
          const event = events.deposited;
          const { depositId, owner: ownerAddress, amount } = event.args;
          
          // Get delegatee from altered event if present, otherwise use default
          const delegateeAddress = events.altered?.args.newDelegatee || DEFAULT_DELEGATEE_ADDRESS;
          
          await this.handleStakeDeposited({
            depositId: depositId.toString(),
            ownerAddress,
            depositorAddress: ownerAddress, // Use owner as depositor
            delegateeAddress,
            amount,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process stake deposits with attribution
        if (events.stakedWithAttribution) {
          const event = events.stakedWithAttribution;
          const { _depositId, _amount, _referrer } = event.args;
          await this.handleStakedWithAttribution({
            depositId: _depositId.toString(),
            amount: _amount,
            referrer: _referrer,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process unstake events
        if (events.unstaked) {
          const event = events.unstaked;
          const { account, amount } = event.args;
          await this.handleUnstaked({
            account,
            amount,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process deposit initialization
        if (events.depositInitialized) {
          const event = events.depositInitialized;
          const { delegatee, depositId } = event.args;
          await this.handleDepositInitialized({
            delegatee,
            depositId: depositId.toString(),
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process deposit updates
        if (events.depositUpdated) {
          const event = events.depositUpdated;
          const { holder, oldDepositId, newDepositId } = event.args;
          await this.handleDepositUpdated({
            holder,
            oldDepositId: oldDepositId.toString(),
            newDepositId: newDepositId.toString(),
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process deposit subsidy events
        if (events.depositSubsidized) {
          const event = events.depositSubsidized;
          const { depositId, amount } = event.args;
          await this.handleDepositSubsidized({
            depositId: depositId.toString(),
            amount,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process claimer altered events
        if (events.claimerAltered) {
          const event = events.claimerAltered;
          const { depositId, oldClaimer, newClaimer, earningPower } = event.args;
          await this.handleClaimerAltered({
            depositId: depositId.toString(),
            oldClaimer,
            newClaimer,
            earningPower,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process reward claimed events
        if (events.rewardClaimed) {
          const event = events.rewardClaimed;
          const { depositId, claimer, amount, earningPower } = event.args;
          await this.handleRewardClaimed({
            depositId: depositId.toString(),
            claimer,
            amount,
            earningPower,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }

        // Process earning power bumped events
        if (events.earningPowerBumped) {
          const event = events.earningPowerBumped;
          const {
            depositId,
            1: oldEarningPower,
            2: newEarningPower,
            3: bumper,
            4: tipReceiver,
            5: tipAmount,
          } = event.args;
          await this.handleEarningPowerBumped({
            depositId: depositId.toString(),
            oldEarningPower,
            newEarningPower,
            bumper,
            tipReceiver,
            tipAmount,
            blockNumber: event.blockNumber!,
            transactionHash: event.transactionHash!
          });
        }
      } catch (error) {
        await this.logger.error(error as Error, {
          context: 'process-transaction',
          transactionHash: events.deposited?.transactionHash
        });
        throw error;
      }
    }
  }

  private async processStandaloneEvents(events: {
    withdrawn: ethers.EventLog[]
    altered: ethers.EventLog[]
  }): Promise<void> {
    // Process withdrawals
    for (const event of events.withdrawn) {
      const { depositId, amount } = event.args
      await this.handleStakeWithdrawn({
        depositId: depositId.toString(),
        withdrawnAmount: amount,
        blockNumber: event.blockNumber!,
        transactionHash: event.transactionHash!,
      })
    }

    // Process standalone delegatee changes
    for (const event of events.altered) {
      const { depositId, oldDelegatee, newDelegatee } = event.args
      await this.handleDelegateeAltered({
        depositId: depositId.toString(),
        oldDelegatee,
        newDelegatee,
        blockNumber: event.blockNumber!,
        transactionHash: event.transactionHash!,
      })
    }
  }

  private async handleStakeWithdrawn(event: StakeWithdrawnEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId)
      if (!deposit) {
        await this.logger.warn(`Deposit not found for withdrawal: ${event.depositId}`)
        return
      }

      const remainingAmount = BigInt(deposit.amount) - BigInt(event.withdrawnAmount.toString())
      const depositData =
        remainingAmount <= 0n
          ? { amount: '0', delegatee_address: deposit.owner_address }
          : { amount: remainingAmount.toString() }

      await this.db?.updateDeposit(event.depositId, depositData)

      await this.logger.info('Processed withdrawal', {
        depositId: event.depositId,
        remainingAmount: depositData.amount,
      })
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-stake-withdrawn',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleDelegateeAltered(event: DelegateeAlteredEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId)
      if (!deposit) {
        await this.logger.warn(`Deposit not found for delegatee alteration: ${event.depositId}`)
        return
      }

      await this.db?.updateDeposit(event.depositId, {
        delegatee_address: event.newDelegatee,
      })

      this.emit(MONITOR_EVENTS.DELEGATE_EVENT, event)

      await this.logger.info('Updated delegatee', {
        depositId: event.depositId,
        newDelegatee: event.newDelegatee,
      })
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-delegatee-altered',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleStakedWithAttribution(event: StakedWithAttributionEvent): Promise<void> {
    this.emit(MONITOR_EVENTS.STAKE_WITH_ATTRIBUTION, event)
  }

  private async handleUnstaked(event: UnstakedEvent): Promise<void> {
    this.emit(MONITOR_EVENTS.UNSTAKED, event)
  }

  private async handleDepositInitialized(event: DepositInitializedEvent): Promise<void> {
    try {
      const existingDeposit = await this.db?.getDeposit(event.depositId)
      if (!existingDeposit) {
        await this.db?.createDeposit({
          deposit_id: event.depositId,
          owner_address: event.delegatee,
          depositor_address: event.delegatee,
          delegatee_address: event.delegatee,
          amount: '0',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
      }

      this.emit(MONITOR_EVENTS.DEPOSIT_INITIALIZED, event)
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-deposit-initialized',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleDepositUpdated(event: DepositUpdatedEvent): Promise<void> {
    try {
      const oldDeposit = await this.db?.getDeposit(event.oldDepositId)
      if (!oldDeposit) {
        await this.logger.warn('Old deposit not found when processing DepositUpdated', {
          holder: event.holder,
          oldDepositId: event.oldDepositId,
          newDepositId: event.newDepositId,
        })
      }

      await this.db?.createDeposit({
        deposit_id: event.newDepositId,
        owner_address: event.holder,
        depositor_address: event.holder,
        delegatee_address: oldDeposit?.delegatee_address || event.holder,
        amount: oldDeposit?.amount || '0',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (oldDeposit) {
        await this.db?.updateDeposit(event.oldDepositId, {
          amount: '0',
          delegatee_address: event.holder,
        })
      }

      this.emit(MONITOR_EVENTS.DEPOSIT_UPDATED, event)
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-deposit-updated',
        oldDepositId: event.oldDepositId,
        newDepositId: event.newDepositId,
      })
      throw error
    }
  }

  private async handleDepositSubsidized(event: DepositSubsidizedEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId)
      if (!deposit) {
        await this.logger.warn(`Deposit not found for subsidy: ${event.depositId}`)
        return
      }

      const newAmount = BigInt(deposit.amount) + BigInt(event.amount.toString())
      await this.db?.updateDeposit(event.depositId, {
        amount: newAmount.toString(),
      })

      this.emit(MONITOR_EVENTS.DEPOSIT_SUBSIDIZED, event)
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-deposit-subsidized',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleClaimerAltered(event: ClaimerAlteredEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId)
      if (!deposit) {
        await this.logger.warn(`Deposit not found for claimer alteration: ${event.depositId}`)
        return
      }

      await this.db?.updateDeposit(event.depositId, {
        earning_power: event.earningPower.toString(),
      })

      this.emit(MONITOR_EVENTS.CLAIMER_ALTERED, event)
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-claimer-altered',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleRewardClaimed(event: RewardClaimedEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId)
      if (!deposit) {
        await this.logger.warn(`Deposit not found for reward claim: ${event.depositId}`)
        return
      }

      await this.db?.updateDeposit(event.depositId, {
        earning_power: event.earningPower.toString(),
      })

      this.emit(MONITOR_EVENTS.REWARD_CLAIMED, event)
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-reward-claimed',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleEarningPowerBumped(event: EarningPowerBumpedEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId)
      if (!deposit) {
        await this.logger.warn(`Deposit not found for earning power bump: ${event.depositId}`)
        return
      }

      await this.db?.updateDeposit(event.depositId, {
        earning_power: event.newEarningPower.toString(),
      })

      this.emit(MONITOR_EVENTS.EARNING_POWER_BUMPED, event)
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-earning-power-bumped',
        depositId: event.depositId,
      })
      throw error
    }
  }

  private async handleStakeDeposited(event: StakeDepositedEvent): Promise<void> {
    try {
      const deposit = await this.db?.getDeposit(event.depositId);
      if (!deposit) {
        await this.logger.warn(`Deposit not found for stake deposit: ${event.depositId}`);
        return;
      }

      const delegateeAddress = event.delegateeAddress || DEFAULT_DELEGATEE_ADDRESS;
      const depositData = {
        amount: event.amount.toString(),
        delegatee_address: delegateeAddress,
        updated_at: new Date().toISOString()
      };

      await this.db?.updateDeposit(event.depositId, depositData);

      await this.logger.info('Processed stake deposit', {
        depositId: event.depositId,
        amount: depositData.amount,
        delegateeAddress: depositData.delegatee_address
      });
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'handle-stake-deposited',
        depositId: event.depositId
      });
      throw error;
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let attempts = 0
    while (attempts < this.config.maxRetries) {
      try {
        return await operation()
      } catch (error) {
        attempts++
        if (attempts === this.config.maxRetries) {
          await this.logger.error(error as Error, {
            context,
            attempts,
          })
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts))
      }
    }
    throw new Error('Unreachable code path')
  }
} 