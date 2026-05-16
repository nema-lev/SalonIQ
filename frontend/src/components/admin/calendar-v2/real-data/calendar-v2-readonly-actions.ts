import type { CalendarV2CommandType } from '../commands';

export const CALENDAR_V2_READONLY_NOTICE =
  'Calendar V2 · Read-only';

export type CalendarV2ReadOnlyAction =
  | Extract<CalendarV2CommandType, 'moveAppointment' | 'placeRequest' | 'confirmRequest' | 'declineRequest' | 'cancelAppointment'>
  | 'createAppointment'
  | 'waitlistPlacement';

const READONLY_ACTION_MESSAGES: Record<CalendarV2ReadOnlyAction, string> = {
  moveAppointment: 'Appointment movement is disabled in read-only Calendar V2.',
  placeRequest: 'Request placement is disabled in read-only Calendar V2.',
  confirmRequest: 'Request confirmation is disabled in read-only Calendar V2.',
  declineRequest: 'Request decline is disabled in read-only Calendar V2.',
  cancelAppointment: 'Appointment cancellation is disabled in read-only Calendar V2.',
  createAppointment: 'Appointment creation is disabled in read-only Calendar V2.',
  waitlistPlacement: 'Waitlist placement is disabled in read-only Calendar V2.',
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
