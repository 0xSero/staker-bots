# Staker Bots Generalization - Implementation Guide

## Original Task

The original task was to analyze and implement a generalized structure for staker bots to support multiple chains and bot types (claim and bump), with the following requirements:

1. Create a foundation for low-effort modules (configuration, database, etc.)
2. Implement shared interfaces for core components
3. Use selective inheritance/composition for high-effort modules
4. Follow a 20-hour implementation plan

## Work Completed So Far

### 1. Directory Structure Setup

```bash
mkdir -p src/{common/{config,database,prices,simulation,errors,types},core,implementations/{arbitrum/{claim},obol/{claim},rari/{claim,bump}},services} config scripts
```

### 2. Core Interfaces Implementation

#### Base Monitor Interface (`src/core/base-monitor.ts`)
- Created `MonitorStatus` interface for monitor status reporting
- Created `BaseMonitor` interface with `start()`, `stop()`, and `getStatus()` methods

#### Base Profitability Engine Interface (`src/core/base-profitability.ts`)
- Created `ProfitabilityAction` interface for representing profitable actions
- Created `EngineStatus` interface for profitability engine status reporting
- Created `BaseProfitabilityEngine` interface with `start()`, `stop()`, `getStatus()`, and `getProfitableActions()` methods

#### Base Executor Interface (`src/core/base-executor.ts`)
- Created `TransactionResult` interface for transaction execution results
- Created `ExecutorStatus` interface for executor status reporting
- Created `BaseExecutor` interface with `start()`, `stop()`, `getStatus()`, and `queueTransaction()` methods

#### Factory Module (`src/core/factory.ts`)
- Created factory methods for instantiating appropriate implementations based on bot type and chain
- Defined `BotType` and `ChainType` types

### 3. Common Modules Implementation

#### Configuration Module
- Created configuration types (`src/common/config/types.ts`): 
  - `BaseConfig` interface for shared configuration
  - `ClaimBotConfig` interface for claim bot specific configuration
  - `BumpBotConfig` interface for bump bot specific configuration
- Created configuration loader (`src/common/config/loader.ts`) with:
  - `loadConfig()` function to load config based on bot type and chain
  - `validateConfig()` function to validate configuration

#### Database Interfaces
- Created database interfaces (`src/common/database/interfaces/database.ts`):
  - `DatabaseRecord` interface for base record type
  - `BotStatusRecord`, `TransactionRecord`, and `ProfitabilityRecord` interfaces
  - `DatabaseConnection` interface for connection management
  - `Database` interface for database operations

#### Price Feed Interfaces
- Created price feed interfaces (`src/common/prices/interfaces/price-feed.ts`):
  - `TokenPrice` interface for token price information
  - `GasEstimate` interface for gas price estimates
  - `PriceFeed` interface for price feed operations

#### Error Handling Module
- Created error handling module (`src/common/errors/index.ts`):
  - `ErrorType` enum for error categorization
  - `ErrorSeverity` enum for error severity levels
  - `BotError` interface for standardized errors
  - `ErrorLogger` interface for error logging
  - `ConsoleErrorLogger` implementation

#### Simulation Interfaces
- Created transaction simulation interfaces (`src/common/simulation/interfaces/simulator.ts`):
  - `SimulationCall` interface for simulation parameters
  - `SimulationResult` interface for simulation results
  - `Simulator` interface for simulation operations

#### Shared Types
- Created shared types (`src/common/types/index.ts`):
  - `BotType` and `ChainType` types
  - `BotStatus` interface for unified bot status
  - `ClaimEvent` and `BumpEvent` interfaces for event handling

### 4. Configuration Templates

Created environment file templates for each chain:
- `config/arbitrum.env.example`
- `config/obol.env.example`
- `config/rari.env.example`

### 5. Service Implementation

#### Base Bot Service (`src/services/bot-service.ts`)
- Created `BotService` class to coordinate monitor, profitability engine, and executor
- Implemented initialization, start, stop, and status methods

#### Chain-Specific Bot Services
- Created `ArbitrumClaimBotService` (`src/services/arbitrum-claim.ts`)
- Created `ObolClaimBotService` (`src/services/obol-claim.ts`)
- Created `RariClaimBotService` (`src/services/rari-claim.ts`) 
- Created `RariBumpBotService` (`src/services/rari-bump.ts`)

### 6. Entry Point and Documentation

- Created alternative entry point (`src/entry.ts`) that uses the new bot services
- Created script to run bots (`scripts/start-bot.ts`)
- Created documentation (`README-new-structure.md`) explaining the new architecture

## Next Task: Adapt Existing Implementation to New Architecture

