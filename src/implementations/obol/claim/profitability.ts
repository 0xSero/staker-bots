import { ethers } from 'ethers';
import { BaseProfitabilityEngine, EngineStatus, ProfitabilityAction } from '../../../core/base-profitability';
import { ClaimBotConfig } from '../../../common/config/types';
import { loadConfig } from '../../../common/config/loader';
import { createBotError, ErrorType, ErrorSeverity, ConsoleErrorLogger } from '../../../common/errors';
import { Database } from '../../../common/database/interfaces/database';
import { createDatabase, DatabaseConfig } from '../../../common/database/factory';
import { ClaimEvent } from '../../../common/types';
import { stakerAbi } from '../../../configuration/abis';

/**
 * Obol Claim Profitability Engine
 * Analyzes deposits to determine if claiming rewards is profitable
 */
export default class ObolClaimProfitabilityEngine implements BaseProfitabilityEngine {
  private config: ClaimBotConfig;
  private provider: ethers.Provider;
  private contract: ethers.Contract;
  private db?: Database;
  private logger: ConsoleErrorLogger;
  private isRunning: boolean = false;
  private profitabilityCheckLoop?: NodeJS.Timeout;
  private actionsEvaluated: number = 0;
  private profitableActionsFound: number = 0;
  private lastGasPrice: bigint = BigInt(0);
  private lastCheckTimestamp?: number;
  private errors: Array<{ timestamp: number, message: string }> = [];
  private claimableDeposits: string[] = [];
  private profitableActions: ProfitabilityAction[] = [];

  constructor() {
    this.config = loadConfig('claim', 'obol') as ClaimBotConfig;
    this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
    this.contract = new ethers.Contract(
      this.config.claimContractAddress,
      stakerAbi,
      this.provider
    );
    this.logger = new ConsoleErrorLogger('obol-claim-profitability');
  }

