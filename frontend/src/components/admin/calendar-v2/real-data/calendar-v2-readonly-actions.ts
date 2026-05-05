import type { CalendarV2CommandType } from '../commands';

export const CALENDAR_V2_READONLY_NOTICE =
  'Calendar V2 Preview · Read-only';

export type CalendarV2ReadOnlyAction =
  | Extract<CalendarV2CommandType, 'moveAppointment' | 'placeRequest' | 'confirmRequest' | 'declineRequest' | 'cancelAppointment'>
  | 'createAppointment'
  | 'waitlistPlacement';

const READONLY_ACTION_MESSAGES: Record<CalendarV2ReadOnlyAction, string> = {
  moveAppointment: 'Appointment movement is disabled in the read-only Calendar V2 preview.',
  placeRequest: 'Request placement is disabled in the read-only Calendar V2 preview.',
  confirmRequest: 'Request confirmation is disabled in the read-only Calendar V2 preview.',
  declineRequest: 'Request decline is disabled in the read-only Calendar V2 preview.',
  cancelAppointment: 'Appointment cancellation is disabled in the read-only Calendar V2 preview.',
  createAppointment: 'Appointment creation is disabled in the read-only Calendar V2 preview.',
  waitlistPlacement: 'Waitlist placement is disabled in the read-only Calendar V2 preview.',
};

export function getCalendarV2ReadOnlyActionMessage(action: CalendarV2ReadOnlyAction) {
  return READONLY_ACTION_MESSAGES[action];
}

export function blockCalendarV2ReadOnlyAction(action: CalendarV2ReadOnlyAction) {
  return {
    allowed: false as const,
    action,
    message: getCalendarV2ReadOnlyActionMessage(action),
  };
}
