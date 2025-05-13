import { BigNumberish } from 'ethers'

export interface BaseEvent {
  blockNumber: number
  transactionHash: string
}

export interface StakeDepositedEvent extends BaseEvent {
  depositId: string
  ownerAddress: string
  depositorAddress: string
  delegateeAddress: string
  amount: BigNumberish
}

export interface StakeWithdrawnEvent extends BaseEvent {
  depositId: string
  withdrawnAmount: BigNumberish
}

export interface DelegateeAlteredEvent extends BaseEvent {
  depositId: string
  oldDelegatee: string
  newDelegatee: string
}

export interface StakedWithAttributionEvent extends BaseEvent {
  depositId: string
  amount: BigNumberish
  referrer: string
}

export interface UnstakedEvent extends BaseEvent {
  account: string
  amount: BigNumberish
}

export interface DepositInitializedEvent extends BaseEvent {
  delegatee: string
  depositId: string
}

export interface DepositUpdatedEvent extends BaseEvent {
  holder: string
  oldDepositId: string
  newDepositId: string
}

export interface ClaimerAlteredEvent extends BaseEvent {
  depositId: string
  oldClaimer: string
  newClaimer: string
  earningPower: BigNumberish
}

export interface RewardClaimedEvent extends BaseEvent {
  depositId: string
  claimer: string
  amount: BigNumberish
  earningPower: BigNumberish
}

export interface DepositSubsidizedEvent extends BaseEvent {
  depositId: string
  amount: BigNumberish
}

export interface EarningPowerBumpedEvent extends BaseEvent {
  depositId: string
  oldEarningPower: BigNumberish
  newEarningPower: BigNumberish
  bumper: string
  tipReceiver: string
  tipAmount: BigNumberish
}

export interface EventGroup {
  deposited?: any
  lstDeposited?: any
  altered?: any
  stakedWithAttribution?: any
  unstaked?: any
  depositInitialized?: any
  depositUpdated?: any
  claimerAltered?: any
  rewardClaimed?: any
  depositSubsidized?: any
  earningPowerBumped?: any
  rewardNotified?: any
}

export interface TransactionEntry {
  txHash: string
  events: EventGroup
  blockNumber: number
} 