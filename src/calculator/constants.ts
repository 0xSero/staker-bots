export const REWARD_CALCULATOR_ABI = [
  'function getEarningPower(uint256 amountStaked, address staker, address delegatee) view returns (uint256)',
  'function getNewEarningPower(uint256 amountStaked, address staker, address delegatee, uint256 oldEarningPower) view returns (uint256, bool)',
  'event ScoreUpdated(address indexed delegatee, uint256 score, uint256 blockNumber)',
];
