import type {
  CalendarV2Appointment,
  CalendarV2Command,
  CalendarV2DemandItem,
  CalendarV2TimeTarget,
  MoveAppointmentCommand,
  PlaceRequestCommand,
} from '..';

export type NativeSchedulerCommandTarget = CalendarV2TimeTarget & {
  staffName?: string | null;
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
}: {
  demandItem: CalendarV2DemandItem;
  target: NativeSchedulerCommandTarget;
  timezone?: string;
}): PlaceRequestCommand {
  return {
    type: 'placeRequest',
    entity: {
      kind: 'demand_item',
      id: demandItem.id,
      version: demandItem.version,
    },
    actorIntent: 'Place unscheduled demand from Calendar V2 Action Inbox.',
    sourceSurface: 'desktop_scheduler',
    requestedAt: new Date().toISOString(),
    idempotencyKey: buildLocalCommandKey('placeRequest', demandItem.id),
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
    actorIntent: 'Move appointment inside Calendar V2 native scheduler spike.',
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
    return `placeRequest -> ${command.target.startAt}`;
  }

  if (command.type === 'moveAppointment') {
    return `moveAppointment -> ${command.target.startAt}`;
  }

  return command.type;
}

function buildLocalCommandKey(type: string, entityId: string) {
  return `calendar-v2-spike:${type}:${entityId}:${Date.now()}`;
}
