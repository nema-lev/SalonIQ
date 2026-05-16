import type { CalendarV2CalendarBlock } from '..';

export type NativeSchedulerResource = {
  id: string;
  name: string;
  color?: string | null;
};

export type NativeSchedulerGeometryConfig = {
  businessStartMinutes: number;
  businessEndMinutes: number;
  slotMinutes: number;
  pixelsPerMinute: number;
  resourceColumnWidth: number;
  eventInset: number;
  laneGap: number;
  minimumEventHeight: number;
};

export type NativeSchedulerRect = {
  top: number;
  height: number;
  left: number;
  width: number;
};

export type NativeSchedulerSlotTarget = {
  resource: NativeSchedulerResource;
  resourceIndex: number;
  startMinutes: number;
  endMinutes: number;
  startAt: string;
  endAt: string;
  y: number;
};

type RectLike = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

export const NATIVE_SCHEDULER_GEOMETRY: NativeSchedulerGeometryConfig = {
  businessStartMinutes: 8 * 60,
  businessEndMinutes: 20 * 60,
  slotMinutes: 15,
  pixelsPerMinute: 2,
  resourceColumnWidth: 236,
  eventInset: 8,
  laneGap: 5,
  minimumEventHeight: 30,
};

export function minutesToPixels(minutes: number, pixelsPerMinute = NATIVE_SCHEDULER_GEOMETRY.pixelsPerMinute) {
  return minutes * pixelsPerMinute;
}

export function getMinutesFromDateTime(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

export function timeToY(value: string | number, config = NATIVE_SCHEDULER_GEOMETRY) {
  const minutes = typeof value === 'number' ? value : getMinutesFromDateTime(value);
  return minutesToPixels(minutes - config.businessStartMinutes, config.pixelsPerMinute);
}

export function isSameLocalCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function localDateValue(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function getCurrentTimeIndicatorMinutes({
  schedulerDate,
  now,
  config = NATIVE_SCHEDULER_GEOMETRY,
}: {
  schedulerDate: Date;
  now: Date;
  config?: NativeSchedulerGeometryConfig;
}) {
  if (!isSameLocalCalendarDate(schedulerDate, now)) return null;

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < config.businessStartMinutes || minutes > config.businessEndMinutes) {
    return null;
  }

  return minutes;
}

export function getCurrentTimeIndicatorTop({
  schedulerDate,
  now,
  config = NATIVE_SCHEDULER_GEOMETRY,
}: {
  schedulerDate: Date;
  now: Date;
  config?: NativeSchedulerGeometryConfig;
}) {
  const minutes = getCurrentTimeIndicatorMinutes({ schedulerDate, now, config });
  return minutes === null ? null : timeToY(minutes, config);
}

export function getPastPlacementOverlayHeight({
  schedulerDate,
  now,
  config = NATIVE_SCHEDULER_GEOMETRY,
}: {
  schedulerDate: Date;
  now: Date;
  config?: NativeSchedulerGeometryConfig;
}) {
  const schedulerDay = localDateValue(schedulerDate);
  const today = localDateValue(now);

  if (schedulerDay < today) {
    return getGridHeight(config);
  }

  if (schedulerDay > today) {
    return 0;
  }

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes <= config.businessStartMinutes) {
    return 0;
  }

  if (minutes >= config.businessEndMinutes) {
    return getGridHeight(config);
  }

  return timeToY(minutes, config);
}

export function yToTime(y: number, date: Date, config = NATIVE_SCHEDULER_GEOMETRY) {
  const rawMinutes = config.businessStartMinutes + y / config.pixelsPerMinute;
  const minutes = clampToBusinessHours(snapToSlot(rawMinutes, config.slotMinutes), 0, config);
  return dateAndMinutesToIso(date, minutes);
}

export function slotFromPointer({
  clientX,
  clientY,
  gridRect,
  resources,
  date,
  durationMinutes,
  config = NATIVE_SCHEDULER_GEOMETRY,
}: {
  clientX: number;
  clientY: number;
  gridRect: RectLike;
  resources: NativeSchedulerResource[];
  date: Date;
  durationMinutes: number;
  config?: NativeSchedulerGeometryConfig;
}): NativeSchedulerSlotTarget | null {
  const x = clientX - gridRect.left;
  const y = clientY - gridRect.top;

  if (x < 0 || x > gridRect.width) {
    return null;
  }

  // Vertical overrun clamps into business hours; horizontal overrun stays invalid
  // because it would otherwise imply the wrong staff/resource column.
  const clampedY = Math.min(Math.max(y, 0), gridRect.height);

  const resourceMatch = getResourceFromX(x, resources, config.resourceColumnWidth);
  if (!resourceMatch) {
    return null;
  }

  const rawStartMinutes = config.businessStartMinutes + clampedY / config.pixelsPerMinute;
  const startMinutes = clampToBusinessHours(
    snapToSlot(rawStartMinutes, config.slotMinutes),
    durationMinutes,
    config,
  );
  const endMinutes = startMinutes + durationMinutes;

  return {
    ...resourceMatch,
    startMinutes,
    endMinutes,
    startAt: dateAndMinutesToIso(date, startMinutes),
    endAt: dateAndMinutesToIso(date, endMinutes),
    y: timeToY(startMinutes, config),
  };
}

