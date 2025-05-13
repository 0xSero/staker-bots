/**
 * Transaction simulator interface for simulating transactions before execution
 */

export interface SimulationCall {
  /** Target contract address */
  to: string
  
  /** Call data */
  data: string
  
  /** Value in wei */
  value?: bigint
  
  /** From address */
  from?: string
  
  /** Gas limit */
  gasLimit?: bigint
}

export interface SimulationResult {
  /** Indicates if the simulation was successful */
  success: boolean
  
  /** Gas used */
  gasUsed?: bigint
  
  /** Output data */
  output?: string
  
  /** Error message if the simulation failed */
  error?: string
  
  /** Execution traces */
  traces?: any[]
  
  /** State changes */
  stateChanges?: any[]
  
  /** Gas limit recommended for the transaction */
  recommendedGasLimit?: bigint
}

export interface Simulator {
  /**
   * Simulate a transaction
   */
  simulateTransaction(call: SimulationCall): Promise<SimulationResult>
  
  /**
   * Check if a transaction is likely to succeed
   */
  willTransactionSucceed(call: SimulationCall): Promise<boolean>
  
  /**
   * Estimate gas for a transaction
   */
  estimateGas(call: SimulationCall): Promise<bigint>
} 