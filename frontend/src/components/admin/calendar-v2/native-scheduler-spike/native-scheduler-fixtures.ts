import type {
  Appointment,
  CalendarBoardStaff,
  Service,
  WaitlistEntry,
} from '../../calendar-model';
import type { CalendarV2CalendarBlock } from '..';
import {
  buildActionInboxItems,
  buildCalendarV2Projection,
} from '..';

export const NATIVE_SCHEDULER_SPIKE_DATE = '2026-05-05';

export const nativeSchedulerDate = new Date(`${NATIVE_SCHEDULER_SPIKE_DATE}T00:00:00`);

export const nativeSchedulerStaff: CalendarBoardStaff[] = [
  buildStaff('staff-mira', 'Мира', '#7c3aed'),
  buildStaff('staff-ivaylo', 'Ивайло', '#0891b2'),
  buildStaff('staff-elena', 'Елена', '#059669'),
  buildStaff('staff-boryana', 'Боряна', '#e11d48'),
];

const nativeSchedulerServices: Service[] = [
  buildService('svc-cut', 'Подстригване', 60, '#7c3aed'),
  buildService('svc-brow', 'Бърза корекция', 15, '#0f766e'),
  buildService('svc-color', 'Боядисване', 90, '#ea580c'),
  buildService('svc-style', 'Стайлинг', 45, '#2563eb'),
];

const scheduledAppointments: Appointment[] = [
  buildAppointment({
    id: 'appt-maria-cut',
    start: '09:00',
    end: '10:00',
    staffId: 'staff-mira',
    clientName: 'Мария П.',
    clientPhone: '+359888111222',
    serviceId: 'svc-cut',
    status: 'confirmed',
  }),
  buildAppointment({
    id: 'appt-ani-short',
    start: '10:15',
    end: '10:30',
    staffId: 'staff-ivaylo',
    clientName: 'Ани',
    clientPhone: '+359888333444',
    serviceId: 'svc-brow',
    status: 'confirmed',
  }),
  buildAppointment({
    id: 'appt-message',
    start: '11:00',
    end: '12:00',
    staffId: 'staff-elena',
    clientName: 'Даниела Р.',
    clientPhone: '+359888555666',
    serviceId: 'svc-style',
    status: 'confirmed',
  }),
  buildAppointment({
    id: 'appt-progress',
    start: '12:00',
    end: '13:00',
    staffId: 'staff-mira',
    clientName: 'Силвия',
    clientPhone: '+359888777888',
    serviceId: 'svc-color',
    status: 'confirmed',
    visitProgress: 'in_service',
  }),
  buildAppointment({
    id: 'appt-overlap-a',
    start: '13:00',
    end: '14:00',
    staffId: 'staff-boryana',
    clientName: 'Виктория',
    clientPhone: '+359888999000',
    serviceId: 'svc-cut',
    status: 'confirmed',
  }),
  buildAppointment({
    id: 'appt-overlap-b',
    start: '13:30',
    end: '14:15',
    staffId: 'staff-boryana',
    clientName: 'Надя',
    clientPhone: '+359887111000',
    serviceId: 'svc-style',
    status: 'confirmed',
  }),
];

const actionInboxAppointments: Appointment[] = [
  buildAppointment({
    id: 'appt-pending-approval',
    start: '16:00',
    end: '17:00',
    staffId: 'staff-mira',
    clientName: 'Ралица',
    clientPhone: '+359887222000',
    serviceId: 'svc-color',
    status: 'pending',
    ownerState: 'pending',
  }),
  buildAppointment({
    id: 'appt-cancel-recovery',
    start: '12:30',
    end: '13:15',
    staffId: 'staff-elena',
    clientName: 'Камелия',
    clientPhone: '+359887333000',
    serviceId: 'svc-style',
    status: 'cancelled',
    ownerState: 'cancelled_by_client',
    cancelledBy: 'client',
  }),
  buildAppointment({
    id: 'appt-cancel-update',
    start: '18:00',
    end: '18:45',
    staffId: 'staff-ivaylo',
    clientName: 'Петя',
    clientPhone: '+359887444000',
    serviceId: 'svc-cut',
    status: 'cancelled',
    ownerState: 'cancelled',
    cancelledBy: 'owner',
  }),
];

const waitlistEntries: WaitlistEntry[] = [
  buildWaitlistEntry({
    id: 'demand-no-time',
    clientName: 'Клиент без час',
    clientPhone: '+359887555000',
    serviceId: 'svc-style',
    status: 'waiting',
    desiredDate: null,
    desiredFrom: null,
    desiredTo: null,
    staffId: null,
    notes: 'Иска първи свободен следобеден час.',
  }),
  buildWaitlistEntry({
    id: 'demand-preferred-window',
    clientName: 'Ива',
    clientPhone: '+359887666000',
    serviceId: 'svc-cut',
    status: 'waiting',
    desiredDate: NATIVE_SCHEDULER_SPIKE_DATE,
    desiredFrom: '14:00',
    desiredTo: '18:00',
    staffId: 'staff-boryana',
    notes: 'Предпочита Боряна, но може и друг специалист.',
  }),
];

