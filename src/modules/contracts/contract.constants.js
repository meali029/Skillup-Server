/**
 * Contract Module Constants
 * Centralized enums and business rules for contract management
 * Used across validation, service, and model layers
 */

// Contract status enumeration
export const CONTRACT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
  TERMINATED: 'terminated',
};

// Milestone status enumeration
export const MILESTONE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  DISPUTED: 'disputed',
};

// Payment type enumeration
export const PAYMENT_TYPE = {
  FIXED: 'fixed',
  HOURLY: 'hourly',
  MILESTONE: 'milestone',
};

// Contract status transition rules
// Defines which status transitions are allowed
// Used for validation in service layer
export const ALLOWED_STATUS_TRANSITIONS = {
  [CONTRACT_STATUS.PENDING]: [
    CONTRACT_STATUS.ACTIVE,
    CONTRACT_STATUS.CANCELLED,
  ],
  [CONTRACT_STATUS.ACTIVE]: [
    CONTRACT_STATUS.COMPLETED,
    CONTRACT_STATUS.CANCELLED,
    CONTRACT_STATUS.DISPUTED,
    CONTRACT_STATUS.TERMINATED,
  ],
  [CONTRACT_STATUS.DISPUTED]: [
    CONTRACT_STATUS.ACTIVE,
    CONTRACT_STATUS.TERMINATED,
  ],
  // Terminal states - no transitions allowed
  [CONTRACT_STATUS.COMPLETED]: [],
  [CONTRACT_STATUS.CANCELLED]: [],
  [CONTRACT_STATUS.TERMINATED]: [],
};

// Statuses that allow milestone addition
export const MILESTONE_EDITABLE_STATUSES = [
  CONTRACT_STATUS.PENDING,
  CONTRACT_STATUS.ACTIVE,
];

// Statuses that allow contract modification
export const MODIFIABLE_CONTRACT_STATUSES = [
  CONTRACT_STATUS.PENDING,
  CONTRACT_STATUS.ACTIVE,
  CONTRACT_STATUS.DISPUTED,
];

// Terminal statuses (cannot be changed once reached)
export const TERMINAL_STATUSES = [
  CONTRACT_STATUS.COMPLETED,
  CONTRACT_STATUS.CANCELLED,
  CONTRACT_STATUS.TERMINATED,
];

// Helper function to check if status transition is allowed
export const isStatusTransitionAllowed = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true;
  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[currentStatus] || [];
  return allowedTransitions.includes(newStatus);
};

// Helper function to check if contract can be modified
export const isContractModifiable = (status) => {
  return MODIFIABLE_CONTRACT_STATUSES.includes(status);
};

// Helper function to check if milestones can be added
export const canAddMilestones = (status) => {
  return MILESTONE_EDITABLE_STATUSES.includes(status);
};

// Helper function to check if status is terminal
export const isTerminalStatus = (status) => {
  return TERMINAL_STATUSES.includes(status);
};
