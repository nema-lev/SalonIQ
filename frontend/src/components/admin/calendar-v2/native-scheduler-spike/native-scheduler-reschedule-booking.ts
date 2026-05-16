import type { CalendarV2CalendarBlock } from '..';
import type { NativeSchedulerGridDropPreview } from './NativeSchedulerGrid';

const RESCHEDULABLE_APPOINTMENT_STATUSES = new Set(['pending', 'proposal_pending', 'confirmed']);

export type NativeSchedulerRescheduleBookingIntent = {
  appointmentId: string;
};

export type AppointmentRescheduleSavePayload = {
  startAt: string;
  staffId: string;
};

export type AppointmentRescheduleSaveRequest = {
  path: string;
  payload: AppointmentRescheduleSavePayload;
};

export function getNativeSchedulerRescheduleBookingIntent({
  selectedBlock,
  canWrite,
  placementContextActive,
  rescheduleContextActive,
}: {
  selectedBlock: CalendarV2CalendarBlock | null;
  canWrite: boolean;
  placementContextActive: boolean;
  rescheduleContextActive: boolean;
}): NativeSchedulerRescheduleBookingIntent | null {
  if (!canWrite || placementContextActive || rescheduleContextActive) return null;
  if (!selectedBlock || selectedBlock.kind !== 'appointment' || !selectedBlock.appointment) return null;
  if (!RESCHEDULABLE_APPOINTMENT_STATUSES.has(selectedBlock.appointment.rawStatus ?? '')) return null;

  return {
    appointmentId: selectedBlock.appointment.id,
  };
}

export function buildAppointmentRescheduleSaveRequestIfValid({
  appointmentId,
  target,
}: {
  appointmentId: string;
  target: NativeSchedulerGridDropPreview | null;
}): AppointmentRescheduleSaveRequest | null {
  if (!target || target.isPast || target.hasConflict) return null;

  return {
    path: `/appointments/${appointmentId}/reschedule`,
    payload: {
      startAt: target.startAt,
      staffId: target.staffId,
    },
  };
}