The next task is to adapt the existing implementation to fit our new architecture. Here's a detailed step-by-step plan:

### 1. Analyze Existing Implementation

#### Key Files to Analyze

| Category | Old Files | Purpose |
|----------|-----------|---------|
| Configuration | `src/configuration/*.ts` | Configuration handling |
| Database | `src/database/*.ts` | Database operations |
| Monitor | `src/monitor/*.ts` | Event monitoring |
| Profitability | `src/profitability/*.ts` | Profitability calculations |
| Executor | `src/executor/*.ts` | Transaction execution |

### 2. Create Specific Implementations 

#### A. Arbitrum Claim Bot Implementation

1. **Monitor Implementation**
   - Create `src/implementations/arbitrum/claim/monitor.ts`:
   ```typescript
   // src/implementations/arbitrum/claim/monitor.ts
   import { BaseMonitor, MonitorStatus } from '../../../core/base-monitor'
   import { ClaimBotConfig } from '../../../common/config'
   import { loadConfig } from '../../../common/config/loader'
   import { createBotError, ErrorType, ErrorSeverity } from '../../../common/errors'
   // Import existing monitor code and adapt it...
   
   export default class ArbitrumClaimMonitor implements BaseMonitor {
     private config: ClaimBotConfig
     private isRunning = false
     // Add other required properties...
     
     constructor() {
       this.config = loadConfig('claim', 'arbitrum') as ClaimBotConfig
       // Initialize other properties...
     }
     
     async start(): Promise<void> {
       // Implementation based on existing monitor code...
     }
     
     async stop(): Promise<void> {
       // Implementation based on existing monitor code...
     }
     
     async getStatus(): Promise<MonitorStatus> {
       // Implementation based on existing monitor code...
     }
   }
   ```

2. **Profitability Implementation**
   - Create `src/implementations/arbitrum/claim/profitability.ts`:
   ```typescript
   // src/implementations/arbitrum/claim/profitability.ts
   import { BaseProfitabilityEngine, EngineStatus, ProfitabilityAction } from '../../../core/base-profitability'
   import { ClaimBotConfig } from '../../../common/config'
   import { loadConfig } from '../../../common/config/loader'
   import { createBotError, ErrorType, ErrorSeverity } from '../../../common/errors'
   // Import existing profitability code and adapt it...
   
   export default class ArbitrumClaimProfitability implements BaseProfitabilityEngine {
     private config: ClaimBotConfig
     private isRunning = false
     // Add other required properties...
     
     constructor() {
       this.config = loadConfig('claim', 'arbitrum') as ClaimBotConfig
       // Initialize other properties...
     }
     
     async start(): Promise<void> {
       // Implementation based on existing profitability code...
     }
     
     async stop(): Promise<void> {
       // Implementation based on existing profitability code...
     }
     
     async getStatus(): Promise<EngineStatus> {
       // Implementation based on existing profitability code...
     }
     
     async getProfitableActions(): Promise<ProfitabilityAction[]> {
       // Implementation based on existing profitability code...
     }
   }
   ```

3. **Executor Implementation**
   - Create `src/implementations/arbitrum/claim/executor.ts`:
   ```typescript
   // src/implementations/arbitrum/claim/executor.ts
   import { BaseExecutor, ExecutorStatus, TransactionResult } from '../../../core/base-executor'
   import { ClaimBotConfig } from '../../../common/config'
   import { loadConfig } from '../../../common/config/loader'
   import { createBotError, ErrorType, ErrorSeverity } from '../../../common/errors'
   // Import existing executor code and adapt it...
   
   export default class ArbitrumClaimExecutor implements BaseExecutor {
     private config: ClaimBotConfig
     private isRunning = false
     // Add other required properties...
     
     constructor() {
       this.config = loadConfig('claim', 'arbitrum') as ClaimBotConfig
       // Initialize other properties...
     }
     
     async start(): Promise<void> {
       // Implementation based on existing executor code...
     }
     
     async stop(): Promise<void> {
       // Implementation based on existing executor code...
     }
     
     async getStatus(): Promise<ExecutorStatus> {
       // Implementation based on existing executor code...
     }
     
     async queueTransaction(params: {
       to: string
       data: string
       value?: bigint
       gasLimit?: bigint
       maxFeePerGas?: bigint
       maxPriorityFeePerGas?: bigint
       metadata?: Record<string, any>
     }): Promise<TransactionResult> {
       // Implementation based on existing executor code...
     }
   }
   ```

#### B. Obol Claim Bot Implementation

The Obol Claim Bot implementation has been created following the guidelines and structure outlined in this document. The implementation includes:

