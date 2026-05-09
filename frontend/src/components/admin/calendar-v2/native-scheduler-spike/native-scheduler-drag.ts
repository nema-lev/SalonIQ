import type {
  CalendarV2Appointment,
  CalendarV2Command,
  CalendarV2CalendarBlock,
  CalendarV2DemandItem,
  CalendarV2SurfaceMode,
  CalendarV2TimeTarget,
  MoveAppointmentCommand,
  PlaceRequestCommand,
} from '..';

export const DEFAULT_PLACEMENT_DURATION_MINUTES = 60;

export type NativeSchedulerCommandTarget = CalendarV2TimeTarget & {
  staffName?: string | null;
};

export type WaitlistPlacementSavePayload = {
  staffId: string;
  startAt: string;
  durationMinutes: number;
  idempotencyKey: string;
  notifyClient: false;
};

export type WaitlistPlacementSaveRequest = {
  path: string;
  payload: WaitlistPlacementSavePayload;
};

export type NativeSchedulerDragOverlay = {
  kind: 'appointment' | 'demand_item';
  title: string;
  subtitle: string;
  clientX: number;
  clientY: number;
  moved: boolean;
  targetLabel: string | null;
  hasConflict: boolean;
};

export function hasPassedDragThreshold(
  start: { x: number; y: number },
  current: { x: number; y: number },
  thresholdPixels = 4,
) {
  return Math.hypot(current.x - start.x, current.y - start.y) >= thresholdPixels;
}

export function createPlaceRequestCommand({
  demandItem,
  target,
  timezone,
  sourceSurface = 'action_inbox',
}: {
  demandItem: CalendarV2DemandItem;
  target: NativeSchedulerCommandTarget;
  timezone?: string;
  sourceSurface?: CalendarV2SurfaceMode;
}): PlaceRequestCommand {
  return {
    type: 'placeRequest',
    entity: {
      kind: 'demand_item',
      id: demandItem.id,
      version: demandItem.version,
    },
    actorIntent: 'Place unscheduled demand from Calendar V2 Action Inbox.',
    sourceSurface,
    requestedAt: new Date().toISOString(),
    idempotencyKey: buildLocalCommandKey('placeRequest', demandItem.id),
    localOnly: true,
    target: {
      startAt: target.startAt,
      endAt: target.endAt,
      staffId: target.staffId,
      timezone,
    },
    createAppointmentDraft: {
      serviceId: demandItem.service.id,
      clientId: demandItem.client.id,
      clientName: demandItem.client.name,
      clientPhone: demandItem.client.phone ?? undefined,
      notes: demandItem.notes,
    },
  };
}

export function createPlaceRequestCommandPreview({
  demandItem,
  target,
  timezone,
  sourceSurface,
}: {
  demandItem: CalendarV2DemandItem;
  target: NativeSchedulerCommandTarget | null;
  timezone?: string;
  sourceSurface?: CalendarV2SurfaceMode;
}) {
  if (!target) return null;

  return createPlaceRequestCommand({
    demandItem,
    target,
    timezone,
    sourceSurface,
  });
}

export function buildWaitlistPlacementSaveRequest({
  waitlistId,
  command,
  durationMinutes,
}: {
  waitlistId: string;
  command: PlaceRequestCommand;
  durationMinutes: number;
}): WaitlistPlacementSaveRequest {
  return {
    path: `/appointments/waitlist/${waitlistId}/place`,
    payload: {
      staffId: command.target.staffId,
      startAt: command.target.startAt,
      durationMinutes,
      idempotencyKey: buildPlacementSaveIdempotencyKey({
        waitlistId,
        staffId: command.target.staffId,
        startAt: command.target.startAt,
      }),
      notifyClient: false,
    },
  };
}

export function getPlacementDurationMinutes(demandItem: CalendarV2DemandItem) {
  const durationMinutes = demandItem.service.durationMinutes;

  if (typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0) {
    return durationMinutes;
  }

  return DEFAULT_PLACEMENT_DURATION_MINUTES;
}

export function usesFallbackPlacementDuration(demandItem: CalendarV2DemandItem) {
  const durationMinutes = demandItem.service.durationMinutes;
  return !(typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0);
}

export function detectLocalPlacementConflict({
  blocks,
  staffId,
  startAt,
  endAt,
  ignoredBlockId,
}: {
  blocks: CalendarV2CalendarBlock[];
  staffId: string;
  startAt: string;
  endAt: string;
  ignoredBlockId?: string;
}) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  return blocks.some((block) => {
    if (block.id === ignoredBlockId || block.staffId !== staffId) return false;
    if (block.kind !== 'appointment' && block.kind !== 'blocked_time') return false;

    const blockStart = new Date(block.startAt).getTime();
    const blockEnd = new Date(block.endAt).getTime();
    return start < blockEnd && end > blockStart;
  });
}

export function createMoveAppointmentCommand({
  appointment,
  target,
  previousTarget,
  timezone,
}: {
  appointment: CalendarV2Appointment;
  target: NativeSchedulerCommandTarget;
  previousTarget: CalendarV2TimeTarget;
  timezone?: string;
}): MoveAppointmentCommand {
  return {
    type: 'moveAppointment',
    entity: {
      kind: 'appointment',
      id: appointment.id,
      version: appointment.version,
    },
    actorIntent: 'Move appointment inside Calendar V2 native scheduler preview.',
    sourceSurface: 'desktop_scheduler',
    requestedAt: new Date().toISOString(),
    idempotencyKey: buildLocalCommandKey('moveAppointment', appointment.id),
    target: {
      startAt: target.startAt,
      endAt: target.endAt,
      staffId: target.staffId,
      timezone,
    },
    optimistic: {
      previousStartAt: previousTarget.startAt,
      previousEndAt: previousTarget.endAt,
      previousStaffId: previousTarget.staffId,
      createdAt: new Date().toISOString(),
    },
  };
}

export function commandPreviewLabel(command: CalendarV2Command) {
  if (command.type === 'placeRequest') {
    return 'Преглед на поставяне · не е записано';
  }

  if (command.type === 'moveAppointment') {
    return 'Локална промяна · не е записано';
  }

  return 'Локална команда · не е записано';
}

function buildLocalCommandKey(type: string, entityId: string) {
  return `calendar-v2-spike:${type}:${entityId}:${Date.now()}`;
}

function buildPlacementSaveIdempotencyKey({
  waitlistId,
  staffId,
  startAt,
}: {
  waitlistId: string;
  staffId: string;
  startAt: string;
}) {
  return `calendar-v2-placement:${waitlistId}:${staffId}:${startAt}`;
}
