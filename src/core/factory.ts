/**
 * Factory methods for creating bot component instances
 */
import { BaseMonitor } from './base-monitor'
import { BaseProfitabilityEngine } from './base-profitability'
import { BaseExecutor } from './base-executor'

export type BotType = 'claim' | 'bump'
export type ChainType = 'arbitrum' | 'rari' | 'obol'

/**
 * Create a monitor instance for the specified bot type and chain
 */
export async function createMonitor(botType: BotType, chain: ChainType): Promise<BaseMonitor> {
  // This will be implemented to load the appropriate implementation
  const implementation = await import(`../implementations/${chain}/${botType}/monitor`)
  return new implementation.default()
}

/**
 * Create a profitability engine instance for the specified bot type and chain
 */
export async function createProfitabilityEngine(
  botType: BotType,
  chain: ChainType
): Promise<BaseProfitabilityEngine> {
  // This will be implemented to load the appropriate implementation
  const implementation = await import(`../implementations/${chain}/${botType}/profitability`)
  return new implementation.default()
}

/**
 * Create an executor instance for the specified bot type and chain
 */
export async function createExecutor(botType: BotType, chain: ChainType): Promise<BaseExecutor> {
  // This will be implemented to load the appropriate implementation
  const implementation = await import(`../implementations/${chain}/${botType}/executor`)
  return new implementation.default()
} 