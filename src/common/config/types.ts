/**
 * Configuration types for different bots and chains
 */

/** Base configuration shared by all bots */
export interface BaseConfig {
  /** Chain ID (e.g., 42161 for Arbitrum One) */
  chainId: number
  
  /** Human-readable network name */
  networkName: string
  
  /** RPC URL for blockchain access */
  rpcUrl: string
  
  /** Address of the wallet used to send transactions */
  walletAddress: string
  
  /** Transaction executor type: 'eoa' or 'defender' */
  executorType: 'eoa' | 'wallet' | 'defender'
  
  /** Private key (only if executorType is 'eoa' or 'wallet') */
  privateKey?: string
  
  /** Defender API key (only if executorType is 'defender') */
  defenderApiKey?: string
  
  /** Defender API secret (only if executorType is 'defender') */
  defenderApiSecret?: string
  
  /** Gas price multiplier (relative to recommended gas price) */
  gasPriceMultiplier: number
  
  /** Max gas price in gwei */
  maxGasPrice: number
  
  /** Monitor polling interval in milliseconds */
  monitorInterval: number
  
  /** Profitability engine refresh interval in milliseconds */
  profitabilityInterval: number
  
  /** Database connection string */
  dbConnectionString: string
  
  /** Starting block number */
  startBlock: number
  
  /** Poll interval in seconds */
  pollInterval: number
  
  /** Maximum number of blocks to process in one batch */
  maxBlockRange: number
  
  /** Maximum number of retries */
  maxRetries: number
  
  /** Reorg depth */
  reorgDepth: number
  
  /** Number of block confirmations before processing */
  confirmations: number
  
  /** Health check interval in milliseconds */
  healthCheckInterval: number
  
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  
  /** Database type */
  databaseType: 'json' | 'supabase'
}

/** Claim bot specific configuration */
export interface ClaimBotConfig extends BaseConfig {
  /** LST token address */
  lstAddress: string
  
  /** Reward token address */
  rewardTokenAddress: string
  
  /** Reward calculator address */
  rewardCalculatorAddress?: string
  
  /** Reward notifier address */
  rewardNotifierAddress: string
  
  /** Claim contract address */
  claimContractAddress: string
  
  /** Staker address */
  stakerAddress: string

  /** Minimum reward amount in ETH to consider claiming */
  minRewardAmount: string
}

/** Bump bot specific configuration */
export interface BumpBotConfig extends BaseConfig {
  /** Bump contract address */
  bumpContractAddress: string
  
  /** Token address */
  tokenAddress: string
  
  /** Minimum earning power increase to trigger bump */
  minEarningPowerBips: number
  
  /** Maximum tip amount */
  maxTipAmount: string
  
  /** Tip receiver address */
  tipReceiver: string
}

/** Monitor configuration */
export interface MonitorConfig {
  /** Provider */
  provider: any // ethers.Provider
  
  /** Staker address */
  stakerAddress: string
  
  /** Token address */
  tokenAddress: string
  
  /** Reward calculator address */
  rewardCalculatorAddress?: string
  
  /** Reward notifier address */
  rewardNotifierAddress: string
  
  /** Network name */
  networkName: string
  
  /** Chain ID */
  chainId: number
  
  /** Starting block number */
  startBlock: number
  
  /** Poll interval in seconds */
  pollInterval: number
  
  /** Database */
  database: any // IDatabase
  
  /** Maximum number of blocks to process in one batch */
  maxBlockRange: number
  
  /** Maximum number of retries */
  maxRetries: number
  
  /** LST address */
  lstAddress: string
  
  /** Reorg depth */
  reorgDepth: number
  
  /** Number of block confirmations before processing */
  confirmations: number
  
  /** Health check interval in milliseconds */
  healthCheckInterval: number
  
  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  
  /** Database type */
  databaseType: 'json' | 'supabase'
}

/** Extended monitor configuration */
export interface ExtendedMonitorConfig extends MonitorConfig {
  /** Error logger */
  errorLogger?: any // ErrorLogger
}

/** Union type for all bot configurations */
export type BotConfig = ClaimBotConfig | BumpBotConfig 