import { differenceInMinutes, format, isSameDay } from 'date-fns';
import { bg } from 'date-fns/locale';

export interface Appointment {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  intake_data?: unknown;
  cancelled_by?: 'client' | 'owner' | null;
  owner_view_state?: string;
  owner_view_label?: string;
  visit_progress?: 'scheduled' | 'checked_in' | 'in_service' | 'completed' | 'no_show';
  visit_progress_label?: string;
  service_id: string;
  staff_id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  service_color: string;
  staff_name: string;
  staff_color: string;
  price: number | null;
  internal_notes: string | null;
}

export interface Service {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price: number | null;
  is_public: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  color: string;
}

export interface Slot {
  start: string;
  end: string;
}

export interface ClientSuggestion {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  total_visits: number;
}

export interface CalendarBoardStaff {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  accepts_online: boolean;
  working_hours: Record<string, { open: string; close: string; isOpen: boolean }>;
}

export interface StaffException {
  id: string;
  staff_id: string;
  type: string;
  start_at: string;
  end_at: string;
  note: string | null;
  created_at?: string;
  staff_name?: string;
  staff_color?: string;
}

export interface WaitlistEntry {
  id: string;
  status: 'waiting' | 'notified' | 'booked' | 'cancelled';
  desired_date: string | null;
  desired_from: string | null;
  desired_to: string | null;
  notified_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  booked_appointment_id: string | null;
  last_notified_slot_start_at: string | null;
  client_id: string;
  client_name: string;
  client_phone: string;
  service_id: string;
  service_name: string;
  staff_id: string | null;
  staff_name: string | null;
  staff_color: string | null;
}

export interface CalendarBoardResponse {
  staff: CalendarBoardStaff[];
  appointments: Appointment[];
  exceptions: StaffException[];
  waitlist: WaitlistEntry[];
}

