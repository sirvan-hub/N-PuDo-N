import { Test, TestingModule } from '@nestjs/testing';
import { ParcelStateMachineService } from './parcel-state-machine.service';
import { ParcelStatus, InvalidTransitionError } from './parcel.state-machine';

describe('ParcelStateMachineService', () => {
  let service: ParcelStateMachineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ParcelStateMachineService],
    }).compile();

    service = module.get<ParcelStateMachineService>(ParcelStateMachineService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(service.canTransition(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.CUSTOMER_REQUEST)).toBe(true);
      expect(service.canTransition(ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.HUB_SELECTED)).toBe(true);
      expect(service.canTransition(ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.PUDO_ELIGIBILITY)).toBe(true);
      expect(service.canTransition(ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.HUB_SELECTED)).toBe(true);
      expect(service.canTransition(ParcelStatus.HUB_SELECTED, ParcelStatus.HANDOVER_IN_PROGRESS)).toBe(true);
      expect(service.canTransition(ParcelStatus.HANDOVER_IN_PROGRESS, ParcelStatus.TRANSFERRED_TO_HUB)).toBe(true);
      expect(service.canTransition(ParcelStatus.TRANSFERRED_TO_HUB, ParcelStatus.STORED_AT_HUB)).toBe(true);
      expect(service.canTransition(ParcelStatus.STORED_AT_HUB, ParcelStatus.READY_FOR_CUSTOMER)).toBe(true);
      expect(service.canTransition(ParcelStatus.READY_FOR_CUSTOMER, ParcelStatus.CUSTOMER_COLLECTION)).toBe(true);
      expect(service.canTransition(ParcelStatus.CUSTOMER_COLLECTION, ParcelStatus.COLLECTED)).toBe(true);
      expect(service.canTransition(ParcelStatus.COLLECTED, ParcelStatus.DELIVERED)).toBe(true);
      expect(service.canTransition(ParcelStatus.DELIVERED, ParcelStatus.SETTLEMENT)).toBe(true);
      expect(service.canTransition(ParcelStatus.FAILED_DELIVERY, ParcelStatus.SETTLEMENT)).toBe(true);
    });

    it('should return false for invalid transitions', () => {
      expect(service.canTransition(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.HUB_SELECTED)).toBe(false);
      expect(service.canTransition(ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.DELIVERY_ATTEMPT)).toBe(false);
      expect(service.canTransition(ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.DELIVERY_ATTEMPT)).toBe(false);
      expect(service.canTransition(ParcelStatus.HUB_SELECTED, ParcelStatus.READY_FOR_CUSTOMER)).toBe(false);
      expect(service.canTransition(ParcelStatus.READY_FOR_CUSTOMER, ParcelStatus.HUB_SELECTED)).toBe(false);
      expect(service.canTransition(ParcelStatus.SETTLEMENT, ParcelStatus.SETTLEMENT)).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should not throw for valid transitions', () => {
      expect(() => service.validateTransition(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.CUSTOMER_REQUEST)).not.toThrow();
      expect(() => service.validateTransition(ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.HUB_SELECTED)).not.toThrow();
      expect(() => service.validateTransition(ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.PUDO_ELIGIBILITY)).not.toThrow();
      expect(() => service.validateTransition(ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.HUB_SELECTED)).not.toThrow();
    });

    it('should throw InvalidTransitionError for invalid transitions', () => {
      expect(() => service.validateTransition(ParcelStatus.DELIVERY_ATTEMPT, ParcelStatus.HUB_SELECTED)).toThrow(InvalidTransitionError);
      expect(() => service.validateTransition(ParcelStatus.CUSTOMER_REQUEST, ParcelStatus.DELIVERY_ATTEMPT)).toThrow(InvalidTransitionError);
      expect(() => service.validateTransition(ParcelStatus.PUDO_ELIGIBILITY, ParcelStatus.DELIVERY_ATTEMPT)).toThrow(InvalidTransitionError);
      expect(() => service.validateTransition(ParcelStatus.HUB_SELECTED, ParcelStatus.READY_FOR_CUSTOMER)).toThrow(InvalidTransitionError);
    });
  });

  describe('getValidTransitions', () => {
    it('should return the correct list of valid transitions', () => {
      expect(service.getValidTransitions(ParcelStatus.CUSTOMER_REQUEST)).toEqual([
        ParcelStatus.HUB_SELECTED,
        ParcelStatus.PUDO_ELIGIBILITY,
        ParcelStatus.FAILED_DELIVERY,
      ]);
      expect(service.getValidTransitions(ParcelStatus.PUDO_ELIGIBILITY)).toEqual([
        ParcelStatus.HUB_SELECTED,
        ParcelStatus.FAILED_DELIVERY,
      ]);
      expect(service.getValidTransitions(ParcelStatus.SETTLEMENT)).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for terminal states', () => {
      expect(service.isTerminalState(ParcelStatus.SETTLEMENT)).toBe(true);
      expect(service.isTerminalState(ParcelStatus.FAILED_DELIVERY)).toBe(true);
      expect(service.isTerminalState(ParcelStatus.DELIVERED)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(service.isTerminalState(ParcelStatus.DELIVERY_ATTEMPT)).toBe(false);
      expect(service.isTerminalState(ParcelStatus.CUSTOMER_REQUEST)).toBe(false);
      expect(service.isTerminalState(ParcelStatus.HUB_SELECTED)).toBe(false);
      expect(service.isTerminalState(ParcelStatus.PUDO_ELIGIBILITY)).toBe(false);
      expect(service.isTerminalState(ParcelStatus.READY_FOR_CUSTOMER)).toBe(false);
    });
  });
});
