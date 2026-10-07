export enum ParcelStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  DELIVERY_ATTEMPT = 'DELIVERY_ATTEMPT',
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  FAILED_DELIVERY = 'FAILED_DELIVERY',
  PUDO_ELIGIBILITY = 'PUDO_ELIGIBILITY',
  HUB_SELECTED = 'HUB_SELECTED',
  HANDOVER_IN_PROGRESS = 'HANDOVER_IN_PROGRESS',
  TRANSFERRED_TO_HUB = 'TRANSFERRED_TO_HUB',
  STORED_AT_HUB = 'STORED_AT_HUB',
  READY_FOR_CUSTOMER = 'READY_FOR_CUSTOMER',
  CUSTOMER_COLLECTION = 'CUSTOMER_COLLECTION',
  COLLECTED = 'COLLECTED',
  DELIVERED = 'DELIVERED',
  SETTLEMENT = 'SETTLEMENT',
}

export const VALID_TRANSITIONS: Record<ParcelStatus, ParcelStatus[]> = {
  [ParcelStatus.PENDING_APPROVAL]: [ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.HUB_SELECTED],
  [ParcelStatus.DELIVERY_ATTEMPT]: [ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.CUSTOMER_REQUEST]: [ParcelStatus.HUB_SELECTED, ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.FAILED_DELIVERY]: [ParcelStatus.SETTLEMENT],
  [ParcelStatus.PUDO_ELIGIBILITY]: [ParcelStatus.HUB_SELECTED, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.HUB_SELECTED]: [ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.HANDOVER_IN_PROGRESS]: [ParcelStatus.TRANSFERRED_TO_HUB, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.TRANSFERRED_TO_HUB]: [ParcelStatus.STORED_AT_HUB, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.STORED_AT_HUB]: [ParcelStatus.READY_FOR_CUSTOMER, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.READY_FOR_CUSTOMER]: [ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.CUSTOMER_COLLECTION]: [ParcelStatus.COLLECTED, ParcelStatus.DELIVERED, ParcelStatus.FAILED_DELIVERY],
  [ParcelStatus.COLLECTED]: [ParcelStatus.DELIVERED, ParcelStatus.SETTLEMENT],
  [ParcelStatus.DELIVERED]: [ParcelStatus.SETTLEMENT],
  [ParcelStatus.SETTLEMENT]: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: ParcelStatus, to: ParcelStatus) {
    super(`Invalid transition from ${from} to ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export function canTransition(from: ParcelStatus, to: ParcelStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

export function validateTransition(from: ParcelStatus, to: ParcelStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function getValidTransitions(status: ParcelStatus): ParcelStatus[] {
  return VALID_TRANSITIONS[status] || [];
}

export function isTerminalState(status: ParcelStatus): boolean {
  return [ParcelStatus.SETTLEMENT, ParcelStatus.FAILED_DELIVERY, ParcelStatus.DELIVERED].includes(status);
}

export function isHubPhase(status: ParcelStatus): boolean {
  return [ParcelStatus.TRANSFERRED_TO_HUB, ParcelStatus.STORED_AT_HUB, ParcelStatus.READY_FOR_CUSTOMER].includes(status);
}

export function isDeliveryPhase(status: ParcelStatus): boolean {
  return [ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.COLLECTED].includes(status);
}

export function isHandoverPhase(status: ParcelStatus): boolean {
  return [ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.TRANSFERRED_TO_HUB].includes(status);
}

export function isRegistrationPhase(status: ParcelStatus): boolean {
  return [ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.HUB_SELECTED].includes(status);
}

export function isSettlementPhase(status: ParcelStatus): boolean {
  return [ParcelStatus.SETTLEMENT].includes(status);
}