export interface NotificationLogEntry {
  id: string;
  channel: string;
  type: string;
  status: string;
  external_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface AppointmentContextResponse {
  appointment: Appointment & {
    client_id: string;
    client_email: string | null;
    client_salutation: string;
    client_name_source: 'owner' | 'client_submitted';
    original_client_name: string;
    cancellation_reason: string | null;
    cancelled_by: 'client' | 'owner' | null;
    created_at: string;
    owner_view_state: string;
    owner_view_label: string;
  };
  notifications: NotificationLogEntry[];
  notification_summary: {
    total: number;
    failed: number;
    sent: number;
    last_event_at: string | null;
  };
  delivery_profile: {
    owner_telegram: boolean;
    client_telegram: boolean;
    client_sms_fallback: boolean;
    client_consent: boolean;
  };
  waitlist_candidates: WaitlistEntry[];
}

export const CALENDAR_SLOT_MINUTES = 15;
export type CalendarViewMode = 'day' | 'week';
export type CalendarDropPreview = {
  staffId: string;
  startAt: string;
} | null;
export const REQUEST_OWNER_STATES = ['pending', 'requested', 'proposal_pending', 'proposal_sent'] as const;
export const BOOKED_OWNER_STATES = ['confirmed', 'approved', 'booked_direct', 'proposal_accepted', 'completed'] as const;
export const CANCELLED_OWNER_STATES = [
  'cancelled',
  'rejected',
  'proposal_rejected',
  'cancelled_by_owner',
  'cancelled_by_client',
] as const;

export function sortByStartAt<T extends { start_at: string }>(items: T[] | undefined) {
  return [...(items ?? [])].sort(
    (left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime(),
  );
}

export function getWorkingDayKey(value: Date) {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[value.getDay()] || 'mon';
}

export function getCalendarOwnerState(item: { status?: string; owner_view_state?: string }) {
  if (item.status === 'cancelled') {
    return 'cancelled';
  }

  return item.owner_view_state || item.status || 'pending';
}

export function isRequestOwnerState(item: { status?: string; owner_view_state?: string }) {
  return REQUEST_OWNER_STATES.includes(
    getCalendarOwnerState(item) as (typeof REQUEST_OWNER_STATES)[number],
  );
}

export function isCancelledCalendarItem(item: { status?: string; owner_view_state?: string }) {
  if (item.status === 'cancelled') {
    return true;
  }

  return CANCELLED_OWNER_STATES.includes(
    getCalendarOwnerState(item) as (typeof CANCELLED_OWNER_STATES)[number],
  );
}

export function formatAppointmentDay(value: string) {
  return format(new Date(value), "d MMM yyyy '·' HH:mm", { locale: bg });
}

export function formatCalendarLabel(value: Date) {
  return format(value, "EEEE, d MMMM yyyy 'г.'", { locale: bg });
}

export function formatTimeLabel(value: string) {
  return format(new Date(value), 'HH:mm');
}

export function timeLabelToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function getMinutesFromIso(value: string) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

export function getMinuteOffset(value: string, startHour: number) {
  return getMinutesFromIso(value) - startHour * 60;
}

export function getEventDurationMinutes(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) return CALENDAR_SLOT_MINUTES;
  const duration = differenceInMinutes(new Date(endAt), new Date(startAt));
  return Math.max(duration || CALENDAR_SLOT_MINUTES, CALENDAR_SLOT_MINUTES);
}

export function getEventLayoutMetrics(
  startAt: string,
  endAt: string,
  startHour: number,
  pixelsPerHour: number,
  minimumHeight: number,
) {
  const startOffset = getMinuteOffset(startAt, startHour);
  const endOffset = getMinuteOffset(endAt, startHour);
  const top = Math.max((startOffset / 60) * pixelsPerHour, 0);
  const height = Math.max(((endOffset - startOffset) / 60) * pixelsPerHour, minimumHeight);

  return { top, height };
}

export function overlapsRange(startAt: string | Date, endAt: string | Date, otherStartAt: string | Date, otherEndAt: string | Date) {
  return new Date(startAt).getTime() < new Date(otherEndAt).getTime() &&
    new Date(endAt).getTime() > new Date(otherStartAt).getTime();
}

export function buildCalendarRange({
  appointments,
  staffMembers,
  exceptions,
  days,
}: {
  appointments: Appointment[];
  staffMembers: Array<Pick<CalendarBoardStaff, 'working_hours'>>;
  exceptions: StaffException[];
  days: Date[];
}) {
  const markers: number[] = [];

  for (const appointment of appointments) {
    markers.push(getMinutesFromIso(appointment.start_at), getMinutesFromIso(appointment.end_at));
  }

  for (const exception of exceptions) {
    markers.push(getMinutesFromIso(exception.start_at), getMinutesFromIso(exception.end_at));
  }

  for (const day of days) {
    const dayKey = getWorkingDayKey(day);
    for (const staffMember of staffMembers) {
      const schedule = staffMember.working_hours?.[dayKey];
      if (!schedule?.isOpen) continue;

      const openMinutes = timeLabelToMinutes(schedule.open);
      const closeMinutes = timeLabelToMinutes(schedule.close);
      if (openMinutes != null) markers.push(openMinutes);
      if (closeMinutes != null) markers.push(closeMinutes);
    }
  }

  if (!markers.length) {
    return { startHour: 7, endHour: 21 };
  }

  const rawStart = Math.floor(Math.min(...markers) / 60) - 1;
  const rawEnd = Math.ceil(Math.max(...markers) / 60) + 1;
  const startHour = Math.max(5, rawStart);
  const endHour = Math.min(23, Math.max(rawEnd, startHour + 10));

  return { startHour, endHour };
}

export function buildCalendarGridMetrics(
  range: { startHour: number; endHour: number },
  pixelsPerHour: number,
) {
  const slotHeight = pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES);
  const height = (range.endHour - range.startHour) * pixelsPerHour;
  const slotCount = Math.max(
    1,
    (range.endHour - range.startHour) * (60 / CALENDAR_SLOT_MINUTES),
  );

  return {
    height,
    slotHeight,
    hourSlots: Array.from(
      { length: range.endHour - range.startHour + 1 },
      (_, index) => range.startHour + index,
    ),
    dropSlots: Array.from({ length: slotCount }, (_, index) => {
      const totalMinutes = range.startHour * 60 + index * CALENDAR_SLOT_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;

      return {
        key: `${hour}-${minute}`,
        top: index * slotHeight,
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      };
    }),
  };
}

