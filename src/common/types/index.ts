/**
 * Common type definitions shared across the codebase
 */

/**
 * Types of bots supported by the system
 */
export type BotType = 'claim' | 'bump'

/**
 * Chains supported by the system
 */
export type ChainType = 'arbitrum' | 'rari' | 'obol'

/**
 * Bot status information
 */
export interface BotStatus {
  botType: BotType
  chain: ChainType
  isRunning: boolean
  monitorStatus: {
    isRunning: boolean
    lastCheckTimestamp?: number
    lastEventTimestamp?: number
    eventsProcessed: number
  }
  profitabilityStatus: {
    isRunning: boolean
    lastCheckTimestamp?: number
    actionsEvaluated: number
    profitableActionsFound: number
  }
  executorStatus: {
    isRunning: boolean
    lastTxTimestamp?: number
    txQueued: number
    txSent: number
    txConfirmed: number
    txFailed: number
  }
  errors: Array<{
    timestamp: number
    message: string
    type: string
    severity: string
  }>
}

/**
 * Claim event information
 */
export interface ClaimEvent {
  id: string
  timestamp: number
  user: string
  amount: string
  rewardToken: string
  transactionHash: string
  blockNumber: number
}

/**
 * Bump event information
 */
export interface BumpEvent {
  id: string
  timestamp: number
  user: string
  oldEarningPower: string
  newEarningPower: string
  increase: string
  transactionHash: string
  blockNumber: number
}

// Unified event type
export type BotEvent = ClaimEvent | BumpEvent 