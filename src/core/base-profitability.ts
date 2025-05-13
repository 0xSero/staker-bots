/**
 * Base profitability engine interface defining the contract for all profitability implementations
 */

export interface ProfitabilityAction {
  type: string
  target: string
  estimatedProfit: bigint
  estimatedGasCost: bigint
  estimatedNetProfit: bigint
  metadata: Record<string, any>
}

export interface EngineStatus {
  isRunning: boolean
  lastCheckTimestamp?: number
  actionsEvaluated: number
  profitableActionsFound: number
  errors: Array<{
    timestamp: number
    message: string
  }>
}

export interface BaseProfitabilityEngine {
  /**
   * Start the profitability engine
   */
  start(): Promise<void>
  
  /**
   * Stop the profitability engine
   */
  stop(): Promise<void>
  
  /**
   * Get the current status of the profitability engine
   */
  getStatus(): Promise<EngineStatus>
  
  /**
   * Get the current profitable actions
   */
  getProfitableActions(): Promise<ProfitabilityAction[]>
} 