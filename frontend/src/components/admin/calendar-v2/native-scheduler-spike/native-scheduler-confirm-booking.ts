import type { CalendarV2CalendarBlock } from '..';

const CONFIRMABLE_APPOINTMENT_STATUSES = new Set(['pending', 'proposal_pending']);

export type NativeSchedulerConfirmBookingIntent = {
  appointmentId: string;
};

export function getNativeSchedulerConfirmBookingIntent({
  selectedBlock,
  canWrite,
  placementContextActive,
}: {
  selectedBlock: CalendarV2CalendarBlock | null;
  canWrite: boolean;
  placementContextActive: boolean;
}): NativeSchedulerConfirmBookingIntent | null {
  if (!canWrite || placementContextActive) return null;
  if (!selectedBlock || selectedBlock.kind !== 'appointment' || !selectedBlock.appointment) return null;
  if (!CONFIRMABLE_APPOINTMENT_STATUSES.has(selectedBlock.appointment.rawStatus ?? '')) return null;

  return {
    appointmentId: selectedBlock.appointment.id,
  };
}
