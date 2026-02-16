/**
 * Contract Module Constants
 * Centralized enums and business rules for contract management
 * Used across validation, service, and model layers
 */

// Contract status enumeration
export const CONTRACT_STATUS = {
  PENDING: 'pending',           // Contract created, awaiting freelancer acceptance
  ACTIVE: 'active',             // Work in progress
  IN_REVIEW: 'in_review',       // Work submitted, awaiting client approval
  COMPLETED: 'completed',       // Work approved, payment released
  CLOSED: 'closed',             // Final state, archived
  CANCELLED: 'cancelled',       // Cancelled by client or freelancer
  DISPUTED: 'disputed',         // Dispute raised
  TERMINATED: 'terminated',     // Terminated by platform/admin
};

// Milestone status enumeration
export const MILESTONE_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  REVISION_REQUESTED: 'revision_requested',
  COMPLETED: 'completed',
  DISPUTED: 'disputed',
};

// Milestone status transition rules
export const ALLOWED_MILESTONE_TRANSITIONS = {
  [MILESTONE_STATUS.PENDING]: [MILESTONE_STATUS.IN_PROGRESS],
  [MILESTONE_STATUS.IN_PROGRESS]: [MILESTONE_STATUS.IN_REVIEW],
  [MILESTONE_STATUS.IN_REVIEW]: [
    MILESTONE_STATUS.COMPLETED,
    MILESTONE_STATUS.REVISION_REQUESTED,
    MILESTONE_STATUS.DISPUTED,
  ],
  [MILESTONE_STATUS.REVISION_REQUESTED]: [MILESTONE_STATUS.IN_PROGRESS],
  [MILESTONE_STATUS.COMPLETED]: [], // Terminal
  [MILESTONE_STATUS.DISPUTED]: [MILESTONE_STATUS.IN_PROGRESS, MILESTONE_STATUS.COMPLETED],
};

// Helper function to check if milestone status transition is allowed
export const isMilestoneTransitionAllowed = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true;
  const allowed = ALLOWED_MILESTONE_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
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
    CONTRACT_STATUS.IN_REVIEW,
    CONTRACT_STATUS.COMPLETED,
    CONTRACT_STATUS.CANCELLED,
    CONTRACT_STATUS.DISPUTED,
    CONTRACT_STATUS.TERMINATED,
  ],
  [CONTRACT_STATUS.IN_REVIEW]: [
    CONTRACT_STATUS.ACTIVE,        // Request revision
    CONTRACT_STATUS.COMPLETED,     // Approve work
    CONTRACT_STATUS.DISPUTED,      // Raise dispute
  ],
  [CONTRACT_STATUS.DISPUTED]: [
    CONTRACT_STATUS.ACTIVE,
    CONTRACT_STATUS.TERMINATED,
  ],
  [CONTRACT_STATUS.COMPLETED]: [
    CONTRACT_STATUS.CLOSED,        // Auto-close after review period
  ],
  // Terminal states - no transitions allowed
  [CONTRACT_STATUS.CLOSED]: [],
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
  CONTRACT_STATUS.CLOSED,
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
