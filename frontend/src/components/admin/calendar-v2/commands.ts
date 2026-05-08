import type {
  CalendarV2EntityVersion,
  CalendarV2IsoDateTime,
  CalendarV2SurfaceMode,
} from './domain';

export type CalendarV2CommandType =
  | 'moveAppointment'
  | 'resizeAppointment'
  | 'placeRequest'
  | 'confirmRequest'
  | 'declineRequest'
  | 'cancelAppointment'
  | 'markArrived'
  | 'markInService'
  | 'completeAppointment'
  | 'markNoShow'
  | 'archiveActionItem'
  | 'markUpdateRead';

export type CalendarV2CommandEntityKind = 'appointment' | 'demand_item' | 'action_item' | 'notification';

export interface CalendarV2CommandEntity<TEntityKind extends CalendarV2CommandEntityKind> {
  kind: TEntityKind;
  id: string;
  version?: CalendarV2EntityVersion;
}

export interface CalendarV2OptimisticMetadata {
  transactionId?: string;
  clientRequestId?: string;
  previousStartAt?: CalendarV2IsoDateTime;
  previousEndAt?: CalendarV2IsoDateTime;
  previousStaffId?: string;
  createdAt?: CalendarV2IsoDateTime;
}

export interface CalendarV2CommandBase<
  TType extends CalendarV2CommandType,
  TEntityKind extends CalendarV2CommandEntityKind,
> {
  type: TType;
  entity: CalendarV2CommandEntity<TEntityKind>;
  actorIntent: string;
  sourceSurface: CalendarV2SurfaceMode;
  requestedAt?: CalendarV2IsoDateTime;
  idempotencyKey?: string;
  localOnly?: boolean;
  optimistic?: CalendarV2OptimisticMetadata;
}

export interface CalendarV2TimeTarget {
  startAt: CalendarV2IsoDateTime;
  endAt: CalendarV2IsoDateTime;
  staffId: string;
  timezone?: string;
}

export interface MoveAppointmentCommand
  extends CalendarV2CommandBase<'moveAppointment', 'appointment'> {
  target: CalendarV2TimeTarget;
}

export interface ResizeAppointmentCommand
  extends CalendarV2CommandBase<'resizeAppointment', 'appointment'> {
  target: Pick<CalendarV2TimeTarget, 'endAt' | 'timezone'> & {
    startAt?: CalendarV2IsoDateTime;
    staffId?: string;
  };
}

export interface PlaceRequestCommand
  extends CalendarV2CommandBase<'placeRequest', 'demand_item'> {
  target: CalendarV2TimeTarget;
  createAppointmentDraft?: {
    serviceId: string;
    clientId?: string;
    clientName?: string;
    clientPhone?: string;
    notes?: string | null;
  };
}

export interface ConfirmRequestCommand
  extends CalendarV2CommandBase<'confirmRequest', 'appointment' | 'demand_item'> {
  target?: Partial<CalendarV2TimeTarget> & {
    appointmentId?: string;
    proposedTimeId?: string;
  };
}

export interface DeclineRequestCommand
  extends CalendarV2CommandBase<'declineRequest', 'appointment' | 'demand_item'> {
  reason?: string;
  notifyClient?: boolean;
}

export interface CancelAppointmentCommand
  extends CalendarV2CommandBase<'cancelAppointment', 'appointment'> {
  cancelledBy: 'owner' | 'client';
  reason?: string;
  notifyClient?: boolean;
}

export interface MarkArrivedCommand
  extends CalendarV2CommandBase<'markArrived', 'appointment'> {}

export interface MarkInServiceCommand
  extends CalendarV2CommandBase<'markInService', 'appointment'> {}

export interface CompleteAppointmentCommand
  extends CalendarV2CommandBase<'completeAppointment', 'appointment'> {
  completedAt?: CalendarV2IsoDateTime;
}

export interface MarkNoShowCommand
  extends CalendarV2CommandBase<'markNoShow', 'appointment'> {
  reason?: string;
}

export interface ArchiveActionItemCommand
  extends CalendarV2CommandBase<'archiveActionItem', 'action_item'> {
  sourceEntity?: CalendarV2CommandEntity<'appointment' | 'demand_item' | 'notification'>;
}

export interface MarkUpdateReadCommand
  extends CalendarV2CommandBase<'markUpdateRead', 'action_item' | 'notification'> {
  readAt?: CalendarV2IsoDateTime;
}

export type CalendarV2Command =
  | MoveAppointmentCommand
  | ResizeAppointmentCommand
  | PlaceRequestCommand
  | ConfirmRequestCommand
  | DeclineRequestCommand
  | CancelAppointmentCommand
  | MarkArrivedCommand
  | MarkInServiceCommand
  | CompleteAppointmentCommand
  | MarkNoShowCommand
  | ArchiveActionItemCommand
  | MarkUpdateReadCommand;
