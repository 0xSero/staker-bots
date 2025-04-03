export enum TransactionType {
  CLAIM_REWARDS = 'CLAIM_REWARDS',
  WITHDRAW = 'WITHDRAW',
  UPDATE_DELEGATEE = 'UPDATE_DELEGATEE'
}

export interface WithdrawData {
  depositId: string
  amount: string
}

export interface UpdateDelegateeData {
  depositId: string
  newDelegatee: string
}

export interface TransactionRequest {
  type: TransactionType
  depositIds?: string[]
  depositId?: string
  amount?: string
  newDelegatee?: string
  nonce?: number
  maxFeePerGas?: string
  maxPriorityFeePerGas?: string
  gasLimit?: string
}
