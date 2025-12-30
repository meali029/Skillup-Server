import {
  CONTRACT_STATUS,
  MILESTONE_STATUS,
  PAYMENT_TYPE,
  isStatusTransitionAllowed,
  isContractModifiable,
  canAddMilestones,
  isTerminalStatus,
} from '../../../modules/contracts/contract.constants.js';

describe('Contract constants and helpers', () => {
  test('enums are defined', () => {
    expect(CONTRACT_STATUS.PENDING).toBe('pending');
    expect(MILESTONE_STATUS.COMPLETED).toBe('completed');
    expect(PAYMENT_TYPE.FIXED).toBe('fixed');
  });

  test('isStatusTransitionAllowed works', () => {
    expect(isStatusTransitionAllowed(CONTRACT_STATUS.PENDING, CONTRACT_STATUS.ACTIVE)).toBe(true);
    expect(isStatusTransitionAllowed(CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.PENDING)).toBe(false);
    // same status allowed
    expect(isStatusTransitionAllowed(CONTRACT_STATUS.ACTIVE, CONTRACT_STATUS.ACTIVE)).toBe(true);
  });

  test('isContractModifiable / canAddMilestones / isTerminalStatus', () => {
    expect(isContractModifiable(CONTRACT_STATUS.PENDING)).toBe(true);
    expect(canAddMilestones(CONTRACT_STATUS.ACTIVE)).toBe(true);
    expect(isTerminalStatus(CONTRACT_STATUS.COMPLETED)).toBe(true);
    expect(isTerminalStatus('nonexistent')).toBe(false);
  });
});