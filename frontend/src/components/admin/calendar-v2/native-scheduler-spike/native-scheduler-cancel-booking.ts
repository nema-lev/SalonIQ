import type { CalendarV2CalendarBlock } from '..';

const CANCELLABLE_APPOINTMENT_STATUSES = new Set(['pending', 'proposal_pending', 'confirmed']);

export type NativeSchedulerCancelBookingIntent = {
  appointmentId: string;
};

export function getNativeSchedulerCancelBookingIntent({
  selectedBlock,
  canWrite,
  placementContextActive,
}: {
  selectedBlock: CalendarV2CalendarBlock | null;
  canWrite: boolean;
  placementContextActive: boolean;
}): NativeSchedulerCancelBookingIntent | null {
  if (!canWrite || placementContextActive) return null;
  if (!selectedBlock || selectedBlock.kind !== 'appointment' || !selectedBlock.appointment) return null;
  if (!CANCELLABLE_APPOINTMENT_STATUSES.has(selectedBlock.appointment.rawStatus ?? '')) return null;

  return {
    appointmentId: selectedBlock.appointment.id,
  };
}
