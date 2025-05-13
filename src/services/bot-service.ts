/**
 * Base bot service that coordinates the monitor, profitability engine, and executor
 */
import { BotType, ChainType, BotStatus } from '../common/types'
import { BaseMonitor } from '../core/base-monitor'
import { BaseProfitabilityEngine } from '../core/base-profitability'
import { BaseExecutor } from '../core/base-executor'
import { BotConfig, loadConfig, validateConfig } from '../common/config'
import { createMonitor, createProfitabilityEngine, createExecutor } from '../core/factory'
import { createBotError, ErrorType, ErrorSeverity, errorLogger } from '../common/errors'

export class BotService {
  private botType: BotType
  private chain: ChainType
  private config!: BotConfig  // Using definite assignment assertion
  private monitor!: BaseMonitor  // Using definite assignment assertion
  private profitabilityEngine!: BaseProfitabilityEngine  // Using definite assignment assertion
  private executor!: BaseExecutor  // Using definite assignment assertion
  private isRunning = false
  
  /**
   * Create a new bot service
   */
  constructor(botType: BotType, chain: ChainType) {
    this.botType = botType
    this.chain = chain
  }
  
  /**
   * Initialize the bot service
   */
  async initialize(): Promise<void> {
    try {
      // Load and validate configuration
      this.config = loadConfig(this.botType, this.chain)
      const validationErrors = validateConfig(this.config)
      
      if (validationErrors.length > 0) {
        const error = createBotError(
          `Configuration validation failed: ${validationErrors.join(', ')}`,
          ErrorType.CONFIGURATION,
          ErrorSeverity.CRITICAL
        )
        await errorLogger.logError(error)
        throw error
      }
      
      // Create components
      this.monitor = await createMonitor(this.botType, this.chain)
      this.profitabilityEngine = await createProfitabilityEngine(this.botType, this.chain)
      this.executor = await createExecutor(this.botType, this.chain)
      
      console.log(`Initialized ${this.botType} bot for ${this.chain}`)
    } catch (error) {
      const botError = createBotError(
        `Failed to initialize bot: ${(error as Error).message}`,
        ErrorType.CONFIGURATION,
        ErrorSeverity.CRITICAL,
        { botType: this.botType, chain: this.chain }
      )
      await errorLogger.logError(botError)
      throw botError
    }
  }
  
  /**
   * Start the bot service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`Bot ${this.botType} for ${this.chain} is already running`)
      return
    }
    
    try {
      // Start components
      await this.monitor.start()
      await this.profitabilityEngine.start()
      await this.executor.start()
      
      this.isRunning = true
      console.log(`Started ${this.botType} bot for ${this.chain}`)
    } catch (error) {
      const botError = createBotError(
        `Failed to start bot: ${(error as Error).message}`,
        ErrorType.UNKNOWN,
        ErrorSeverity.HIGH,
        { botType: this.botType, chain: this.chain }
      )
      await errorLogger.logError(botError)
      throw botError
    }
  }
  
  /**
   * Stop the bot service
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log(`Bot ${this.botType} for ${this.chain} is not running`)
      return
    }
    
    try {
      // Stop components
      await this.monitor.stop()
      await this.profitabilityEngine.stop()
      await this.executor.stop()
      
      this.isRunning = false
      console.log(`Stopped ${this.botType} bot for ${this.chain}`)
    } catch (error) {
      const botError = createBotError(
        `Failed to stop bot: ${(error as Error).message}`,
        ErrorType.UNKNOWN,
        ErrorSeverity.MEDIUM,
        { botType: this.botType, chain: this.chain }
      )
      await errorLogger.logError(botError)
      throw botError
    }
  }
  
  /**
   * Get the current bot status
   */
  async getStatus(): Promise<BotStatus> {
    const [monitorStatus, profitabilityStatus, executorStatus, errors] = await Promise.all([
      this.monitor.getStatus(),
      this.profitabilityEngine.getStatus(),
      this.executor.getStatus(),
      errorLogger.getRecentErrors(10)
    ])
    
    return {
      botType: this.botType,
      chain: this.chain,
      isRunning: this.isRunning,
      monitorStatus: {
        isRunning: monitorStatus.isRunning,
        lastCheckTimestamp: monitorStatus.lastCheckTimestamp,
        lastEventTimestamp: monitorStatus.lastEventTimestamp,
        eventsProcessed: monitorStatus.eventsProcessed
      },
      profitabilityStatus: {
        isRunning: profitabilityStatus.isRunning,
        lastCheckTimestamp: profitabilityStatus.lastCheckTimestamp,
        actionsEvaluated: profitabilityStatus.actionsEvaluated,
        profitableActionsFound: profitabilityStatus.profitableActionsFound
      },
      executorStatus: {
        isRunning: executorStatus.isRunning,
        lastTxTimestamp: executorStatus.lastTxTimestamp,
        txQueued: executorStatus.txQueued,
        txSent: executorStatus.txSent,
        txConfirmed: executorStatus.txConfirmed,
        txFailed: executorStatus.txFailed
      },
      errors: errors
        .filter(e => e.botType === this.botType && e.chain === this.chain)
        .map(e => ({
          timestamp: e.timestamp,
          message: e.message,
          type: e.type,
          severity: e.severity
        }))
    }
  }
} 