  /**
   * Start the profitability engine
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      await this.logger.warn('Profitability engine is already running');
      return;
    }

    try {
      // Initialize database connection
      const dbConfig: DatabaseConfig = {
        type: 'json',
        connectionString: this.config.dbConnectionString,
        filePath: 'obol-claim-db.json'
      };
      
      this.db = await createDatabase(dbConfig);
      
      // Start periodic profitability checks
      this.isRunning = true;
      
      // Begin with an immediate check
      await this.checkProfitability();
      
      // Set up regular interval checks
      this.profitabilityCheckLoop = setInterval(
        () => this.checkProfitability().catch(error => {
          this.logger.error(error as Error, { context: 'profitability-check-interval' });
        }),
        this.config.profitabilityInterval
      );
      
      await this.logger.info('Obol Claim Profitability Engine started successfully');
    } catch (error) {
      await this.logger.error(error as Error, {
        context: 'profitability-start',
        chain: 'obol',
        botType: 'claim'
      });
      
      this.errors.push({
        timestamp: Date.now(),
        message: `Start error: ${error instanceof Error ? error.message : String(error)}`
      });
      
      throw createBotError(
        ErrorType.PROFITABILITY_ERROR,
        `Failed to start Obol Claim Profitability Engine: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      );
    }
  }

  /**
   * Stop the profitability engine
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.isRunning = false;
      
      // Clear the interval
      if (this.profitabilityCheckLoop) {
        clearInterval(this.profitabilityCheckLoop);
        this.profitabilityCheckLoop = undefined;
      }
      
      await this.logger.info('Obol Claim Profitability Engine stopped successfully');
    } catch (error) {
      await this.logger.error(error as Error, { 
        context: 'profitability-stop' 
      });
      
      this.errors.push({
        timestamp: Date.now(),
        message: `Stop error: ${error instanceof Error ? error.message : String(error)}`
      });
      
      throw createBotError(
        ErrorType.PROFITABILITY_ERROR,
        `Failed to stop Obol Claim Profitability Engine: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      );
    }
  }

  /**
   * Get the current status of the profitability engine
   */
  async getStatus(): Promise<EngineStatus> {
    try {
      return {
        isRunning: this.isRunning,
        lastCheckTimestamp: this.lastCheckTimestamp,
        actionsEvaluated: this.actionsEvaluated,
        profitableActionsFound: this.profitableActionsFound,
        errors: [...this.errors]
      };
    } catch (error) {
      await this.logger.error(error as Error, { context: 'get-status' });
      
      throw createBotError(
        ErrorType.PROFITABILITY_ERROR,
        `Failed to get Obol Claim Profitability Engine status: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      );
    }
  }

  /**
   * Get currently identified profitable actions
   */
  async getProfitableActions(): Promise<ProfitabilityAction[]> {
    try {
      // If we haven't run a check yet, do it now
      if (!this.lastCheckTimestamp) {
        await this.checkProfitability();
      }
      
      return [...this.profitableActions];
    } catch (error) {
      await this.logger.error(error as Error, { context: 'get-profitable-actions' });
      
      throw createBotError(
        ErrorType.PROFITABILITY_ERROR,
        `Failed to get profitable actions: ${error instanceof Error ? error.message : String(error)}`,
        ErrorSeverity.ERROR
      );
    }
  }

  /**
   * Check for new profitable claim opportunities
   */
  private async checkProfitability(): Promise<void> {
    try {
      this.lastCheckTimestamp = Date.now();
      
      // Get current gas price
      const feeData = await this.provider.getFeeData();
      if (!feeData.gasPrice) {
        throw new Error('Failed to get gas price');
      }
      
      this.lastGasPrice = feeData.gasPrice;
      
      // Get list of deposits with claimable rewards
      await this.getClaimableDeposits();
      
      // Reset profitable actions list
      this.profitableActions = [];
      
      // Check each deposit for profitability
      for (const depositId of this.claimableDeposits) {
        await this.evaluateDepositProfitability(depositId, this.lastGasPrice);
      }
      
      await this.logger.info('Profitability check completed', {
        actionsEvaluated: this.claimableDeposits.length,
        profitableActionsFound: this.profitableActions.length,
        gasPrice: this.lastGasPrice.toString()
      });
    } catch (error) {
      await this.logger.error(error as Error, { context: 'check-profitability' });
      
      this.errors.push({
        timestamp: Date.now(),
        message: `Profitability check error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Get list of deposits with claimable rewards
   */
  private async getClaimableDeposits(): Promise<void> {
    try {
      // Use contract method to get available deposits if it exists
      if (typeof this.contract.getAvailableDeposits === 'function') {
        const deposits = await this.contract.getAvailableDeposits() as bigint[];
        this.claimableDeposits = deposits.map((d: bigint) => d.toString());
      } else {
        // Otherwise, check recent claim events from database to identify potential deposits
        if (this.db) {
          const botStatus = await this.db.getBotStatus('claim', 'obol');
          
          // If there are processed events in the status, we might have some claim events
          if (botStatus?.status?.recentClaimEvents) {
            const recentDepositIds = new Set<string>();
            
            // Extract unique deposit IDs from recent events
            for (const event of botStatus.status.recentClaimEvents) {
              if (event.depositId) {
                recentDepositIds.add(event.depositId.toString());
              }
            }
            
            this.claimableDeposits = Array.from(recentDepositIds);
          } else {
            this.claimableDeposits = [];
          }
        }
      }
      
      await this.logger.info(`Found ${this.claimableDeposits.length} potentially claimable deposits`);
    } catch (error) {
      await this.logger.error(error as Error, { context: 'get-claimable-deposits' });
      throw error;
    }
  }

  /**
   * Evaluate if claiming rewards for a deposit is profitable
   */
  private async evaluateDepositProfitability(depositId: string, gasPrice: bigint): Promise<void> {
    try {
      this.actionsEvaluated++;
      
      if (!this.contract.getClaimableReward) {
        throw new Error('Contract does not have getClaimableReward function');
      }
      
      // Get the claimable reward amount
      const claimableReward = await this.contract.getClaimableReward(depositId);
      
      if (claimableReward <= 0) {
        await this.logger.info(`No rewards to claim for deposit ${depositId}`);
        return;
      }
      
      // Estimate gas cost of claiming
      const txData = this.contract.interface.encodeFunctionData('claimReward', [depositId]);
      const gasLimit = await this.provider.estimateGas({
        to: this.config.claimContractAddress,
        data: txData
      });
      
      // Calculate gas cost
      const gasCost = gasLimit * gasPrice;
      
      // Convert reward to ETH value using token price (simplified here)
      // In a real implementation, you'd use a price feed
      const rewardInWei = claimableReward; // For simplicity, assuming 1:1 conversion
      
      // Calculate net profit
      const netProfit = rewardInWei - gasCost;
      
      // Check if profitable based on configured minimum
      const minRewardAmountWei = ethers.parseEther(this.config.minRewardAmount);
      
      if (netProfit > minRewardAmountWei) {
        this.profitableActionsFound++;
        
        const profitableAction: ProfitabilityAction = {
          type: 'claim',
          target: depositId,
          estimatedProfit: rewardInWei,
          estimatedGasCost: gasCost,
          estimatedNetProfit: netProfit,
          metadata: {
            depositId,
            claimableReward: claimableReward.toString(),
            txData
          }
        };
        
        // Add to profitable actions list
        this.profitableActions.push(profitableAction);
        
        await this.logger.info(`Found profitable claim for deposit ${depositId}`, {
          reward: ethers.formatEther(rewardInWei),
          gasCost: ethers.formatEther(gasCost),
          netProfit: ethers.formatEther(netProfit)
        });
      } else {
        await this.logger.info(`Claim for deposit ${depositId} not profitable`, {
          reward: ethers.formatEther(rewardInWei),
          gasCost: ethers.formatEther(gasCost),
          netProfit: ethers.formatEther(netProfit),
          minRequired: ethers.formatEther(minRewardAmountWei)
        });
      }
    } catch (error) {
      await this.logger.error(error as Error, { 
        context: 'evaluate-profitability',
        depositId
      });
    }
  }
} 