export function appointmentToRect(
  block: CalendarV2CalendarBlock,
  resources: NativeSchedulerResource[],
  lane: { lane: number; laneCount: number } | undefined,
  config = NATIVE_SCHEDULER_GEOMETRY,
): NativeSchedulerRect | null {
  const resourceIndex = resources.findIndex((resource) => resource.id === block.staffId);
  if (resourceIndex === -1) return null;

  const top = Math.max(timeToY(block.startAt, config), 0);
  const bottom = Math.min(timeToY(block.endAt, config), getGridHeight(config));
  const laneCount = Math.max(lane?.laneCount ?? 1, 1);
  const laneIndex = Math.min(lane?.lane ?? 0, laneCount - 1);
  const usableWidth = config.resourceColumnWidth - config.eventInset * 2;
  const laneWidth = (usableWidth - config.laneGap * (laneCount - 1)) / laneCount;

  return {
    top,
    height: Math.max(bottom - top, config.minimumEventHeight),
    left:
      resourceIndex * config.resourceColumnWidth +
      config.eventInset +
      laneIndex * (laneWidth + config.laneGap),
    width: laneWidth,
  };
}

export function calendarBlockToColumnRect(
  block: Pick<CalendarV2CalendarBlock, 'startAt' | 'endAt' | 'staffId'>,
  resources: NativeSchedulerResource[],
  config = NATIVE_SCHEDULER_GEOMETRY,
  inset = 8,
): NativeSchedulerRect | null {
  const resourceIndex = resources.findIndex((resource) => resource.id === block.staffId);
  if (resourceIndex === -1) return null;

  const top = Math.max(timeToY(block.startAt, config), 0);
  const bottom = Math.min(timeToY(block.endAt, config), getGridHeight(config));

  return {
    top,
    height: Math.max(bottom - top, 22),
    left: resourceIndex * config.resourceColumnWidth + inset,
    width: config.resourceColumnWidth - inset * 2,
  };
}

export function clampToBusinessHours(
  startMinutes: number,
  durationMinutes: number,
  config = NATIVE_SCHEDULER_GEOMETRY,
) {
  const latestStart = Math.max(config.businessStartMinutes, config.businessEndMinutes - durationMinutes);
  return Math.min(Math.max(startMinutes, config.businessStartMinutes), latestStart);
}

export function snapToSlot(minutes: number, slotMinutes = NATIVE_SCHEDULER_GEOMETRY.slotMinutes) {
  return Math.round(minutes / slotMinutes) * slotMinutes;
}

export function getResourceFromX(
  x: number,
  resources: NativeSchedulerResource[],
  resourceColumnWidth = NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth,
) {
  const resourceIndex = Math.floor(x / resourceColumnWidth);
  const resource = resources[resourceIndex];
  if (!resource) return null;

  return { resource, resourceIndex };
}

export function detectLocalOverlap(blocks: CalendarV2CalendarBlock[]) {
  const layouts = new Map<string, { lane: number; laneCount: number }>();
  const byResource = new Map<string, CalendarV2CalendarBlock[]>();

  for (const block of blocks) {
    if (block.kind !== 'appointment') continue;
    const current = byResource.get(block.staffId) ?? [];
    current.push(block);
    byResource.set(block.staffId, current);
  }

  for (const resourceBlocks of byResource.values()) {
    const sorted = [...resourceBlocks].sort(
      (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
    );
    let cluster: Array<{ id: string; lane: number }> = [];
    let laneEndTimes: number[] = [];
    let clusterEnd = -Infinity;

    const finalizeCluster = () => {
      if (!cluster.length) return;
      const laneCount = Math.max(...cluster.map((item) => item.lane), 0) + 1;
      for (const item of cluster) {
        layouts.set(item.id, { lane: item.lane, laneCount });
      }
      cluster = [];
      laneEndTimes = [];
      clusterEnd = -Infinity;
    };

    for (const block of sorted) {
      const start = new Date(block.startAt).getTime();
      const end = new Date(block.endAt).getTime();

      if (cluster.length && start >= clusterEnd) {
        finalizeCluster();
      }

      let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) {
        lane = laneEndTimes.length;
      }

      laneEndTimes[lane] = end;
      cluster.push({ id: block.id, lane });
      clusterEnd = Math.max(clusterEnd, end);
    }

    finalizeCluster();
  }

  return layouts;
}

export function getGridHeight(config = NATIVE_SCHEDULER_GEOMETRY) {
  return minutesToPixels(
    config.businessEndMinutes - config.businessStartMinutes,
    config.pixelsPerMinute,
  );
}

export function getTimeSlots(config = NATIVE_SCHEDULER_GEOMETRY) {
  const slotCount =
    (config.businessEndMinutes - config.businessStartMinutes) / config.slotMinutes;

  return Array.from({ length: slotCount + 1 }, (_, index) => {
    const minutes = config.businessStartMinutes + index * config.slotMinutes;
    return {
      minutes,
      top: timeToY(minutes, config),
      label: formatMinutesAsTime(minutes),
      isHour: minutes % 60 === 0,
    };
  });
}

export function dateAndMinutesToIso(date: Date, minutes: number) {
  const next = new Date(date);
  next.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return next.toISOString();
}

export function formatMinutesAsTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function getDurationMinutes(startAt: string, endAt: string) {
  return Math.max(
    NATIVE_SCHEDULER_GEOMETRY.slotMinutes,
    Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000),
  );
}
