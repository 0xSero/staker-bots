# Staker Bots - Generalized Architecture

This is a generalized architecture for staker bots that supports multiple chains and bot types.

## Architecture

The architecture is based on a modular design with the following components:

- **Common**: Shared utilities and interfaces
  - **Config**: Configuration management
  - **Database**: Database abstraction layer
  - **Prices**: Price feed and gas estimation
  - **Simulation**: Transaction simulation
  - **Errors**: Error handling
  - **Types**: Shared type definitions

- **Core**: Core interfaces and factories
  - **BaseMonitor**: Base interface for monitors
  - **BaseProfitability**: Base interface for profitability engines
  - **BaseExecutor**: Base interface for executors
  - **Factory**: Factory methods for creating component instances

- **Implementations**: Chain and bot-specific implementations
  - **Arbitrum/Claim**: Arbitrum-specific claim bot implementation
  - **Obol/Claim**: Obol-specific claim bot implementation
  - **Rari/Claim**: Rari-specific claim bot implementation
  - **Rari/Bump**: Rari-specific bump bot implementation

- **Services**: Service wrappers for each bot type
  - **BotService**: Base service that coordinates the components
  - **ArbitrumClaimBotService**: Arbitrum claim bot service
  - **ObolClaimBotService**: Obol claim bot service
  - **RariClaimBotService**: Rari claim bot service
  - **RariBumpBotService**: Rari bump bot service

## Generalization Approach

The architecture follows a hybrid approach:

1. **Common Layer**: Shared code for all bots (configuration, database, etc.)
2. **Shared Interfaces**: Core interfaces for main components
3. **Selective Inheritance/Composition**: Specialized implementations where needed

## Running a Bot

To run a bot, use the following command:

```bash
npx tsx scripts/start-bot.ts <bot-type>
```

Where `<bot-type>` is one of:
- `arbitrum-claim`: Arbitrum claim bot
- `obol-claim`: Obol claim bot
- `rari-claim`: Rari claim bot 
- `rari-bump`: Rari bump bot

## Configuration

Each bot requires a specific configuration file. Copy the appropriate template from the `config` directory:

```bash
cp config/arbitrum.env.example .env.arbitrum
cp config/obol.env.example .env.obol
cp config/rari.env.example .env.rari
```

Then edit the file to add your specific configuration values.

## Implementing a New Bot

To implement a new bot:

1. Create a new directory in `src/implementations/<chain>/<bot-type>`
2. Implement the required components:
   - `monitor.ts`: Implements `BaseMonitor`
   - `profitability.ts`: Implements `BaseProfitabilityEngine`
   - `executor.ts`: Implements `BaseExecutor`
3. Create a service in `src/services/<chain>-<bot-type>.ts`
4. Add the bot to the entry point in `src/entry.ts`

## Benefits of This Architecture

- **Code Reuse**: Common functionality is shared across all bots
- **Flexibility**: Specialized implementations where needed
- **Maintainability**: Clean separation of concerns
- **Extensibility**: Easy to add new bot types and chains 