/**
 * Arbitrum Claim Bot Service
 */
import { BotService } from './bot-service'

/**
 * Specialized service for Arbitrum Claim Bot
 */
export class ArbitrumClaimBotService extends BotService {
  constructor() {
    super('claim', 'arbitrum')
  }
}

/**
 * Create and start the Arbitrum Claim Bot
 */
export async function startArbitrumClaimBot(): Promise<void> {
  const bot = new ArbitrumClaimBotService()
  
  try {
    await bot.initialize()
    await bot.start()
    
    // Handle shutdown signals
    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal. Shutting down Arbitrum Claim Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal. Shutting down Arbitrum Claim Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    // Log startup
    console.log('Arbitrum Claim Bot is running')
  } catch (error) {
    console.error('Failed to start Arbitrum Claim Bot:', error)
    process.exit(1)
  }
} 