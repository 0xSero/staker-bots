/**
 * Alternative entry point for staker-bots with generalized architecture
 */
import { startArbitrumClaimBot } from './services/arbitrum-claim'
import { startObolClaimBot } from './services/obol-claim'
import { startRariClaimBot } from './services/rari-claim'
import { startRariBumpBot } from './services/rari-bump'

// Command line arguments
const args = process.argv.slice(2)
const botArg = args[0]

// Start the requested bot
async function main() {
  if (!botArg) {
    console.error('Please specify a bot to run:')
    console.error('  - arbitrum-claim')
    console.error('  - obol-claim')
    console.error('  - rari-claim')
    console.error('  - rari-bump')
    process.exit(1)
  }

  console.log(`Starting ${botArg} bot...`)

  switch (botArg) {
    case 'arbitrum-claim':
      await startArbitrumClaimBot()
      break
    
    case 'obol-claim':
      await startObolClaimBot()
      break
    
    case 'rari-claim':
      await startRariClaimBot()
      break
    
    case 'rari-bump':
      await startRariBumpBot()
      break
    
    default:
      console.error(`Unknown bot: ${botArg}`)
      console.error('Available bots:')
      console.error('  - arbitrum-claim')
      console.error('  - obol-claim')
      console.error('  - rari-claim')
      console.error('  - rari-bump')
      process.exit(1)
  }
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
}) 