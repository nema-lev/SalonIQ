export type CalendarV2EntityVersion = string | number;
export type CalendarV2IsoDate = string;
export type CalendarV2IsoDateTime = string;
export type CalendarV2Time = string;

export type SchedulingState =
  | 'unscheduled'
  | 'proposed'
  | 'scheduled'
  | 'rescheduled'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type RequestState =
  | 'none'
  | 'waiting'
  | 'notified'
  | 'pending'
  | 'requested'
  | 'proposal_pending'
  | 'proposal_sent'
  | 'approved'
  | 'booked'
  | 'booked_direct'
  | 'proposal_accepted'
  | 'declined'
  | 'rejected'
  | 'proposal_rejected'
  | 'cancelled'
  | 'cancelled_by_owner'
  | 'cancelled_by_client'
  | 'archived';

export type VisitProgress = 'scheduled' | 'checked_in' | 'in_service' | 'completed' | 'no_show';

export type ConfirmationState =
  | 'not_required'
  | 'needs_owner_confirmation'
  | 'needs_client_confirmation'
  | 'confirmed'
  | 'declined'
  | 'cancelled';

export type ActionState = 'none' | 'requires_action' | 'update' | 'handled' | 'archived';

export type CommunicationState = 'none' | 'pending' | 'sent' | 'delivered' | 'failed' | 'read';

export type CalendarV2DeviceMode = 'desktop' | 'tablet_landscape' | 'phone';

export type CalendarV2SurfaceMode =
  | 'desktop_scheduler'
  | 'phone_agenda'
  | 'action_inbox'
  | 'detail_drawer'
  | 'background_sync'
  | 'unknown';

export type CalendarV2SourceEntityType =
  | 'appointment'
  | 'demand_item'
  | 'waitlist'
  | 'notification'
  | 'system';

export interface CalendarV2ClientRef {
  id?: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

export interface CalendarV2ServiceRef {
  id: string;
  name: string;
  durationMinutes?: number | null;
  price?: number | null;
  color?: string | null;
}

export interface CalendarV2StaffRef {
  id: string;
  name?: string | null;
  color?: string | null;
}

export interface CalendarV2PreferredWindow {
  date: CalendarV2IsoDate | null;
  startTime: CalendarV2Time | null;
  endTime: CalendarV2Time | null;
  label?: string;
}

export interface CalendarV2ProposedTime {
  id?: string;
  startAt: CalendarV2IsoDateTime;
  endAt?: CalendarV2IsoDateTime | null;
  staff?: CalendarV2StaffRef | null;
  source: 'owner' | 'client' | 'system';
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  createdAt?: CalendarV2IsoDateTime;
}

export interface CalendarV2ActivityEvent {
  id: string;
  sourceEntityType: CalendarV2SourceEntityType;
  sourceEntityId: string;
  type:
    | 'created'
    | 'scheduled'
    | 'rescheduled'
    | 'confirmed'
    | 'declined'
    | 'cancelled'
    | 'arrived'
    | 'in_service'
    | 'completed'
    | 'no_show'
    | 'message_sent'
    | 'message_failed'
    | 'read'
    | 'archived';
  occurredAt: CalendarV2IsoDateTime;
  actor?: 'owner' | 'staff' | 'client' | 'system';
  summary?: string;
  communicationState?: CommunicationState;
}

export interface CalendarV2Appointment {
  id: string;
  version?: CalendarV2EntityVersion;
  startAt: CalendarV2IsoDateTime;
  endAt: CalendarV2IsoDateTime;
  schedulingState: SchedulingState;
  requestState: RequestState;
  visitProgress: VisitProgress;
  confirmationState: ConfirmationState;
  actionState: ActionState;
  communicationState: CommunicationState;
  client: CalendarV2ClientRef;
  service: CalendarV2ServiceRef;
  staff: CalendarV2StaffRef;
  rawStatus?: string;
  rawOwnerState?: string;
  ownerLabel?: string;
  cancelledBy?: 'client' | 'owner' | null;
  notes?: string | null;
}

export interface CalendarV2DemandItem {
  id: string;
  version?: CalendarV2EntityVersion;
  source: 'waitlist' | 'booking_request' | 'system';
  schedulingState: SchedulingState;
  requestState: RequestState;
  actionState: ActionState;
  communicationState: CommunicationState;
  client: CalendarV2ClientRef;
  service: CalendarV2ServiceRef;
  preferredWindow: CalendarV2PreferredWindow;
  preferredStaff?: CalendarV2StaffRef | null;
  proposedTime?: CalendarV2ProposedTime | null;
  bookedAppointmentId?: string | null;
  lastNotifiedSlotStartAt?: CalendarV2IsoDateTime | null;
  notes?: string | null;
  createdAt: CalendarV2IsoDateTime;
  updatedAt?: CalendarV2IsoDateTime | null;
}

export type CalendarV2Request = CalendarV2DemandItem;

export interface CalendarV2CardSummary {
  title: string;
  subtitle?: string;
  timeLabel?: string;
  staffLabel?: string | null;
  tone: 'default' | 'request' | 'cancelled' | 'completed' | 'blocked';
  actionState: ActionState;
}

export interface CalendarV2CalendarBlock {
  id: string;
  sourceEntityType: 'appointment' | 'staff_exception' | 'availability';
  sourceEntityId: string;
  kind: 'appointment' | 'blocked_time' | 'working_time' | 'closed_time';
  startAt: CalendarV2IsoDateTime;
  endAt: CalendarV2IsoDateTime;
  staffId: string;
  title: string;
  subtitle?: string;
  color?: string | null;
  schedulingState: SchedulingState;
  actionState: ActionState;
  appointment?: CalendarV2Appointment;
  cardSummary?: CalendarV2CardSummary;
}

export interface CalendarV2ActionItem {
  id: string;
  sourceEntityType: CalendarV2SourceEntityType;
  sourceEntityId: string;
  state: ActionState;
  title: string;
  summary?: string;
  dueAt?: CalendarV2IsoDateTime | null;
  createdAt?: CalendarV2IsoDateTime;
  updatedAt?: CalendarV2IsoDateTime | null;
  communicationState?: CommunicationState;
}

export interface CalendarV2Projection {
  appointments: CalendarV2Appointment[];
  demandItems: CalendarV2DemandItem[];
  calendarBlocks: CalendarV2CalendarBlock[];
  actionItems?: CalendarV2ActionItem[];
}
