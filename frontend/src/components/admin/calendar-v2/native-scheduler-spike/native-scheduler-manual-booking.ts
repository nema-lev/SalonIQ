import { formatMinutesAsTime } from './native-scheduler-geometry';
import { isPastPlacementStart } from './native-scheduler-drag';
import type { NativeSchedulerGridDropPreview } from './NativeSchedulerGrid';

export type NativeSchedulerManualBookingIntent = {
  staffId: string;
  staffName: string;
  startAt: string;
  preferredSlot: string;
};

export function buildManualBookingIntent({
  target,
  enabled,
  placementModeActive,
  now = new Date(),
}: {
  target: NativeSchedulerGridDropPreview | null;
  enabled: boolean;
  placementModeActive: boolean;
  now?: Date;
}): NativeSchedulerManualBookingIntent | null {
  if (!enabled || placementModeActive || !target || target.hasConflict) {
    return null;
  }

  if (isPastPlacementStart(target.startAt, now)) {
    return null;
  }

  const start = new Date(target.startAt);

  return {
    staffId: target.staffId,
    staffName: target.staffName,
    startAt: target.startAt,
    preferredSlot: formatMinutesAsTime(start.getHours() * 60 + start.getMinutes()),
  };
}
