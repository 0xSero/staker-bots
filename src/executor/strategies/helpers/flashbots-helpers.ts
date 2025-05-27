import { ethers } from 'ethers';
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle';
import { Logger } from '@/monitor/logging';
import { ErrorLogger } from '@/configuration/errorLogger';
import {
  FlashbotsTransactionRequest,
  BaseTransactionState,
  ExecutorConfig,
} from '../../interfaces/types';

/**
 * Create a Flashbots provider instance
 */
export async function createFlashbotsProvider(
  provider: ethers.Provider,
  authSigner: ethers.Wallet,
  config: ExecutorConfig,
  logger: Logger,
): Promise<FlashbotsBundleProvider | null> {
  try {
    if (!config.flashbots?.enabled) {
      logger.debug('Flashbots is disabled in configuration');
      return null;
    }

    const relayUrl = config.flashbots.relayUrl || 'https://relay.flashbots.net';
    const networkName = await provider.getNetwork().then((n) => n.name);

    logger.info('Creating Flashbots provider', {
      relayUrl,
      networkName,
      authSigner: authSigner.address,
    });

    const flashbotsProvider = await FlashbotsBundleProvider.create(
      provider,
      authSigner,
      relayUrl,
      networkName,
    );

    logger.info('Flashbots provider created successfully');
    return flashbotsProvider;
  } catch (error) {
    logger.error('Failed to create Flashbots provider', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Send a private transaction using Flashbots
 */
export async function sendPrivateTransaction(
  flashbotsProvider: FlashbotsBundleProvider,
  transaction: FlashbotsTransactionRequest,
  signer: ethers.Wallet,
  config: ExecutorConfig,
  logger: Logger,
  provider?: ethers.Provider,
): Promise<{
  hash: string;
  wait: () => Promise<ethers.TransactionReceipt | null>;
}> {
  try {
    // Use the provider parameter or try to get block number from the flashbotsProvider
    let currentBlock: number;
    if (provider) {
      currentBlock = await provider.getBlockNumber();
    } else {
      // Try to access the provider from flashbotsProvider
      try {
        currentBlock = await (flashbotsProvider as any).provider.getBlockNumber();
      } catch {
        // Fallback if that doesn't work either
        throw new Error('Unable to get current block number - provider parameter required');
      }
    }
    const maxBlockNumber = currentBlock + (config.flashbots?.maxBlockNumber || 25);

    // Get chain ID and current fee data for the transaction
    const network = await provider!.getNetwork();
    const chainId = Number(network.chainId);
    const feeData = await provider!.getFeeData();
    
    // Calculate appropriate fees for Flashbots (must be > 0 priority fee)
    const baseFee = feeData.maxFeePerGas || BigInt(20000000000); // 20 gwei fallback
    const priorityFee = feeData.maxPriorityFeePerGas || BigInt(2000000000); // 2 gwei fallback
    
    // Add 10% buffer to ensure inclusion
    const maxFeePerGas = (baseFee * BigInt(110)) / BigInt(100);
    const maxPriorityFeePerGas = (priorityFee * BigInt(110)) / BigInt(100);

    // Create a proper EIP-1559 transaction object (required for Flashbots)
    const txRequest = {
      to: transaction.to,
      data: transaction.data,
      gasLimit: transaction.gasLimit,
      type: 2, // EIP-1559 transaction
      maxFeePerGas: transaction.gasPrice || maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas, // Must be > 0 for Flashbots
      value: transaction.value || 0,
      nonce: await provider!.getTransactionCount(signer.address),
      chainId, // Required for EIP-1559
    };

    logger.info('Sending private transaction via Flashbots', {
      to: transaction.to,
      value: transaction.value?.toString() || '0',
      maxBlockNumber,
      nonce: txRequest.nonce,
      authSigner: (flashbotsProvider as any)._authSigner?.address || 'unknown',
      fees: {
        baseFeeFromNetwork: feeData.maxFeePerGas?.toString() || 'unknown',
        priorityFeeFromNetwork: feeData.maxPriorityFeePerGas?.toString() || 'unknown',
        calculatedMaxFee: maxFeePerGas.toString(),
        calculatedPriorityFee: maxPriorityFeePerGas.toString(),
        finalMaxFee: txRequest.maxFeePerGas.toString(),
        finalPriorityFee: txRequest.maxPriorityFeePerGas.toString(),
      },
      txRequest: JSON.stringify(txRequest, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      ),
    });

    // Use sendPrivateTransaction (correct method for single transactions)
    const privateTx = {
      transaction: txRequest,
      signer,
    };

    const result = await flashbotsProvider.sendPrivateTransaction(privateTx, {
      maxBlockNumber,
      ...transaction.flashbotsOptions,
    });

    logger.info('Flashbots private transaction submitted successfully', {
      result: typeof result,
      maxBlockNumber,
      targetBlock: maxBlockNumber,
      resultKeys: Object.keys(result || {}),
    });

    // For sendPrivateTransaction, we need to extract the transaction hash properly
    // The result should be a FlashbotsTransactionResponse with transaction, wait, simulate, receipts
    let hash = 'pending';
    
    try {
      // For private transactions, the hash isn't immediately available
      // We can get it from the transaction property or it will be available after inclusion
      if ((result as any).transaction && (result as any).transaction.hash) {
        hash = (result as any).transaction.hash;
        logger.info('Got transaction hash from transaction property', { hash });
      } else {
        // For private transactions, the hash might not be immediately available
        // This is normal Flashbots behavior - hash will be available when included
        hash = 'pending-flashbots-private-tx';
        logger.info('Private transaction submitted - hash will be available after inclusion', { hash });
      }
    } catch (hashError) {
      logger.warn('Could not extract hash', {
        error: hashError instanceof Error ? hashError.message : String(hashError),
      });
      hash = 'pending-flashbots-private-tx';
    }
    
    return {
      hash,
      wait: async () => {
        try {
          logger.info('Waiting for Flashbots private transaction to be included...');
          
          // Use the wait method from the FlashbotsTransactionResponse
          const waitResult = await (result as any).wait();
          logger.info('Private transaction wait completed', {
            waitResult,
            hash,
          });
          
          // FlashbotsTransactionResolution enum values:
          // 0 = TransactionDropped
          // 1 = TransactionIncluded  
          if (waitResult === 1) {
            // TransactionIncluded - try to get the receipt
            try {
              const receipts = await (result as any).receipts();
              const receipt = receipts?.[0];
              if (receipt) {
                logger.info('Private transaction included successfully', {
                  transactionHash: receipt.transactionHash,
                  blockNumber: receipt.blockNumber,
                  hash,
                });
                return receipt;
              }
            } catch (receiptError) {
              logger.warn('Could not get receipt, but transaction was included', {
                hash,
                error: receiptError instanceof Error ? receiptError.message : String(receiptError),
              });
            }
            return null;
          } else {
            // Transaction dropped (0)
            logger.info('Private transaction was dropped', {
              hash,
              waitResult,
              targetBlock: maxBlockNumber,
            });
            return null;
          }
        } catch (error) {
          logger.error('Error while waiting for private transaction', {
            hash,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    };
  } catch (error) {
    logger.error('Failed to send private transaction', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Send a bundle of transactions using Flashbots
 */
export async function sendFlashbotsBundle(
  flashbotsProvider: FlashbotsBundleProvider,
  transactions: Array<{
    transaction: FlashbotsTransactionRequest;
    signer: ethers.Wallet;
  }>,
  targetBlockNumber: number,
  logger: Logger,
): Promise<{
  bundleHash: string;
  wait: () => Promise<boolean>;
}> {
  try {
    logger.info('Sending Flashbots bundle', {
      transactionCount: transactions.length,
      targetBlockNumber,
    });

    const result = await flashbotsProvider.sendBundle(
      transactions,
      targetBlockNumber,
    );

    // Handle bundle hash safely
    let bundleHash: string;
    try {
      if (typeof (result as any).bundleHash === 'function') {
        bundleHash = await (result as any).bundleHash();
      } else {
        bundleHash = (result as any).bundleHash || 'unknown';
      }
    } catch {
      bundleHash = 'unknown';
    }

    logger.info('Bundle submitted to Flashbots', {
      bundleHash,
      targetBlockNumber,
    });

    return {
      bundleHash,
      wait: async () => {
        try {
          if (typeof (result as any).wait === 'function') {
            const waitResult = await (result as any).wait();
            const success = waitResult === 1; // BundleIncluded
            
            logger.info('Bundle wait result', {
              bundleHash,
              success,
              waitResult,
            });
            
            return success;
          } else {
            logger.warn('Bundle wait method not available');
            return false;
          }
        } catch (error) {
          logger.error('Failed to wait for bundle', {
            bundleHash,
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        }
      },
    };
  } catch (error) {
    logger.error('Failed to send Flashbots bundle', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Simulate a transaction using Flashbots
 */
export async function simulateFlashbotsTransaction(
  flashbotsProvider: FlashbotsBundleProvider,
  transaction: FlashbotsTransactionRequest,
  signer: ethers.Wallet,
  targetBlockNumber: number,
  logger: Logger,
): Promise<{
  success: boolean;
  gasEstimate?: bigint;
  error?: string;
}> {
  try {
    const signedTx = await signer.signTransaction(transaction);
    
    logger.info('Simulating Flashbots transaction', {
      to: transaction.to,
      targetBlockNumber,
    });

    const simulation = await flashbotsProvider.simulate([signedTx], targetBlockNumber);
    
    // Handle simulation response safely
    let success = false;
    let gasEstimate: bigint | undefined = undefined;
    let error: string | undefined = undefined;

    if (simulation && typeof simulation === 'object') {
      const results = (simulation as any).results;
      if (Array.isArray(results) && results.length > 0) {
        const firstResult = results[0];
        success = !firstResult.error;
        error = firstResult.error;
        if (firstResult.gasUsed) {
          gasEstimate = BigInt(firstResult.gasUsed);
        }
      } else {
        // Fallback - consider it successful if no explicit error
        success = !(simulation as any).error;
        error = (simulation as any).error;
      }
    }
    
    logger.info('Flashbots simulation result', {
      success,
      gasEstimate: gasEstimate?.toString(),
      error,
    });

    return {
      success,
      gasEstimate,
      error,
    };
  } catch (error) {
    logger.error('Failed to simulate Flashbots transaction', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if Flashbots should be used based on configuration and network conditions
 */
export function shouldUseFlashbots(
  config: ExecutorConfig,
  provider: ethers.Provider,
  logger: Logger,
): boolean {
  if (!config.flashbots?.enabled) {
    return false;
  }

  // Add additional logic here to determine when to use Flashbots
  // For example, based on gas prices, network congestion, etc.
  
  logger.debug('Flashbots enabled and conditions met');
  return true;
}

/**
 * Cleanup stale Flashbots transactions
 */
export async function cleanupStaleFlashbotsTransactions(
  pendingTransactions: Map<string, BaseTransactionState>,
  timeoutMs: number,
  flashbotsProvider: FlashbotsBundleProvider | null,
  logger: Logger,
  errorLogger?: ErrorLogger,
): Promise<void> {
  try {
    const now = Date.now();
    const staleIds: string[] = [];

    for (const [id, state] of pendingTransactions.entries()) {
      const age = now - state.submittedAt;
      if (age > timeoutMs && state.isFlashbots) {
        staleIds.push(id);
      }
    }

    if (staleIds.length === 0) {
      return;
    }

    logger.info('Cleaning up stale Flashbots transactions', {
      count: staleIds.length,
      ageThresholdMs: timeoutMs,
    });

    for (const id of staleIds) {
      const state = pendingTransactions.get(id);
      if (!state?.hash) continue;

      try {
        // Check if transaction was included
        if (flashbotsProvider) {
          const receipt = await flashbotsProvider.provider.getTransactionReceipt(
            state.hash,
          );
          if (receipt) {
            logger.info('Stale transaction was actually included', {
              id,
              hash: state.hash,
              blockNumber: receipt.blockNumber,
            });
            state.status = 'confirmed';
            pendingTransactions.set(id, state);
            continue;
          }
        }

        // Remove stale transaction from tracking
        pendingTransactions.delete(id);
        logger.info('Removed stale Flashbots transaction', {
          id,
          hash: state.hash,
          age: Math.floor((now - state.submittedAt) / 1000) + 's',
        });
      } catch (error) {
        logger.error('Error cleaning up stale transaction', {
          id,
          hash: state.hash,
          error: error instanceof Error ? error.message : String(error),
        });

        if (errorLogger) {
          await errorLogger.error(
            error instanceof Error ? error : new Error(String(error)),
            {
              context: 'flashbots-cleanup-stale-transactions',
              transactionId: id,
              hash: state.hash,
            },
          );
        }
      }
    }
  } catch (error) {
    logger.error('Failed to cleanup stale Flashbots transactions', {
      error: error instanceof Error ? error.message : String(error),
    });

    if (errorLogger) {
      await errorLogger.error(
        error instanceof Error ? error : new Error(String(error)),
        {
          context: 'flashbots-cleanup-error',
        },
      );
    }
  }
}

/**
 * Get Flashbots user statistics
 */
export async function getFlashbotsUserStats(
  flashbotsProvider: FlashbotsBundleProvider,
  logger: Logger,
): Promise<{ isHighPriority: boolean; bundlesSent: number; bundlesIncluded: number } | null> {
  try {
    const stats = await flashbotsProvider.getUserStats();
    
    // Handle stats response safely
    if (stats && typeof stats === 'object') {
      const isHighPriority = !!(stats as any).isHighPriority;
      const bundlesSent = Number((stats as any).bundlesSent) || 0;
      const bundlesIncluded = Number((stats as any).bundlesIncluded) || 0;
      
      const result = {
        isHighPriority,
        bundlesSent,
        bundlesIncluded,
      };
      
      logger.info('Flashbots user stats retrieved', result);
      return result;
    } else {
      logger.warn('Received invalid user stats response');
      return null;
    }
  } catch (error) {
    logger.error('Failed to get Flashbots user stats', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
} 