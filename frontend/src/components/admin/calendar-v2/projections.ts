import type {
  Appointment,
  CalendarBoardResponse,
  Service,
  WaitlistEntry,
} from '../calendar-model';
import {
  getCalendarOwnerState,
  getEventDurationMinutes,
  getRequestWindowLabel,
  isCancelledCalendarItem,
  isRequestOwnerState,
} from '../calendar-model';
import type {
  ActionState,
  CalendarV2Appointment,
  CalendarV2CalendarBlock,
  CalendarV2CardSummary,
  CalendarV2DemandItem,
  CalendarV2Projection,
  CommunicationState,
  ConfirmationState,
  RequestState,
  SchedulingState,
  VisitProgress,
} from './domain';

export type CalendarV2ProjectionInput = Pick<CalendarBoardResponse, 'appointments' | 'waitlist'> | {
  appointments?: Appointment[];
  waitlist?: WaitlistEntry[];
};

export interface BuildCalendarV2ProjectionOptions {
  services?: Service[];
  serviceMap?: Map<string, Service>;
}

const REQUEST_STATES = new Set(['pending', 'requested', 'proposal_pending', 'proposal_sent']);
const DECLINED_STATES = new Set(['rejected', 'proposal_rejected']);

export function projectAppointmentToCalendarBlock(appointment: Appointment): CalendarV2CalendarBlock {
  const projectedAppointment = projectAppointmentToV2Appointment(appointment);

  return {
    id: appointment.id,
    sourceEntityType: 'appointment',
    sourceEntityId: appointment.id,
    kind: 'appointment',
    startAt: appointment.start_at,
    endAt: appointment.end_at,
    staffId: appointment.staff_id,
    title: appointment.client_name,
    subtitle: appointment.service_name,
    color: appointment.service_color || appointment.staff_color || null,
    schedulingState: projectedAppointment.schedulingState,
    actionState: projectedAppointment.actionState,
    appointment: projectedAppointment,
    cardSummary: getCalendarV2CardSummary(projectedAppointment),
  };
}

export function projectAppointmentToV2Appointment(appointment: Appointment): CalendarV2Appointment {
  const ownerState = getCalendarOwnerState(appointment);
  const schedulingState = getAppointmentSchedulingState(appointment);
  const requestState = getAppointmentRequestState(ownerState, appointment.status);
  const confirmationState = getAppointmentConfirmationState(appointment, ownerState);

  return {
    id: appointment.id,
    startAt: appointment.start_at,
    endAt: appointment.end_at,
    schedulingState,
    requestState,
    visitProgress: appointment.visit_progress ?? getVisitProgressFromStatus(appointment.status),
    confirmationState,
    actionState: getAppointmentActionState(appointment, ownerState),
    communicationState: 'none',
    client: {
      name: appointment.client_name,
      phone: appointment.client_phone,
    },
    service: {
      id: appointment.service_id,
      name: appointment.service_name,
      durationMinutes: getEventDurationMinutes(appointment.start_at, appointment.end_at),
      price: appointment.price,
      color: appointment.service_color,
    },
    staff: {
      id: appointment.staff_id,
      name: appointment.staff_name,
      color: appointment.staff_color,
    },
    rawStatus: appointment.status,
    rawOwnerState: ownerState,
    ownerLabel: appointment.owner_view_label,
    cancelledBy: appointment.cancelled_by ?? null,
    notes: appointment.internal_notes,
  };
}

export function projectWaitlistEntryToDemandItem(
  entry: WaitlistEntry,
  options: { serviceDurationMinutes?: number | null } = {},
): CalendarV2DemandItem {
  return {
    id: entry.id,
    source: 'waitlist',
    schedulingState: getWaitlistSchedulingState(entry),
    requestState: getWaitlistRequestState(entry.status),
    actionState: getWaitlistActionState(entry.status),
    communicationState: getWaitlistCommunicationState(entry.status),
    client: {
      id: entry.client_id,
      name: entry.client_name,
      phone: entry.client_phone,
    },
    service: {
      id: entry.service_id,
      name: entry.service_name,
      durationMinutes: options.serviceDurationMinutes ?? null,
    },
    preferredWindow: {
      date: entry.desired_date,
      startTime: normalizeTime(entry.desired_from),
      endTime: normalizeTime(entry.desired_to),
      label: getRequestWindowLabel(entry),
    },
    preferredStaff: entry.staff_id
      ? {
          id: entry.staff_id,
          name: entry.staff_name,
          color: entry.staff_color,
        }
      : null,
    proposedTime: entry.last_notified_slot_start_at
      ? {
          id: `${entry.id}:last-notified-slot`,
          startAt: entry.last_notified_slot_start_at,
          staff: entry.staff_id
            ? {
                id: entry.staff_id,
                name: entry.staff_name,
                color: entry.staff_color,
              }
            : null,
          source: 'system',
          status: entry.status === 'notified' ? 'sent' : 'draft',
          createdAt: entry.notified_at ?? undefined,
        }
      : null,
    bookedAppointmentId: entry.booked_appointment_id,
    lastNotifiedSlotStartAt: entry.last_notified_slot_start_at,
    notes: entry.notes,
    createdAt: entry.created_at,
    updatedAt: entry.updated_at,
  };
}

