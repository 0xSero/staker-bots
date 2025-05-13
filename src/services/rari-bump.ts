/**
 * Rari Bump Bot Service
 */
import { BotService } from './bot-service'

/**
 * Specialized service for Rari Bump Bot
 */
export class RariBumpBotService extends BotService {
  constructor() {
    super('bump', 'rari')
  }
}

/**
 * Create and start the Rari Bump Bot
 */
export async function startRariBumpBot(): Promise<void> {
  const bot = new RariBumpBotService()
  
  try {
    await bot.initialize()
    await bot.start()
    
    // Handle shutdown signals
    process.on('SIGINT', async () => {
      console.log('Received SIGINT signal. Shutting down Rari Bump Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM signal. Shutting down Rari Bump Bot...')
      await bot.stop()
      process.exit(0)
    })
    
    // Log startup
    console.log('Rari Bump Bot is running')
  } catch (error) {
    console.error('Failed to start Rari Bump Bot:', error)
    process.exit(1)
  }
} 