export function buildExceptionBlocks(
  schedule: CalendarBoardStaff['working_hours'][string] | undefined,
  exceptions: StaffException[],
  day: Date,
  calendarHeight: number,
  rangeStartHour: number,
  pixelsPerHour: number,
) {
  const overlays: Array<{
    id?: string;
    top: number;
    height: number;
    label: string;
    tone: 'quiet' | 'blocked';
    block?: StaffException;
  }> = [];

  if (!schedule?.isOpen) {
    overlays.push({
      top: 0,
      height: calendarHeight,
      label: 'Почивен ден',
      tone: 'quiet',
    });
  } else {
    const openMinutes = timeLabelToMinutes(schedule.open);
    const closeMinutes = timeLabelToMinutes(schedule.close);

    if (openMinutes != null) {
      const openOffset = ((openMinutes - rangeStartHour * 60) / 60) * pixelsPerHour;
      if (openOffset > 0) {
        overlays.push({
          top: 0,
          height: openOffset,
          label: 'Извън работно време',
          tone: 'quiet',
        });
      }
    }

    if (closeMinutes != null) {
      const closeOffset = ((closeMinutes - rangeStartHour * 60) / 60) * pixelsPerHour;
      if (closeOffset < calendarHeight) {
        overlays.push({
          top: Math.max(closeOffset, 0),
          height: Math.max(calendarHeight - closeOffset, 0),
          label: 'Извън работно време',
          tone: 'quiet',
        });
      }
    }
  }

  for (const exception of exceptions) {
    if (!isSameDay(new Date(exception.start_at), day)) continue;

    const top = Math.max((getMinuteOffset(exception.start_at, rangeStartHour) / 60) * pixelsPerHour, 0);
    const bottom = Math.min((getMinuteOffset(exception.end_at, rangeStartHour) / 60) * pixelsPerHour, calendarHeight);
    overlays.push({
      id: exception.id,
      top,
      height: Math.max(bottom - top, 38),
      label: exception.note?.trim() || 'Блокирано време',
      tone: 'blocked',
      block: exception,
    });
  }

  return overlays;
}

export function colorWithAlpha(color: string | undefined, alpha: string, fallback: string) {
  if (!color) return fallback;
  const normalized = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return `${normalized}${alpha}`;
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const expanded = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
    return `${expanded}${alpha}`;
  }
  return fallback;
}

export function getStatusTone(item: { status?: string; owner_view_state?: string }) {
  const key = getCalendarOwnerState(item);

  if (REQUEST_OWNER_STATES.includes(key as (typeof REQUEST_OWNER_STATES)[number])) {
    return {
      label: 'Чака решение',
      chip: 'border-amber-200 bg-amber-50 text-amber-700',
      accent: '#f59e0b',
    };
  }

  if (CANCELLED_OWNER_STATES.includes(key as (typeof CANCELLED_OWNER_STATES)[number])) {
    return {
      label: 'Затворен',
      chip: 'border-rose-200 bg-rose-50 text-rose-700',
      accent: '#f43f5e',
    };
  }

  if (key === 'completed' || key === 'no_show') {
    return {
      label: 'Приключен',
      chip: 'border-slate-200 bg-slate-100 text-slate-600',
      accent: '#64748b',
    };
  }

  return {
    label: 'Потвърден',
    chip: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    accent: '#10b981',
  };
}

type AppointmentLayout = {
  lane: number;
  laneCount: number;
};

export function buildAppointmentLanes(appointments: Appointment[]) {
  const sorted = sortByStartAt(appointments);
  const layout = new Map<string, AppointmentLayout>();

  let cluster: Array<{ id: string; lane: number }> = [];
  let laneEndTimes: number[] = [];
  let clusterEnd = -Infinity;

  const finalizeCluster = () => {
    if (!cluster.length) return;
    const laneCount = Math.max(...cluster.map((item) => item.lane), 0) + 1;
    for (const item of cluster) {
      layout.set(item.id, {
        lane: item.lane,
        laneCount,
      });
    }
    cluster = [];
    laneEndTimes = [];
    clusterEnd = -Infinity;
  };

  for (const appointment of sorted) {
    const start = new Date(appointment.start_at).getTime();
    const end = new Date(appointment.end_at).getTime();

    if (cluster.length && start >= clusterEnd) {
      finalizeCluster();
    }

    let lane = laneEndTimes.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEndTimes.length;
    }
    laneEndTimes[lane] = end;
    cluster.push({ id: appointment.id, lane });
    clusterEnd = Math.max(clusterEnd, end);
  }

  finalizeCluster();
  return layout;
}

export function getRequestWindowLabel(entry: WaitlistEntry) {
  if (!entry.desired_date && !entry.desired_from && !entry.desired_to) {
    return 'Няма предпочитан ден';
  }

  const day = entry.desired_date
    ? format(new Date(`${entry.desired_date}T00:00:00`), "d MMMM", { locale: bg })
    : 'Свободен ден';

  if (entry.desired_from && entry.desired_to) {
    return `${day} · ${entry.desired_from.slice(0, 5)}-${entry.desired_to.slice(0, 5)}`;
  }

  return day;
}

export function getWaitlistStatusPresentation(status: WaitlistEntry['status']) {
  const config: Record<WaitlistEntry['status'], { label: string; cls: string }> = {
    waiting: { label: 'Чака', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    notified: { label: 'Уведомен', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
    booked: { label: 'Записан', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    cancelled: { label: 'Архивиран', cls: 'border-slate-200 bg-slate-100 text-slate-600' },
  };

  return config[status];
}
