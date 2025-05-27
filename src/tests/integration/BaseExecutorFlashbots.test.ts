import { ethers } from 'ethers';
import { DatabaseWrapper } from '@/database';
import { ConsoleLogger } from '@/monitor/logging';
import { BaseExecutor } from '@/executor/strategies/BaseExecutor';
import { ExecutorConfig, FlashbotsTransactionRequest } from '@/executor/interfaces/types';
import { CONFIG } from '@/configuration';
import { govlstAbi } from '@/configuration/abis';

// Test constants
const TEST_PRIVATE_KEY = CONFIG.executor.privateKey

describe('BaseExecutor Flashbots Approve Transaction', () => {
  let database: DatabaseWrapper;
  let provider: ethers.JsonRpcProvider;
  let executor: BaseExecutor;
  let logger: ConsoleLogger;
  let wallet: ethers.Wallet;

  beforeAll(async () => {
    logger = new ConsoleLogger('info');
    
    // Initialize database
    database = new DatabaseWrapper({ type: 'json' });

    // Initialize provider - use real RPC URL from config
    provider = new ethers.JsonRpcProvider(CONFIG.monitor.rpcUrl);
    
    // Get network info for debugging
    const network = await provider.getNetwork();
    logger.info('Connected to network:', {
      name: network.name,
      chainId: network.chainId.toString(),
      rpcUrl: CONFIG.monitor.rpcUrl,
    });
    
    // Initialize wallet
    wallet = new ethers.Wallet(TEST_PRIVATE_KEY, provider);

    // Verify we have a separate auth key for Flashbots
    const flashbotsAuthKey = CONFIG.executor.flashbots.authKey;
    if (!flashbotsAuthKey) {
      throw new Error('FLASHBOTS_AUTH_PRIVATE_KEY environment variable is required for Flashbots tests');
    }
    
    if (flashbotsAuthKey === TEST_PRIVATE_KEY) {
      logger.warn('⚠️  Auth key is same as transaction key - this may cause issues with Flashbots');
    }

    logger.info('Flashbots configuration:', {
      authKeySet: !!flashbotsAuthKey,
      authKeyLength: flashbotsAuthKey.length,
      transactionSigner: wallet.address,
      authSigner: new ethers.Wallet(flashbotsAuthKey).address,
      sameKey: flashbotsAuthKey === TEST_PRIVATE_KEY,
    });

    // Create executor config with Flashbots enabled using separate auth key
    const executorConfig: ExecutorConfig = {
      wallet: {
        privateKey: TEST_PRIVATE_KEY,
        minBalance: ethers.parseEther('0.01'),
        maxPendingTransactions: 5,
      },
      maxQueueSize: 100,
      minConfirmations: 2,
      maxRetries: 3,
      retryDelayMs: 5000,
      transferOutThreshold: ethers.parseEther('0.5'),
      gasBoostPercentage: 25,
      concurrentTransactions: 3,
      defaultTipReceiver: CONFIG.executor.tipReceiver,
      minProfitMargin: 10,
      staleTransactionThresholdMinutes: 5,
      // Enable Flashbots for private transactions with separate auth key
      flashbots: {
        enabled: true,
        authKey: CONFIG.executor.flashbots.authKey, // 🔥 Use separate auth key from config
        relayUrl: 'https://relay.flashbots.net',
        mode: 'fast',
        maxBlockNumber: 25,
      },
    };

    // Initialize BaseExecutor with real LST contract address from config
    executor = new BaseExecutor({
      contractAddress: CONFIG.govlst.address,
      contractAbi: new ethers.Interface(govlstAbi),
      provider: provider,
      config: executorConfig,
    });

    executor.setDatabase(database);
    await executor.start();
  });

  afterAll(async () => {
    await executor.stop();
  });

  it('should approve LST contract to spend reward tokens via Flashbots', async () => {
    const rewardTokenAddress = CONFIG.profitability.rewardTokenAddress;
    const lstContractAddress = CONFIG.govlst.address;
    const approvalAmount = CONFIG.executor.approvalAmount;

    expect(rewardTokenAddress).toBeTruthy();
    expect(lstContractAddress).toBeTruthy();

    logger.info('Starting Flashbots approve transaction:', {
      rewardTokenAddress,
      lstContractAddress,
      walletAddress: wallet.address,
      approvalAmount,
    });

    // Create reward token contract interface for approve
    const tokenAbi = [
      'function approve(address spender, uint256 amount) returns (bool)',
      'function allowance(address owner, address spender) view returns (uint256)',
    ];
    
    const rewardTokenContract = new ethers.Contract(rewardTokenAddress, tokenAbi, wallet);

    // Check current allowance
    const currentAllowance = await rewardTokenContract.allowance!(wallet.address, lstContractAddress);
    logger.info('Current allowance:', { currentAllowance: currentAllowance.toString() });

    // Only approve if allowance is insufficient
    const approvalAmountBigInt = BigInt(approvalAmount);
    if (currentAllowance < approvalAmountBigInt) {
      // Create approve transaction data
      const approveData = rewardTokenContract.interface.encodeFunctionData('approve', [
        lstContractAddress,
        approvalAmountBigInt,
      ]);

      // Get current network info
      const currentBlock = await provider.getBlockNumber();
      const feeData = await provider.getFeeData();

      // Create Flashbots transaction request
      const flashbotsRequest: FlashbotsTransactionRequest = {
        to: rewardTokenAddress,
        data: approveData,
        gasLimit: BigInt(60000),
        gasPrice: feeData.gasPrice || BigInt(20000000000),
        value: 0,
        isFlashbots: true,
        flashbotsOptions: {
          maxBlockNumber: currentBlock + 25,
        },
      };

      logger.info('Submitting approve transaction to Flashbots...');

      try {
        // Get Flashbots provider from executor
        const flashbotsProvider = (executor as any).flashbotsProvider;
        expect(flashbotsProvider).toBeTruthy();

        // Submit via Flashbots
        const { sendPrivateTransaction } = await import('@/executor/strategies/helpers/flashbots-helpers');
        const result = await sendPrivateTransaction(
          flashbotsProvider,
          flashbotsRequest,
          wallet,
          (executor as any).config,
          logger,
          provider, // Pass the provider for getBlockNumber
        );

        expect(result.hash).toBeDefined();
        // For Flashbots private transactions, hash may be 'pending' initially
        // This is expected behavior - the actual hash will be available when included
        const isValidHash = result.hash.startsWith('0x') || result.hash.includes('pending');
        expect(isValidHash).toBe(true);

        logger.info('✅ Flashbots approve transaction submitted successfully!', {
          transactionHash: result.hash,
          rewardToken: rewardTokenAddress,
          lstContract: lstContractAddress,
          approvalAmount,
          note: 'Hash may be pending until transaction is included in a block',
        });

      } catch (error) {
        logger.error('Flashbots submission failed:', {
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    } else {
      logger.info('Approval not needed - sufficient allowance already exists');
    }
  });
}); 