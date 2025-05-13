/**
 * Rari Claim Bot Service
 */
import { BotService } from './bot-service'

/**
 * Specialized service for Rari Claim Bot
 */
export class RariClaimBotService extends BotService {
  constructor() {
    super('claim', 'rari')
  }
}

/**
 * Create and start the Rari Claim Bot
 */
export async function startRariClaimBot(): Promise<void> {
  const bot = new RariClaimBotService()
  
  try {
    await bot.initialize()
    await bot.start()
    
    // Handle shutdown signals
    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal. Shutting down Rari Claim Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal. Shutting down Rari Claim Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    // Log startup
    console.log('Rari Claim Bot is running')
  } catch (error) {
    console.error('Failed to start Rari Claim Bot:', error)
    process.exit(1)
  }
} 