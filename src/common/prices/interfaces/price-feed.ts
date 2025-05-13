/**
 * Price feed interface for getting token prices and gas estimates
 */

export interface TokenPrice {
  /** Token address */
  token: string
  
  /** USD price */
  usdPrice: number
  
  /** Native token price (e.g., ETH) */
  nativePrice?: number
  
  /** Timestamp of the price */
  timestamp: number
  
  /** Source of the price */
  source: string
}

export interface GasEstimate {
  /** Max fee per gas in wei */
  maxFeePerGas: bigint
  
  /** Max priority fee per gas in wei */
  maxPriorityFeePerGas: bigint
  
  /** Estimated base fee in wei */
  baseFee: bigint
  
  /** Timestamp of the estimate */
  timestamp: number
  
  /** USD price per gas unit */
  usdPerGasUnit?: number
}

export interface PriceFeed {
  /**
   * Get the USD price of a token
   */
  getTokenPrice(tokenAddress: string): Promise<TokenPrice>
  
  /**
   * Get the current gas price estimate
   */
  getGasEstimate(): Promise<GasEstimate>
  
  /**
   * Estimate the gas cost of a transaction in USD
   */
  estimateTransactionCost(gasLimit: bigint): Promise<{
    gasCostWei: bigint
    gasCostUsd: number
  }>
  
  /**
   * Convert token amount to USD
   */
  convertTokenAmountToUsd(
    tokenAddress: string,
    amount: bigint,
    decimals: number
  ): Promise<number>
} 