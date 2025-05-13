/**
 * Configuration loader for loading and validating bot configurations
 */
import { BotConfig, BaseConfig, ClaimBotConfig, BumpBotConfig } from './types'
import { ErrorType } from '../errors'
import { BaseError, ErrorSeverity } from '../errors/types'

export class ConfigError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context, false, ErrorType.CONFIG_ERROR, ErrorSeverity.ERROR)
    this.name = 'ConfigError'
  }
}

/**
 * Load configuration for a specific bot type and chain
 * 
 * @param botType The type of bot
 * @param chain The chain the bot operates on
 * @returns Configuration for the specified bot and chain
 */
export function loadConfig(botType: string, chain: string): BaseConfig {
  try {
    // Load environment variables based on bot type and chain
    const envFile = `.env.${chain}`
    require('dotenv').config({ path: envFile })

    // Validate required environment variables
    const requiredVars = [
      'RPC_URL',
      'CHAIN_ID',
      'NETWORK_NAME',
      'START_BLOCK',
      'POLL_INTERVAL',
      'MAX_BLOCK_RANGE',
      'MAX_RETRIES',
      'REORG_DEPTH',
      'CONFIRMATIONS',
      'HEALTH_CHECK_INTERVAL',
      'LOG_LEVEL',
      'DATABASE_TYPE',
      'DATABASE_CONNECTION_STRING',
      'WALLET_ADDRESS',
      'EXECUTOR_TYPE',
      'GAS_PRICE_MULTIPLIER',
      'MAX_GAS_PRICE',
      'MONITOR_INTERVAL',
      'PROFITABILITY_INTERVAL'
    ]

    for (const varName of requiredVars) {
      if (!process.env[varName]) {
        throw new ConfigError(`Missing required environment variable: ${varName}`)
      }
    }

    // Create base config
    const baseConfig: BaseConfig = {
      rpcUrl: process.env.RPC_URL!,
      chainId: parseInt(process.env.CHAIN_ID!),
      networkName: process.env.NETWORK_NAME!,
      startBlock: parseInt(process.env.START_BLOCK!),
      pollInterval: parseInt(process.env.POLL_INTERVAL!),
      maxBlockRange: parseInt(process.env.MAX_BLOCK_RANGE!),
      maxRetries: parseInt(process.env.MAX_RETRIES!),
      reorgDepth: parseInt(process.env.REORG_DEPTH!),
      confirmations: parseInt(process.env.CONFIRMATIONS!),
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL!),
      logLevel: process.env.LOG_LEVEL! as 'debug' | 'info' | 'warn' | 'error',
      databaseType: process.env.DATABASE_TYPE! as 'json' | 'supabase',
      dbConnectionString: process.env.DATABASE_CONNECTION_STRING!,
      walletAddress: process.env.WALLET_ADDRESS!,
      executorType: process.env.EXECUTOR_TYPE! as 'eoa' | 'wallet' | 'defender',
      gasPriceMultiplier: parseFloat(process.env.GAS_PRICE_MULTIPLIER!),
      maxGasPrice: parseInt(process.env.MAX_GAS_PRICE!),
      monitorInterval: parseInt(process.env.MONITOR_INTERVAL!),
      profitabilityInterval: parseInt(process.env.PROFITABILITY_INTERVAL!),
      privateKey: process.env.PRIVATE_KEY,
      defenderApiKey: process.env.DEFENDER_API_KEY,
      defenderApiSecret: process.env.DEFENDER_API_SECRET,
    }

    // Add bot type specific config
    switch (botType) {
      case 'claim':
        const claimConfig: ClaimBotConfig = {
          ...baseConfig,
          claimContractAddress: process.env.CLAIM_CONTRACT_ADDRESS!,
          rewardTokenAddress: process.env.REWARD_TOKEN_ADDRESS!,
          rewardCalculatorAddress: process.env.REWARD_CALCULATOR_ADDRESS,
          rewardNotifierAddress: process.env.REWARD_NOTIFIER_ADDRESS!,
          lstAddress: process.env.LST_ADDRESS!,
          stakerAddress: process.env.STAKER_ADDRESS!,
        }
        return claimConfig

      case 'bump':
        const bumpConfig: BumpBotConfig = {
          ...baseConfig,
          bumpContractAddress: process.env.BUMP_CONTRACT_ADDRESS!,
          tokenAddress: process.env.TOKEN_ADDRESS!,
          minEarningPowerBips: parseInt(process.env.MIN_EARNING_POWER_BIPS!),
          maxTipAmount: process.env.MAX_TIP_AMOUNT!,
          tipReceiver: process.env.TIP_RECEIVER!,
        }
        return bumpConfig

      default:
        throw new ConfigError(`Unknown bot type: ${botType}`)
    }
  } catch (error) {
    if (error instanceof ConfigError) throw error
    throw new ConfigError(`Failed to load config: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Validate a bot configuration
 * 
 * @param config Bot configuration to validate
 * @returns Array of validation error messages (empty if valid)
 */
export function validateConfig(config: BotConfig): string[] {
  const errors: string[] = []
  
  // Validate base config
  if (!config.chainId) errors.push('Chain ID is required')
  if (!config.networkName) errors.push('Network name is required')
  if (!config.rpcUrl) errors.push('RPC URL is required')
  if (!config.walletAddress) errors.push('Wallet address is required')
  if ((config.executorType === 'eoa' || config.executorType === 'wallet') && !config.privateKey) {
    errors.push('Private key is required for EOA/wallet executor')
  }
  if (config.executorType === 'defender' && (!config.defenderApiKey || !config.defenderApiSecret)) {
    errors.push('Defender API key and secret are required for Defender executor')
  }
  if (!config.dbConnectionString) errors.push('Database connection string is required')
  
  // Validate claim bot config
  if ('lstAddress' in config) {
    if (!config.lstAddress) errors.push('LST address is required for claim bot')
    if (!config.rewardTokenAddress) errors.push('Reward token address is required for claim bot')
    if (!config.claimContractAddress) errors.push('Claim contract address is required for claim bot')
  }
  
  // Validate bump bot config
  if ('bumpContractAddress' in config) {
    if (!config.bumpContractAddress) errors.push('Bump contract address is required for bump bot')
    if (!config.tokenAddress) errors.push('Token address is required for bump bot')
    if (!config.minEarningPowerBips) errors.push('Min earning power bips is required for bump bot')
  }
  
  return errors
} 