export function buildCalendarV2Projection(
  input: CalendarV2ProjectionInput,
  options: BuildCalendarV2ProjectionOptions = {},
): CalendarV2Projection {
  const servicesById =
    options.serviceMap ??
    new Map((options.services ?? []).map((service) => [service.id, service]));
  const appointments = (input.appointments ?? []).map(projectAppointmentToV2Appointment);
  const demandItems = (input.waitlist ?? []).map((entry) =>
    projectWaitlistEntryToDemandItem(entry, {
      serviceDurationMinutes: servicesById.get(entry.service_id)?.duration_minutes ?? null,
    }),
  );

  return {
    appointments,
    demandItems,
    calendarBlocks: (input.appointments ?? []).map(projectAppointmentToCalendarBlock),
  };
}

export function getCalendarV2CardSummary(
  input: CalendarV2Appointment | CalendarV2CalendarBlock,
): CalendarV2CardSummary {
  if (isCalendarBlock(input)) {
    if (input.appointment) {
      return buildAppointmentCardSummary(input.appointment);
    }

    return {
      title: input.title,
      subtitle: input.subtitle,
      timeLabel: getTimeRangeLabel(input.startAt, input.endAt),
      staffLabel: input.staffId,
      tone: input.kind === 'blocked_time' ? 'blocked' : 'default',
      actionState: input.actionState,
    };
  }

  return buildAppointmentCardSummary(input);
}

function buildAppointmentCardSummary(appointment: CalendarV2Appointment): CalendarV2CardSummary {
  return {
    title: appointment.client.name,
    subtitle: appointment.service.name,
    timeLabel: getTimeRangeLabel(appointment.startAt, appointment.endAt),
    staffLabel: appointment.staff.name,
    tone: getCardTone(appointment),
    actionState: appointment.actionState,
  };
}

export function getCalendarV2ShortCardSummary(
  input: CalendarV2Appointment | CalendarV2CalendarBlock,
): CalendarV2CardSummary {
  const summary = getCalendarV2CardSummary(input);

  return {
    ...summary,
    subtitle: summary.timeLabel,
    timeLabel: undefined,
  };
}

function getAppointmentSchedulingState(appointment: Appointment): SchedulingState {
  const ownerState = getCalendarOwnerState(appointment);

  if (isCancelledCalendarItem(appointment)) return 'cancelled';
  if (appointment.status === 'completed') return 'completed';
  if (appointment.status === 'no_show') return 'no_show';
  if (ownerState === 'proposal_pending' || ownerState === 'proposal_sent') return 'proposed';

  return 'scheduled';
}

function getAppointmentRequestState(ownerState: string, status: string): RequestState {
  const state = ownerState || status;

  if (
    state === 'pending' ||
    state === 'requested' ||
    state === 'proposal_pending' ||
    state === 'proposal_sent' ||
    state === 'approved' ||
    state === 'booked_direct' ||
    state === 'proposal_accepted' ||
    state === 'rejected' ||
    state === 'proposal_rejected' ||
    state === 'cancelled_by_owner' ||
    state === 'cancelled_by_client'
  ) {
    return state;
  }

  if (state === 'confirmed') return 'approved';
  if (state === 'cancelled') return 'cancelled';

  return 'none';
}

function getAppointmentConfirmationState(
  appointment: Appointment,
  ownerState: string,
): ConfirmationState {
  if (isCancelledCalendarItem(appointment)) {
    return DECLINED_STATES.has(ownerState) ? 'declined' : 'cancelled';
  }

  if (isRequestOwnerState(appointment)) {
    return REQUEST_STATES.has(ownerState) ? 'needs_owner_confirmation' : 'needs_client_confirmation';
  }

  if (appointment.status === 'confirmed' || appointment.status === 'completed') return 'confirmed';

  return 'not_required';
}

function getAppointmentActionState(appointment: Appointment, ownerState: string): ActionState {
  if (isRequestOwnerState(appointment)) return 'requires_action';
  if (isCancelledCalendarItem(appointment)) {
    return ownerState === 'cancelled_by_client' && appointment.cancelled_by === 'client' ? 'update' : 'archived';
  }

  return 'none';
}

function getVisitProgressFromStatus(status: string): VisitProgress {
  if (status === 'completed') return 'completed';
  if (status === 'no_show') return 'no_show';

  return 'scheduled';
}

function getWaitlistSchedulingState(entry: WaitlistEntry): SchedulingState {
  if (entry.status === 'booked') return 'scheduled';
  if (entry.status === 'cancelled') return 'cancelled';

  return 'unscheduled';
}

function getWaitlistRequestState(status: WaitlistEntry['status']): RequestState {
  if (status === 'cancelled') return 'archived';

  return status;
}

function getWaitlistActionState(status: WaitlistEntry['status']): ActionState {
  if (status === 'waiting' || status === 'notified') return 'requires_action';
  if (status === 'booked') return 'handled';

  return 'archived';
}

function getWaitlistCommunicationState(status: WaitlistEntry['status']): CommunicationState {
  if (status === 'notified') return 'sent';

  return 'none';
}

function getCardTone(appointment: CalendarV2Appointment): CalendarV2CardSummary['tone'] {
  if (appointment.schedulingState === 'cancelled') return 'cancelled';
  if (appointment.schedulingState === 'completed' || appointment.schedulingState === 'no_show') return 'completed';
  if (appointment.actionState === 'requires_action') return 'request';

  return 'default';
}

function isCalendarBlock(
  input: CalendarV2Appointment | CalendarV2CalendarBlock,
): input is CalendarV2CalendarBlock {
  return 'sourceEntityType' in input;
}

function normalizeTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : null;
}

function getTimeRangeLabel(startAt: string, endAt: string) {
  const start = getTimeLabel(startAt);
  const end = getTimeLabel(endAt);

  if (!start || !end) return undefined;

  return `${start}-${end}`;
}

function getTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
