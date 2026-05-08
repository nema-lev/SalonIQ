import { format } from 'date-fns';
import type {
  Appointment,
  CalendarBoardStaff,
  Service,
  WaitlistEntry,
} from '../../calendar-model';
import type {
  ActionInboxItem,
  CalendarV2CalendarBlock,
} from '..';
import { buildCalendarV2Projection } from '..';
import type { CalendarV2RealDataProjection } from './calendar-v2-real-data-mappers';

const SAMPLE_STAFF: CalendarBoardStaff[] = [
  buildStaff('sample-staff-elena', 'Елена', '#0f766e'),
  buildStaff('sample-staff-maria', 'Мария', '#2563eb'),
  buildStaff('sample-staff-nikol', 'Никол', '#7c3aed'),
  buildStaff('sample-staff-ani', 'Ани', '#e11d48'),
];

const SAMPLE_SERVICES: Service[] = [
  buildService('sample-service-manicure', 'Маникюр', 60, 45),
  buildService('sample-service-haircut', 'Подстригване', 60, 40),
  buildService('sample-service-color', 'Боядисване', 90, 120),
  buildService('sample-service-lashes', 'Мигли', 30, 55),
  buildService('sample-service-pedicure', 'Педикюр', 120, 70),
  buildService('sample-service-consult', 'Консултация', 15, null),
];

export function buildCalendarV2SampleDayProjection(selectedDate: Date): CalendarV2RealDataProjection {
  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const at = (time: string) => `${dateKey}T${time}:00`;
  const scheduledAppointments: Appointment[] = [
    buildAppointment({
      id: 'sample-appt-maria-manicure',
      at,
      start: '08:30',
      end: '09:30',
      staffId: 'sample-staff-elena',
      clientName: 'Мария Иванова',
      clientPhone: '+359888111222',
      serviceId: 'sample-service-manicure',
      status: 'confirmed',
      notes: 'Предпочита неутрален цвят и по-къса форма.',
    }),
    buildAppointment({
      id: 'sample-appt-victoria-consult',
      at,
      start: '09:45',
      end: '10:00',
      staffId: 'sample-staff-maria',
      clientName: 'Виктория',
      clientPhone: '+359888333444',
      serviceId: 'sample-service-consult',
      status: 'confirmed',
    }),
    buildAppointment({
      id: 'sample-appt-desi-lashes',
      at,
      start: '10:00',
      end: '10:30',
      staffId: 'sample-staff-maria',
      clientName: 'Деси',
      clientPhone: '+359888555666',
      serviceId: 'sample-service-lashes',
      status: 'confirmed',
    }),
    buildAppointment({
      id: 'sample-appt-anna-haircut-message',
      at,
      start: '10:15',
      end: '11:15',
      staffId: 'sample-staff-nikol',
      clientName: 'Анна',
      clientPhone: '+359887111000',
      serviceId: 'sample-service-haircut',
      status: 'confirmed',
      notes: 'Ново съобщение: пита дали може да добави измиване.',
    }),
    buildAppointment({
      id: 'sample-appt-gergana-color',
      at,
      start: '11:30',
      end: '13:00',
      staffId: 'sample-staff-elena',
      clientName: 'Гергана',
      clientPhone: '+359887222000',
      serviceId: 'sample-service-color',
      status: 'confirmed',
      visitProgress: 'checked_in',
    }),
    buildAppointment({
      id: 'sample-appt-iva-pedicure-progress',
      at,
      start: '12:00',
      end: '14:00',
      staffId: 'sample-staff-ani',
      clientName: 'Ива',
      clientPhone: '+359887333000',
      serviceId: 'sample-service-pedicure',
      status: 'confirmed',
      visitProgress: 'in_service',
      notes: 'Клиентът е в салона. Следващата стъпка е лак.',
    }),
    buildAppointment({
      id: 'sample-appt-victoria-haircut',
      at,
      start: '14:15',
      end: '14:45',
      staffId: 'sample-staff-nikol',
      clientName: 'Виктория',
      clientPhone: '+359888333444',
      serviceId: 'sample-service-haircut',
      status: 'confirmed',
    }),
  ];
  const waitlistEntries: WaitlistEntry[] = [
    buildWaitlistEntry({
      id: 'sample-waitlist-no-time',
      at,
      clientName: 'Ива',
      clientPhone: '+359887444000',
      serviceId: 'sample-service-manicure',
      status: 'waiting',
      desiredDate: null,
      desiredFrom: null,
      desiredTo: null,
      staffId: null,
      notes: 'Заявка без точен час. Клиентът може след 15:00.',
    }),
  ];
  const projection = buildCalendarV2Projection(
    {
      appointments: scheduledAppointments,
      waitlist: waitlistEntries,
    },
    { services: SAMPLE_SERVICES },
  );
  const blockedBlock: CalendarV2CalendarBlock = {
    id: 'sample-block-nikol-break',
    sourceEntityType: 'staff_exception',
    sourceEntityId: 'sample-break-nikol',
    kind: 'blocked_time',
    startAt: at('15:00'),
    endAt: at('15:30'),
    staffId: 'sample-staff-nikol',
    title: 'Пауза',
    subtitle: 'Блокирано време',
    color: '#94a3b8',
    schedulingState: 'scheduled',
    actionState: 'none',
  };
  const calendarBlocks = sortCalendarBlocks([
    ...projection.calendarBlocks.map(markSampleAppointmentCues),
    blockedBlock,
  ]);

  return {
    ...projection,
    calendarBlocks,
    resources: SAMPLE_STAFF.map((staff) => ({
      id: staff.id,
      name: staff.name,
      color: staff.color,
    })),
    actionItems: buildSampleActionInboxItems(at),
    sourceAppointments: scheduledAppointments,
    sourceWaitlistEntries: waitlistEntries,
    blockedBlocks: [blockedBlock],
  };
}