1. **Monitor Implementation** (`src/implementations/obol/claim/monitor.ts`):
   - Created `ObolClaimMonitor` class that extends `EventEmitter` and implements `BaseMonitor` interface
   - Implemented block processing logic to detect claim events on the Obol chain
   - Added error handling with retry mechanism for resilience
   - Incorporated event filtering to identify relevant claim events
   - Set up database interaction for persisting monitor state

2. **Profitability Engine Implementation** (`src/implementations/obol/claim/profitability.ts`):
   - Created `ObolClaimProfitabilityEngine` class implementing `BaseProfitabilityEngine` interface
   - Implemented logic to identify claimable deposits
   - Added profitability calculation to determine if claiming rewards is cost-effective
   - Set up periodic checks for new profitable claim opportunities
   - Added gas cost estimation and reward value calculation

This implementation serves as a complete example of how to adapt existing monitoring and profitability logic into our new architecture. The components follow the same patterns as the original implementation but are focused specifically on claim events in the Obol protocol.

Next steps for the Obol Claim Bot implementation:
1. Create `src/implementations/obol/claim/executor.ts` based on existing executor implementation
2. Complete integration tests for the Obol Claim Bot

#### C. Rari Claim Bot Implementation

Follow the same pattern, adapting the implementation for Rari claim:
1. Create `src/implementations/rari/claim/monitor.ts`
2. Create `src/implementations/rari/claim/profitability.ts`
3. Create `src/implementations/rari/claim/executor.ts`

#### D. Rari Bump Bot Implementation

Follow the same pattern, adapting the implementation for Rari bump:
1. Create `src/implementations/rari/bump/monitor.ts`
2. Create `src/implementations/rari/bump/profitability.ts`
3. Create `src/implementations/rari/bump/executor.ts`

### 3. Database Implementation

1. **Create JSON Database Implementation**
   - Create `src/database/json/index.ts` adapting the existing JSON database implementation

2. **Create Supabase Database Implementation**
   - Create `src/database/supabase/index.ts` adapting the existing Supabase implementation

### 4. Price Feed Implementation

1. **Create Provider-based Price Feed**
   - Create `src/prices/provider/index.ts` adapting existing price feed implementations

### 5. Update Common Modules Based on Existing Code

1. **Update Configuration**
   - Make sure all necessary configuration options from the existing code are included

2. **Update Error Handling**
   - Ensure all error types and logging from the existing code are incorporated

### 6. Create Database Factory

1. **Create Database Factory**
   - Create `src/common/database/factory.ts` to create the appropriate database implementation

### 7. Create Price Feed Factory

1. **Create Price Feed Factory**
   - Create `src/common/prices/factory.ts` to create the appropriate price feed implementation

### 8. Testing and Validation

1. **Create Test Environment Files**
   - Create `.env.arbitrum`, `.env.obol`, and `.env.rari` with test values

2. **Run Single Bot Test**
   - Test `npx tsx scripts/start-bot.ts arbitrum-claim`
   - Verify all components start correctly
   - Verify monitoring, profitability calculations, and transaction execution work

3. **Test Each Bot Type**
   - Test each bot type to ensure all implementations work correctly

### 9. Update Documentation

1. **Update README**
   - Update the main README.md with information about the new architecture

2. **Create Implementation Guide**
   - Create a detailed implementation guide for developers

### 10. Update Package.json Scripts

1. **Add New Scripts**
   - Add scripts to package.json for running each bot type

## Step-by-Step Adaptation Guide

1. **Start with one bot type (Arbitrum Claim)**
   - Focus on getting one complete bot implementation working first
   - Use the existing code as a reference

2. **Create Stubs First**
   - Create stub implementations for all required components
   - Test the end-to-end flow with minimal functionality

3. **Incrementally Add Features**
   - Progressively add features from the existing codebase
   - Test after each significant addition

4. **Refactor Common Code**
   - Identify common patterns across different implementations
   - Move them to shared utilities

5. **Adapt More Bot Types**
   - Once the first bot is working, adapt the implementation for other types

## Guidelines for Adaptation

1. **Keep Interfaces Consistent**
   - Ensure all implementations follow the base interfaces closely
   - Don't add public methods that aren't in the base interfaces

2. **Follow Factory Pattern**
   - Use the factory pattern for creating components
   - Don't hardcode implementation details in higher-level components

3. **Maintain Configuration Isolation**
   - Keep configuration for different chains and bot types separate
   - Use the appropriate configuration for each implementation

4. **Error Handling**
   - Use the standardized error handling approach
   - Log errors consistently

5. **Testing**
   - Test each component in isolation
   - Test the end-to-end flow for each bot type 