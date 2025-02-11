import { config } from 'dotenv';
import { ethers } from 'ethers';

// Load environment variables
config();

// Validate required environment variables
const requiredEnvVars = [
  'RPC_URL',
  'STAKER_CONTRACT_ADDRESS',
  'CHAIN_ID'
] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

export const CONFIG = {
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
  },
  monitor: {
    rpcUrl: process.env.RPC_URL!,
    chainId: parseInt(process.env.CHAIN_ID || '42161'),
    stakerAddress: process.env.STAKER_CONTRACT_ADDRESS!,
    arbTokenAddress: process.env.ARB_TOKEN_ADDRESS || '',
    rewardCalculatorAddress: process.env.REWARD_CALCULATOR_ADDRESS || '',
    rewardNotifierAddress: process.env.REWARD_NOTIFIER_ADDRESS || '',
    startBlock: parseInt(process.env.START_BLOCK || '0'),
    logLevel: (process.env.LOG_LEVEL || 'info') as
      | 'debug'
      | 'info'
      | 'warn'
      | 'error',
    databaseType: process.env.DATABASE_TYPE === 'json' ? 'json' : 'supabase',
    pollInterval: parseInt(process.env.POLL_INTERVAL || '15'),
    maxBlockRange: parseInt(process.env.MAX_BLOCK_RANGE || '2000'),
    maxRetries: parseInt(process.env.MAX_RETRIES || '5'),
    reorgDepth: parseInt(process.env.REORG_DEPTH || '64'),
    confirmations: parseInt(process.env.CONFIRMATIONS || '20'),
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '60'),
  },
} as const;

// Helper to create provider
export const createProvider = () => {
  return new ethers.JsonRpcProvider(
    CONFIG.monitor.rpcUrl,
    CONFIG.monitor.chainId,
  );
};