function buildSampleActionInboxItems(at: (time: string) => string): ActionInboxItem[] {
  return [
    buildActionInboxItem({
      id: 'sample-action-no-time',
      group: 'needs_scheduling',
      source: 'waitlist',
      sourceId: 'sample-waitlist-no-time',
      title: 'Заявка без точен час',
      subtitle: 'Ива · Маникюр · след 15:00',
      sortAt: at('07:55'),
      primaryType: 'placeRequest',
      primaryLabel: 'Постави в графика',
      commandType: 'placeRequest',
    }),
    buildActionInboxItem({
      id: 'sample-action-approval',
      group: 'needs_approval',
      source: 'appointment',
      sourceId: 'sample-request-lashes',
      title: 'Чака одобрение',
      subtitle: 'Виктория · Мигли · заявка за 16:30',
      sortAt: at('08:10'),
      primaryType: 'confirmRequest',
      primaryLabel: 'Confirm request',
      commandType: 'confirmRequest',
    }),
    buildActionInboxItem({
      id: 'sample-action-recovery',
      group: 'needs_recovery',
      source: 'appointment',
      sourceId: 'sample-cancelled-haircut',
      title: 'Отменен час за запълване',
      subtitle: 'Анна · Подстригване · освободен 15:30-16:30',
      sortAt: at('08:20'),
      primaryType: 'replyToClient',
      primaryLabel: 'Reply to client',
    }),
    buildActionInboxItem({
      id: 'sample-action-client-message',
      group: 'needs_reply',
      source: 'notification',
      sourceId: 'sample-message-maria',
      title: 'Клиентско съобщение',
      subtitle: 'Мария Иванова пита за промяна на часа.',
      sortAt: at('08:35'),
      primaryType: 'replyToClient',
      primaryLabel: 'Reply to client',
    }),
  ];
}

function buildActionInboxItem({
  id,
  group,
  source,
  sourceId,
  title,
  subtitle,
  sortAt,
  primaryType,
  primaryLabel,
  commandType,
}: {
  id: string;
  group: ActionInboxItem['group'];
  source: ActionInboxItem['source'];
  sourceId: string;
  title: string;
  subtitle: string;
  sortAt: string;
  primaryType: NonNullable<ActionInboxItem['primaryAction']>['type'];
  primaryLabel: string;
  commandType?: NonNullable<ActionInboxItem['primaryAction']>['commandType'];
}): ActionInboxItem {
  return {
    id,
    bucket: 'requires_action',
    group,
    status: 'open',
    source,
    sourceId,
    title,
    subtitle,
    sortAt,
    primaryAction: {
      type: primaryType,
      label: primaryLabel,
      ...(commandType ? { commandType } : {}),
    },
    secondaryActions: [
      {
        type: 'openDetails',
        label: 'Open details',
      },
    ],
  };
}

function markSampleAppointmentCues(block: CalendarV2CalendarBlock): CalendarV2CalendarBlock {
  if (!block.appointment) return block;

  if (block.id === 'sample-appt-anna-haircut-message') {
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
      sat: { open: '08:00', close: '20:00', isOpen: true },
      sun: { open: '08:00', close: '20:00', isOpen: true },
    },
  };
}

function buildService(
  id: string,
  name: string,
  durationMinutes: number,
  price: number | null,
): Service {
  return {
    id,
    name,
    category: 'Sample day',
    duration_minutes: durationMinutes,
    price,
    is_public: true,
  };
}

function buildAppointment({
  id,
  at,
  start,
  end,
  staffId,
  clientName,
  clientPhone,
  serviceId,
  status,
  visitProgress,
  notes = null,
}: {
  id: string;
  at: (time: string) => string;
  start: string;
  end: string;
  staffId: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  status: string;
  visitProgress?: Appointment['visit_progress'];
  notes?: string | null;
}): Appointment {
  const service = SAMPLE_SERVICES.find((item) => item.id === serviceId);
  const staff = SAMPLE_STAFF.find((item) => item.id === staffId);

  if (!service || !staff) {
    throw new Error(`Invalid Calendar V2 sample appointment: ${id}`);
  }

  return {
    id,
    start_at: at(start),
    end_at: at(end),
    status,
    owner_view_state: status,
    owner_view_label: status,
    visit_progress: visitProgress ?? 'scheduled',
    service_id: service.id,
    staff_id: staff.id,
    client_name: clientName,
    client_phone: clientPhone,
    service_name: service.name,
    service_color: getServiceColor(service.id),
    staff_name: staff.name,
    staff_color: staff.color,
    price: service.price,
    internal_notes: notes,
    cancelled_by: null,
  };
}

function buildWaitlistEntry({
  id,
  at,
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
  at: (time: string) => string;
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
  const service = SAMPLE_SERVICES.find((item) => item.id === serviceId);
  const staff = staffId ? SAMPLE_STAFF.find((item) => item.id === staffId) : null;

  if (!service || (staffId && !staff)) {
    throw new Error(`Invalid Calendar V2 sample waitlist entry: ${id}`);
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
    created_at: at('07:45'),
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

function getServiceColor(serviceId: string) {
  return SAMPLE_SERVICE_COLORS[serviceId] ?? '#64748b';
}

const SAMPLE_SERVICE_COLORS: Record<string, string> = {
  'sample-service-manicure': '#0f766e',
  'sample-service-haircut': '#2563eb',
  'sample-service-color': '#ea580c',
  'sample-service-lashes': '#7c3aed',
  'sample-service-pedicure': '#db2777',
  'sample-service-consult': '#64748b',
};

function sortCalendarBlocks(blocks: CalendarV2CalendarBlock[]) {
  return [...blocks].sort(
    (left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
  );
}