const projection = buildCalendarV2Projection(
  {
    appointments: scheduledAppointments,
    waitlist: waitlistEntries,
  },
  { services: nativeSchedulerServices },
);

const blockedTime: CalendarV2CalendarBlock = {
  id: 'block-elena-break',
  sourceEntityType: 'staff_exception',
  sourceEntityId: 'fixture-elena-break',
  kind: 'blocked_time',
  startAt: atTime('15:00'),
  endAt: atTime('15:45'),
  staffId: 'staff-elena',
  title: 'Пауза',
  subtitle: 'Блокирано време',
  color: '#94a3b8',
  schedulingState: 'scheduled',
  actionState: 'none',
};

export const nativeSchedulerDemandItems = projection.demandItems;

export const nativeSchedulerActionInboxItems = buildActionInboxItems({
  appointments: actionInboxAppointments,
  waitlist: waitlistEntries,
});

export const nativeSchedulerCalendarBlocks: CalendarV2CalendarBlock[] = [
  ...projection.calendarBlocks.map(markSpecialFixtureStates),
  blockedTime,
];

export function atTime(time: string) {
  return `${NATIVE_SCHEDULER_SPIKE_DATE}T${time}:00`;
}

function markSpecialFixtureStates(block: CalendarV2CalendarBlock): CalendarV2CalendarBlock {
  if (!block.appointment) return block;

  if (block.id === 'appt-message') {
    return {
      ...block,
      appointment: {
        ...block.appointment,
        communicationState: 'delivered',
      },
    };
  }

  return block;
}

function buildStaff(id: string, name: string, color: string): CalendarBoardStaff {
  return {
    id,
    name,
    color,
    is_active: true,
    accepts_online: true,
    working_hours: {
      mon: { open: '08:00', close: '20:00', isOpen: true },
      tue: { open: '08:00', close: '20:00', isOpen: true },
      wed: { open: '08:00', close: '20:00', isOpen: true },
      thu: { open: '08:00', close: '20:00', isOpen: true },
      fri: { open: '08:00', close: '20:00', isOpen: true },
      sat: { open: '09:00', close: '18:00', isOpen: true },
      sun: { open: '00:00', close: '00:00', isOpen: false },
    },
  };
}

function buildService(
  id: string,
  name: string,
  durationMinutes: number,
  color: string,
): Service {
  return {
    id,
    name,
    category: 'Spike fixtures',
    duration_minutes: durationMinutes,
    price: null,
    is_public: true,
  };
}

function buildAppointment({
  id,
  start,
  end,
  staffId,
  clientName,
  clientPhone,
  serviceId,
  status,
  ownerState,
  visitProgress,
  cancelledBy = null,
}: {
  id: string;
  start: string;
  end: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  status: string;
  ownerState?: string;
  visitProgress?: Appointment['visit_progress'];
  cancelledBy?: Appointment['cancelled_by'];
}): Appointment {
  const service = nativeSchedulerServices.find((item) => item.id === serviceId);
  const staff = nativeSchedulerStaff.find((item) => item.id === staffId);

  if (!service || !staff) {
    throw new Error(`Invalid native scheduler fixture: ${id}`);
  }

  return {
    id,
    start_at: atTime(start),
    end_at: atTime(end),
    status,
    owner_view_state: ownerState ?? status,
    owner_view_label: ownerState ?? status,
    visit_progress: visitProgress ?? 'scheduled',
    service_id: service.id,
    staff_id: staff.id,
    client_name: clientName,
    client_phone: clientPhone,
    service_name: service.name,
    service_color: service.id === 'svc-brow' ? '#0f766e' : service.id === 'svc-color' ? '#ea580c' : service.id === 'svc-style' ? '#2563eb' : '#7c3aed',
    staff_name: staff.name,
    staff_color: staff.color,
    price: service.price,
    internal_notes: null,
    cancelled_by: cancelledBy,
  };
}

function buildWaitlistEntry({
  id,
  clientName,
  clientPhone,
  serviceId,
  status,
  desiredDate,
  desiredFrom,
  desiredTo,
  staffId,
  notes,
}: {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  status: WaitlistEntry['status'];
  desiredDate: string | null;
  desiredFrom: string | null;
  desiredTo: string | null;
  staffId: string | null;
  notes: string | null;
}): WaitlistEntry {
  const service = nativeSchedulerServices.find((item) => item.id === serviceId);
  const staff = staffId ? nativeSchedulerStaff.find((item) => item.id === staffId) : null;

  if (!service || (staffId && !staff)) {
    throw new Error(`Invalid native scheduler demand fixture: ${id}`);
  }

  return {
    id,
    status,
    desired_date: desiredDate,
    desired_from: desiredFrom,
    desired_to: desiredTo,
    notified_at: null,
    expires_at: null,
    notes,
    created_at: atTime('07:45'),
    updated_at: null,
    booked_appointment_id: null,
    last_notified_slot_start_at: null,
    client_id: `client-${id}`,
    client_name: clientName,
    client_phone: clientPhone,
    service_id: service.id,
    service_name: service.name,
    staff_id: staff?.id ?? null,
    staff_name: staff?.name ?? null,
    staff_color: staff?.color ?? null,
  };
}
