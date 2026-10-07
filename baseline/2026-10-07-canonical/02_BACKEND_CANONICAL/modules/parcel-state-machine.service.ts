import { Injectable, BadRequestException } from '@nestjs/common';
import { 
  ParcelStatus, 
  VALID_TRANSITIONS, 
  InvalidTransitionError, 
  canTransition, 
  validateTransition,
  getValidTransitions,
  isTerminalState,
  isHubPhase,
  isDeliveryPhase,
  isHandoverPhase,
  isRegistrationPhase,
  isSettlementPhase,
} from './parcel.state-machine';

@Injectable()
export class ParcelStateMachineService {
  validateTransition(from: ParcelStatus, to: ParcelStatus): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(
        `Invalid state transition from ${from} to ${to}. Allowed: ${this.getValidTransitions(from).join(', ')}`
      );
    }
  }

  canTransition(from: ParcelStatus, to: ParcelStatus): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  getValidTransitions(status: ParcelStatus): ParcelStatus[] {
    return VALID_TRANSITIONS[status] || [];
  }

  isTerminalState(status: ParcelStatus): boolean {
    return [ParcelStatus.SETTLEMENT, ParcelStatus.FAILED_DELIVERY].includes(status);
  }

  isHubPhase(status: ParcelStatus): boolean {
    return [ParcelStatus.TRANSFERRED_TO_HUB, ParcelStatus.STORED_AT_HUB, ParcelStatus.READY_FOR_CUSTOMER].includes(status);
  }

  isDeliveryPhase(status: ParcelStatus): boolean {
    return [ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.COLLECTED].includes(status);
  }

  isHandoverPhase(status: ParcelStatus): boolean {
    return [ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.TRANSFERRED_TO_HUB].includes(status);
  }

  isRegistrationPhase(status: ParcelStatus): boolean {
    return [ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.HUB_SELECTED].includes(status);
  }

  isSettlementPhase(status: ParcelStatus): boolean {
    return [ParcelStatus.SETTLEMENT].includes(status);
  }

  getStatusDisplayName(status: ParcelStatus): string {
    const displayNames: Record<string, string> = {
      [ParcelStatus.DELIVERY_ATTEMPT]: 'تلاش برای تحویل',
      [ParcelStatus.CUSTOMER_REQUEST]: 'درخواست مشتری',
      [ParcelStatus.FAILED_DELIVERY]: 'تحویل ناموفق',
      [ParcelStatus.PUDO_ELIGIBILITY]: 'بررسی صلاحیت PUDO',
      [ParcelStatus.HUB_SELECTED]: 'هاب انتخاب شده',
      [ParcelStatus.HANDOVER_IN_PROGRESS]: 'تحویل در حال انجام',
      [ParcelStatus.TRANSFERRED_TO_HUB]: 'منتقل شده به هاب',
      [ParcelStatus.STORED_AT_HUB]: 'ذخیره در هاب',
      [ParcelStatus.READY_FOR_CUSTOMER]: 'آماده برای مشتری',
      [ParcelStatus.CUSTOMER_COLLECTION]: 'در حال جمع‌آوری توسط مشتری',
      [ParcelStatus.COLLECTED]: 'جمع‌آوری شده',
      [ParcelStatus.SETTLEMENT]: 'تسویه',
    };
    return displayNames[status] || status;
  }

  getNextActions(status: ParcelStatus): string[] {
    const transitions = this.getValidTransitions(status as any);
    return transitions.map(t => this.getStatusDisplayName(t));
  }
}
