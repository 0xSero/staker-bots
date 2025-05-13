/**
 * Obol Claim Bot Service
 */
import { BotService } from './bot-service'

/**
 * Specialized service for Obol Claim Bot
 */
export class ObolClaimBotService extends BotService {
  constructor() {
    super('claim', 'obol')
  }
}

/**
 * Create and start the Obol Claim Bot
 */
export async function startObolClaimBot(): Promise<void> {
  const bot = new ObolClaimBotService()
  
  try {
    await bot.initialize()
    await bot.start()
    
    // Handle shutdown signals
    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal. Shutting down Obol Claim Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal. Shutting down Obol Claim Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    // Log startup
    console.log('Obol Claim Bot is running')
  } catch (error) {
    console.error('Failed to start Obol Claim Bot:', error)
    process.exit(1)
  }
} 