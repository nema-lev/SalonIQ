import { isSameDay } from 'date-fns';
import type {
  Appointment,
  CalendarBoardResponse,
  CalendarBoardStaff,
  Service,
  StaffException,
  WaitlistEntry,
} from '../../calendar-model';
import type {
  ActionInboxItem,
  CalendarV2CalendarBlock,
  CalendarV2DemandItem,
  CalendarV2Projection,
} from '..';
import {
  buildActionInboxItems,
  buildCalendarV2Projection,
} from '..';

const NON_ACTIVE_GRID_APPOINTMENT_STATUSES = new Set(['cancelled']);

export type CalendarV2SchedulerResource = {
  id: string;
  name: string;
  color?: string | null;
};

export type CalendarV2RealDataProjection = Omit<CalendarV2Projection, 'actionItems'> & {
  resources: CalendarV2SchedulerResource[];
  actionItems: ActionInboxItem[];
  sourceAppointments: Appointment[];
  sourceWaitlistEntries: WaitlistEntry[];
  blockedBlocks: CalendarV2CalendarBlock[];
};

type BuildCalendarV2RealDataProjectionOptions = {
  calendarBoard: CalendarBoardResponse | undefined;
  waitlistEntries: WaitlistEntry[];
  services: Service[];
  selectedDate: Date;
};

export function buildCalendarV2RealDataProjection({
  calendarBoard,
  waitlistEntries,
  services,
  selectedDate,
}: BuildCalendarV2RealDataProjectionOptions): CalendarV2RealDataProjection {
  const staff = calendarBoard?.staff ?? [];
  const selectedAppointments = (calendarBoard?.appointments ?? []).filter((appointment) =>
    isSameDay(new Date(appointment.start_at), selectedDate),
  );
  const activeGridAppointments = selectedAppointments.filter(isCalendarV2ActiveGridAppointment);
  const selectedExceptions = (calendarBoard?.exceptions ?? []).filter((exception) =>
    isSameDay(new Date(exception.start_at), selectedDate),
  );
  const projection = buildCalendarV2Projection(
    {
      appointments: activeGridAppointments,
      waitlist: waitlistEntries,
    },
    { services },
  );
  const blockedBlocks = selectedExceptions.map((exception) =>
    mapStaffExceptionToCalendarV2Block(exception, staff),
  );

  return {
    ...projection,
    calendarBlocks: sortCalendarBlocks([...projection.calendarBlocks, ...blockedBlocks]),
    resources: mapStaffToCalendarV2Resources(staff, activeGridAppointments),
    actionItems: buildActionInboxItems({
      appointments: selectedAppointments,
      waitlist: waitlistEntries,
    }),
    sourceAppointments: selectedAppointments,
    sourceWaitlistEntries: waitlistEntries,
    blockedBlocks,
  };
}

export function isCalendarV2ActiveGridAppointment(appointment: Appointment) {
  return !NON_ACTIVE_GRID_APPOINTMENT_STATUSES.has(appointment.status);
}

export function shouldKeepCalendarV2SelectedBookingAfterRefresh(
  appointments: Appointment[] | undefined,
  appointmentId: string,
) {
  const refreshedAppointment = appointments?.find((appointment) => appointment.id === appointmentId);

  return Boolean(refreshedAppointment && isCalendarV2ActiveGridAppointment(refreshedAppointment));
}

export function doesCalendarV2BookingExistAfterRefresh(
  appointments: Appointment[] | undefined,
  appointmentId: string,
) {
  return Boolean(appointments?.some((appointment) => appointment.id === appointmentId));
}

export function mapStaffToCalendarV2Resources(
  staff: CalendarBoardStaff[],
  appointments: Appointment[] = [],
): CalendarV2SchedulerResource[] {
  if (staff.length > 0) {
    return [...staff]
      .sort((left, right) => left.name.localeCompare(right.name, 'bg'))
      .map((member) => ({
        id: member.id,
        name: member.name,
        color: member.color,
      }));
  }

  const resourcesById = new Map<string, CalendarV2SchedulerResource>();
  for (const appointment of appointments) {
    if (!appointment.staff_id || resourcesById.has(appointment.staff_id)) continue;

    resourcesById.set(appointment.staff_id, {
      id: appointment.staff_id,
      name: appointment.staff_name || appointment.staff_id,
      color: appointment.staff_color,
    });
  }

  return [...resourcesById.values()].sort((left, right) => left.name.localeCompare(right.name, 'bg'));
}

export function mapStaffExceptionToCalendarV2Block(
  exception: StaffException,
  staff: CalendarBoardStaff[],
): CalendarV2CalendarBlock {
  const staffMember = staff.find((member) => member.id === exception.staff_id);

  return {
    id: `staff-exception:${exception.id}`,
    sourceEntityType: 'staff_exception',
    sourceEntityId: exception.id,
    kind: 'blocked_time',
    startAt: exception.start_at,
    endAt: exception.end_at,
    staffId: exception.staff_id,
    title: exception.note?.trim() || 'Blocked time',
    subtitle: staffMember?.name ?? exception.staff_name ?? 'Staff exception',
    color: staffMember?.color ?? exception.staff_color ?? '#94a3b8',
    schedulingState: 'scheduled',
    actionState: 'none',
  };
}

export function getCalendarV2RealDataStatusLabel(projection: CalendarV2RealDataProjection) {
  const appointmentCount = projection.sourceAppointments.length;
  const demandCount = projection.demandItems.filter(
    (item: CalendarV2DemandItem) => item.actionState === 'requires_action',
  ).length;

  return `${appointmentCount} scheduled · ${demandCount} demand`;
}

function sortCalendarBlocks(blocks: CalendarV2CalendarBlock[]) {
  return [...blocks].sort(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );
}
