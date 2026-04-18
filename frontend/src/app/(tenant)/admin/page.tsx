'use client';

import axios from 'axios';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays, isToday, startOfDay, endOfDay, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, differenceInMinutes, startOfMonth, endOfMonth } from 'date-fns';
import { bg } from 'date-fns/locale';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CalendarDays,
  LayoutGrid,
  Loader2,
  Mail,
  Plus,
  SlidersHorizontal,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { MobileDayBoard } from '@/components/admin/mobile-day-board';
import { MobileBottomSheet } from '@/components/admin/mobile-bottom-sheet';
import {
  formatBulgarianPhoneForDisplay,
  normalizeBulgarianPhone,
} from '@/lib/phone';
import { useTenant } from '@/lib/tenant-context';

interface Appointment {
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

interface UpcomingAppointment {
  id: string;
  start_at: string;
  end_at: string;
  staff_id: string;
  service_id: string;
  intake_data?: unknown;
  client_name: string;
  client_phone: string;
  service_name: string;
  staff_name: string;
  status: string;
  cancelled_by?: 'client' | 'owner' | null;
  owner_view_state?: string;
  owner_view_label?: string;
  owner_alert_state?: string;
  proposal_decision?: string;
  visit_progress?: 'scheduled' | 'checked_in' | 'in_service' | 'completed' | 'no_show';
  visit_progress_label?: string;
}

interface Service {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price: number | null;
  is_public: boolean;
}

interface StaffMember {
  id: string;
  name: string;
  color: string;
}

interface Slot {
  start: string;
  end: string;
}

interface ClientSuggestion {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  total_visits: number;
}

interface BookingPrefill {
  date: string;
  staffId: string;
  preferredSlot: string;
}

type MoveTarget = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  staff_id: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  staff_name: string;
  source: 'appointment' | 'request';
};

interface NotificationLogEntry {
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

interface CalendarBoardStaff {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  accepts_online: boolean;
  working_hours: Record<string, { open: string; close: string; isOpen: boolean }>;
}

interface StaffException {
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

interface WaitlistEntry {
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

interface CalendarBoardResponse {
  staff: CalendarBoardStaff[];
  appointments: Appointment[];
  exceptions: StaffException[];
  waitlist: WaitlistEntry[];
}

interface AppointmentContextResponse {
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

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  requested: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  proposal_pending: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  proposal_sent: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  confirmed: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  approved: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  booked_direct: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  proposal_accepted: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  completed: { label: 'Приключен', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  cancelled: { label: 'Отменен', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  rejected: { label: 'Отказан', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  proposal_rejected: { label: 'Отказан', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  cancelled_by_owner: { label: 'Отменен', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  cancelled_by_client: { label: 'Отменен', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  no_show: { label: 'Неявил се', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const STATUS_FILTER_OPTIONS = [
  { key: 'active', label: 'Активни' },
  { key: 'requests', label: 'Заявки' },
  { key: 'booked', label: 'Запазени' },
  { key: 'cancelled', label: 'Отказани / отменени' },
] as const;

const REQUEST_OWNER_STATES = ['pending', 'requested', 'proposal_pending', 'proposal_sent'] as const;
const BOOKED_OWNER_STATES = ['confirmed', 'approved', 'booked_direct', 'proposal_accepted', 'completed'] as const;
const CANCELLED_OWNER_STATES = [
  'cancelled',
  'rejected',
  'proposal_rejected',
  'cancelled_by_owner',
  'cancelled_by_client',
] as const;
const SECONDARY_OWNER_STATES = [
  'completed',
  'no_show',
  'cancelled',
  'rejected',
  'proposal_rejected',
  'cancelled_by_owner',
  'cancelled_by_client',
] as const;

const CALENDAR_SLOT_MINUTES = 15;
const LONG_PRESS_DELAY_MS = 420;
const LONG_PRESS_MOVE_TOLERANCE_PX = 14;

type InboxBucket = 'actions' | 'updates';
type CalendarStatusFilter = (typeof STATUS_FILTER_OPTIONS)[number]['key'];

type CalendarColumnRegistryEntry = {
  element: HTMLDivElement | null;
  staffId: string;
  day: Date;
  rangeStartHour: number;
  pixelsPerHour: number;
};

interface InboxItemView extends UpcomingAppointment {
  bucket: InboxBucket;
  label: string;
  summary: string;
  detailLabel: string;
  toneClass: string;
  requiresAction: boolean;
}

function buildInboxItem(appointment: UpcomingAppointment): InboxItemView {
  if (appointment.owner_alert_state === 'client_cancelled') {
    return {
      ...appointment,
      bucket: 'updates',
      label: 'Клиент отмени',
      summary: 'Потвърден час беше отменен от клиента.',
      detailLabel: 'Клиентска отмяна',
      toneClass: 'border-rose-200 bg-rose-50 text-rose-700',
      requiresAction: false,
    };
  }

  return {
    ...appointment,
    bucket: 'actions',
    label: 'Нова заявка',
    summary: 'Нова заявка за одобрение от админ панела.',
    detailLabel: 'Изисква решение',
    toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    requiresAction: true,
  };
}

function formatAppointmentDay(value: string) {
  return format(new Date(value), "d MMM yyyy '·' HH:mm", { locale: bg });
}

function getRescheduleErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    const normalizedMessage =
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.find((entry): entry is string => typeof entry === 'string')
          : null;

    if (
      status === 409 &&
      (normalizedMessage?.includes('зает') ||
        normalizedMessage?.includes('интервал') ||
        normalizedMessage?.includes('блокиран'))
    ) {
      return 'Този час вече е зает. Избери друг свободен час.';
    }

    if (status === 409) {
      return 'Не може да преместиш записа върху друг запис. Избери друг свободен час.';
    }

    if (normalizedMessage) {
      return normalizedMessage;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function sortByStartAt<T extends { start_at: string }>(items: T[] | undefined) {
  return [...(items ?? [])].sort(
    (left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime(),
  );
}

function getOwnerStatusPresentation(item: { status?: string; owner_view_state?: string; owner_view_label?: string }) {
  const key = item.owner_view_state || item.status || 'pending';
  const fallback = STATUS_CONFIG[item.status || 'pending'] ?? STATUS_CONFIG.pending;
  const config = STATUS_CONFIG[key] ?? fallback;

  return {
    label: item.owner_view_label || config.label,
    cls: config.cls,
  };
}

function formatEuroAmount(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `${new Intl.NumberFormat('bg-BG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)} €`;
}

function getAppointmentStatusCueClass(item: { status?: string; owner_view_state?: string }) {
  const key = item.owner_view_state || item.status || 'pending';

  if (['pending', 'requested', 'proposal_pending', 'proposal_sent'].includes(key)) {
    return 'bg-amber-400';
  }

  if (['cancelled', 'rejected', 'proposal_rejected', 'cancelled_by_owner', 'cancelled_by_client'].includes(key)) {
    return 'bg-rose-400';
  }

  if (['completed', 'no_show'].includes(key)) {
    return 'bg-slate-400';
  }

  return 'bg-emerald-400';
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function colorWithAlpha(color: string | undefined, alpha: string, fallback: string) {
  if (!color) return fallback;
  const normalized = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return `${normalized}${alpha}`;
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    const expanded = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
    return `${expanded}${alpha}`;
  }
  return fallback;
}

function buildCalendarRange(items: Appointment[]) {
  if (!items.length) {
    return { startHour: 8, endHour: 20 };
  }

  const starts = items.map((item) => {
    const date = new Date(item.start_at);
    return date.getHours() + date.getMinutes() / 60;
  });
  const ends = items.map((item) => {
    const date = new Date(item.end_at);
    return date.getHours() + date.getMinutes() / 60;
  });

  const rawStart = Math.floor(Math.min(...starts)) - 1;
  const rawEnd = Math.ceil(Math.max(...ends)) + 1;
  const startHour = Math.max(6, rawStart);
  const endHour = Math.min(23, Math.max(rawEnd, startHour + 8));

  return { startHour, endHour };
}

function getMinuteOffset(value: string, startHour: number) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes() - startHour * 60;
}

function getEventLayoutMetrics(
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

function getWorkingDayKey(value: Date) {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[value.getDay()] || 'mon';
}

function getExceptionTypeLabel(type: string) {
  const labels: Record<string, string> = {
    blocked: 'Блокирано време',
    vacation: 'Отпуск',
    sick: 'Болничен',
    partial_day: 'Частичен блок',
  };
  return labels[type] || 'Блокиран интервал';
}

function getWaitlistStatusPresentation(status: WaitlistEntry['status']) {
  const config: Record<WaitlistEntry['status'], { label: string; cls: string }> = {
    waiting: { label: 'Чака', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
    notified: { label: 'Уведомен', cls: 'border-sky-200 bg-sky-50 text-sky-700' },
    booked: { label: 'Записан', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
    cancelled: { label: 'Архивиран', cls: 'border-slate-200 bg-slate-100 text-slate-600' },
  };

  return config[status];
}

function getCalendarOwnerState(item: { status?: string; owner_view_state?: string }) {
  if (item.status === 'cancelled') {
    return 'cancelled';
  }

  return item.owner_view_state || item.status || 'pending';
}

function isCancelledCalendarItem(item: { status?: string; owner_view_state?: string }) {
  if (item.status === 'cancelled') {
    return true;
  }

  return CANCELLED_OWNER_STATES.includes(
    getCalendarOwnerState(item) as (typeof CANCELLED_OWNER_STATES)[number],
  );
}

function matchesCalendarStatusFilter(
  item: { status?: string; owner_view_state?: string },
  filter: CalendarStatusFilter,
) {
  const key = getCalendarOwnerState(item);

  if (filter === 'active') {
    return !isCancelledCalendarItem(item);
  }

  if (filter === 'requests') {
    return REQUEST_OWNER_STATES.includes(key as (typeof REQUEST_OWNER_STATES)[number]);
  }

  if (filter === 'booked') {
    return BOOKED_OWNER_STATES.includes(key as (typeof BOOKED_OWNER_STATES)[number]);
  }

  return isCancelledCalendarItem(item);
}

function isSecondaryOwnerState(ownerState?: string) {
  return SECONDARY_OWNER_STATES.includes((ownerState || 'pending') as (typeof SECONDARY_OWNER_STATES)[number]);
}

function overlapsRange(startAt: string | Date, endAt: string | Date, otherStartAt: string | Date, otherEndAt: string | Date) {
  return new Date(startAt).getTime() < new Date(otherEndAt).getTime() &&
    new Date(endAt).getTime() > new Date(otherStartAt).getTime();
}

function timeLabelToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function getEventDurationMinutes(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) return CALENDAR_SLOT_MINUTES;
  const duration = differenceInMinutes(new Date(endAt), new Date(startAt));
  return Math.max(duration || CALENDAR_SLOT_MINUTES, CALENDAR_SLOT_MINUTES);
}

function buildCalendarGridMetrics(
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

export default function AdminCalendarPage() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<BookingPrefill | null>(null);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [showDesktopDetails, setShowDesktopDetails] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [touchMoveTarget, setTouchMoveTarget] = useState<MoveTarget | null>(null);
  const [touchMoveMode, setTouchMoveMode] = useState<'gesture' | 'confirm' | null>(null);
  const [pendingTouchPlacement, setPendingTouchPlacement] = useState<{ startAt: string; staffId: string } | null>(null);
  const [calendarView, setCalendarView] = useState<'grid' | 'list' | 'week' | 'month'>('grid');
  const [calendarZoom, setCalendarZoom] = useState<'compact' | 'comfortable' | 'precise'>('comfortable');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>('active');
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const [draggedRequestId, setDraggedRequestId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ staffId: string; startAt: string } | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [resizingBlock, setResizingBlock] = useState<{
    id: string;
    edge: 'start' | 'end';
    staffId: string;
    type: string;
    note: string | null;
    originalStartAt: string;
    originalEndAt: string;
    previewStartAt: string;
    previewEndAt: string;
    columnTop: number;
    columnHeight: number;
    dayIso: string;
  } | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const touchPressRef = useRef<{
    target: MoveTarget;
    touchId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressTapUntilRef = useRef(0);
  const invalidDropHintRef = useRef('Пуснете върху свободен 15-минутен слот.');
  const didAutoSelectStaffRef = useRef(false);
  const calendarColumnRegistryRef = useRef<Record<string, CalendarColumnRegistryEntry>>({});
  const pointerDragRef = useRef<{
    target: MoveTarget;
    kind: 'appointment' | 'request';
    moved: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const [blockDraft, setBlockDraft] = useState({
    staffId: 'all',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '12:00',
    endTime: '13:00',
    type: 'blocked',
    note: '',
  });
  const [waitlistDraft, setWaitlistDraft] = useState({
    clientName: '',
    clientPhone: '',
    clientEmail: '',
    serviceId: '',
    staffId: '',
    desiredDate: format(new Date(), 'yyyy-MM-dd'),
    desiredFrom: '10:00',
    desiredTo: '11:00',
    notes: '',
  });
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const rangeStart = useMemo(
    () =>
      calendarView === 'week'
        ? startOfWeek(currentDate, { weekStartsOn: 1 })
        : calendarView === 'month'
          ? startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 })
          : startOfDay(currentDate),
    [calendarView, currentDate],
  );
  const rangeEndExclusive = useMemo(
    () =>
      calendarView === 'week'
        ? addDays(endOfWeek(currentDate, { weekStartsOn: 1 }), 1)
        : calendarView === 'month'
          ? addDays(endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }), 1)
        : addDays(endOfDay(currentDate), 1),
    [calendarView, currentDate],
  );

  const { data: calendarBoard, isLoading, refetch } = useQuery({
    queryKey: ['appointments-calendar-board', rangeStart.toISOString(), rangeEndExclusive.toISOString()],
    queryFn: () =>
      apiClient.get<CalendarBoardResponse>('/appointments/calendar-board', {
        from: rangeStart.toISOString(),
        to: rangeEndExclusive.toISOString(),
      }),
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: true,
  });

  const { data: adminServices = [] } = useQuery({
    queryKey: ['admin-calendar-services'],
    queryFn: () => apiClient.get<Service[]>('/services/admin'),
    staleTime: 60 * 1000,
  });

  const { data: waitlistEntries = [] } = useQuery({
    queryKey: ['appointments-waitlist', rangeStart.toISOString(), rangeEndExclusive.toISOString()],
    queryFn: () =>
      apiClient.get<WaitlistEntry[]>('/appointments/waitlist', {
        from: rangeStart.toISOString().slice(0, 10),
        to: addDays(rangeEndExclusive, -1).toISOString().slice(0, 10),
      }),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: true,
  });

  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: ['appointments-upcoming'],
    queryFn: () =>
      apiClient.get<UpcomingAppointment[]>('/appointments/upcoming', {
        limit: '12',
        mode: 'attention',
      }),
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: true,
  });

  const { data: selectedContext } = useQuery({
    queryKey: ['appointment-context', selectedRecordId],
    queryFn: () => apiClient.get<AppointmentContextResponse>(`/appointments/${selectedRecordId}/context`),
    enabled: Boolean(selectedRecordId),
    staleTime: 15 * 1000,
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startAt, staffId }: { id: string; startAt: string; staffId: string }) =>
      apiClient.patch(`/appointments/${id}/reschedule`, { startAt, staffId }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      qc.invalidateQueries({ queryKey: ['appointment-context'] });
      setTouchMoveTarget(null);
      setTouchMoveMode(null);
      setPendingTouchPlacement(null);
      setDropPreview(null);
      toast.success('Часът е преместен.');
    },
    onError: (error: any) => {
      toast.error(getRescheduleErrorMessage(error, 'Неуспешно преместване на часа.'));
    },
    onSettled: () => {
      setDraggedAppointmentId(null);
      setDropPreview(null);
    },
  });

  const createBlockMutation = useMutation({
    mutationFn: () => {
      const [year, month, day] = blockDraft.date.split('-').map(Number);
      const [startHour, startMinute] = blockDraft.startTime.split(':').map(Number);
      const [endHour, endMinute] = blockDraft.endTime.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, startHour, startMinute, 0, 0).toISOString();
      const endAt = new Date(year, month - 1, day, endHour, endMinute, 0, 0).toISOString();
      const payload = {
        staffId: blockDraft.staffId,
        startAt,
        endAt,
        type: blockDraft.type,
        note: blockDraft.note.trim() || undefined,
      };

      if (editingBlockId) {
        return apiClient.patch(`/appointments/staff-blocks/${editingBlockId}`, payload);
      }

      return apiClient.post('/appointments/staff-blocks', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      toast.success(editingBlockId ? 'Интервалът е обновен.' : 'Интервалът е блокиран.');
      setEditingBlockId(null);
      setBlockDraft((current) => ({ ...current, note: '' }));
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно запазване на интервала.');
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/appointments/staff-blocks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      if (editingBlockId) {
        setEditingBlockId(null);
      }
      toast.success('Блокираният интервал е изтрит.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно изтриване на блока.');
    },
  });

  const resizeBlockMutation = useMutation({
    mutationFn: ({
      id,
      staffId,
      startAt,
      endAt,
      type,
      note,
    }: {
      id: string;
      staffId: string;
      startAt: string;
      endAt: string;
      type: string;
      note?: string | null;
    }) => apiClient.patch(`/appointments/staff-blocks/${id}`, { staffId, startAt, endAt, type, note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно преоразмеряване на блока.');
    },
  });

  const waitlistCreateMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/appointments/waitlist', {
        clientName: waitlistDraft.clientName.trim(),
        clientPhone: normalizeBulgarianPhone(waitlistDraft.clientPhone),
        clientEmail: waitlistDraft.clientEmail.trim() || undefined,
        serviceId: waitlistDraft.serviceId,
        staffId: waitlistDraft.staffId || undefined,
        desiredDate: waitlistDraft.desiredDate || undefined,
        desiredFrom: waitlistDraft.desiredFrom || undefined,
        desiredTo: waitlistDraft.desiredTo || undefined,
        notes: waitlistDraft.notes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      toast.success('Клиентът е добавен в чакащи.');
      setWaitlistDraft((current) => ({
        ...current,
        clientName: '',
        clientPhone: '',
        clientEmail: '',
        notes: '',
      }));
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно добавяне в чакащи.');
    },
  });

  const waitlistStatusMutation = useMutation({
    mutationFn: ({ id, status, bookedAppointmentId }: { id: string; status: WaitlistEntry['status']; bookedAppointmentId?: string | null }) =>
      apiClient.patch(`/appointments/waitlist/${id}/status`, { status, bookedAppointmentId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      qc.invalidateQueries({ queryKey: ['appointment-context'] });
      toast.success('Статусът на чакащия клиент е обновен.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно обновяване на чакащия клиент.');
    },
  });

  const waitlistNotifyMutation = useMutation({
    mutationFn: ({
      id,
      slotStartAt,
      slotStaffId,
      appointmentId,
    }: {
      id: string;
      slotStartAt?: string | null;
      slotStaffId?: string | null;
      appointmentId?: string | null;
    }) =>
      apiClient.post(`/appointments/waitlist/${id}/notify`, {
        slotStartAt,
        slotStaffId,
        appointmentId,
        publicBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      qc.invalidateQueries({ queryKey: ['appointment-context'] });
      toast.success('Чакащият клиент е уведомен.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно известяване на чакащия клиент.');
    },
  });

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, { status });
      await refetch();
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      qc.invalidateQueries({ queryKey: ['appointment-context', id] });
      qc.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      if (status === 'cancelled' && statusFilter !== 'cancelled' && selectedRecordId === id) {
        setSelectedRecordId(null);
        setShowDesktopDetails(false);
        setShowMobileDetails(false);
      }
    } catch {
      toast.error('Грешка при смяна на статуса');
    }
  };

  const handleOwnerAlertRead = async (id: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/owner-alert-read`, {});
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      qc.invalidateQueries({ queryKey: ['appointment-context', id] });
    } catch {
      toast.error('Грешка при обновяване на известието.');
    }
  };

  const handleBookingCreated = (startAt: string) => {
    setShowBookingModal(false);
    setBookingPrefill(null);
    setCurrentDate(new Date(startAt));
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
    qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
    qc.invalidateQueries({ queryKey: ['appointment-context'] });
    qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
    qc.invalidateQueries({ queryKey: ['appointments-waitlist'] });
  };

  const clearTouchMoveState = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    touchPressRef.current = null;
    setTouchMoveTarget(null);
    setTouchMoveMode(null);
    setPendingTouchPlacement(null);
    setDropPreview(null);
  }, []);

  const openAppointmentMove = (appointment: Appointment) => {
    clearTouchMoveState();
    setShowMoveModal(true);
  };

  const handleDropReschedule = (appointmentId: string, startAt: string, staffId: string) => {
    const targetAppointment = (calendarBoard?.appointments ?? []).find((appointment) => appointment.id === appointmentId);
    if (!targetAppointment) {
      rescheduleMutation.mutate({ id: appointmentId, startAt, staffId });
      return;
    }

    const nextStart = new Date(startAt);
    const nextEnd = new Date(
      nextStart.getTime() +
        (new Date(targetAppointment.end_at).getTime() - new Date(targetAppointment.start_at).getTime()),
    );
    const hasConflict = (calendarBoard?.appointments ?? []).some((appointment) => {
      if (appointment.id === appointmentId || appointment.staff_id !== staffId) {
        return false;
      }

      if (['cancelled', 'no_show'].includes(appointment.status)) {
        return false;
      }

      return (
        new Date(appointment.start_at).getTime() < nextEnd.getTime() &&
        new Date(appointment.end_at).getTime() > nextStart.getTime()
      );
    });

    if (hasConflict) {
      toast.error('Този час вече е зает. Избери друг свободен час.');
      return;
    }

    rescheduleMutation.mutate({ id: appointmentId, startAt, staffId });
  };

  const resolveMovePlacement = useCallback(
    (target: MoveTarget, startAt: string, staffId: string) => {
      const allAppointments = calendarBoard?.appointments ?? [];
      const nextStart = new Date(startAt);
      const durationMs = new Date(target.end_at).getTime() - new Date(target.start_at).getTime();
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return { preview: null, reason: 'Неуспешно определяне на новия слот.' as string };
      }

      if (target.source === 'appointment' && !isSameDay(nextStart, new Date(target.start_at))) {
        return {
          preview: null,
          reason: 'Преместването в друг ден става от бутона „Премести“.',
        };
      }

      const nextEnd = new Date(nextStart.getTime() + durationMs);
      const staffMember = (calendarBoard?.staff ?? []).find((entry) => entry.id === staffId);
      if (!staffMember) {
        return { preview: null, reason: 'Специалистът не е намерен.' };
      }

      const dayKey = getWorkingDayKey(nextStart);
      const schedule = staffMember.working_hours?.[dayKey];
      if (!schedule?.isOpen) {
        return { preview: null, reason: 'Този ден е извън работното време на специалиста.' };
      }

      const [openHour, openMinute] = schedule.open.split(':').map(Number);
      const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
      const workStart = new Date(nextStart);
      workStart.setHours(openHour, openMinute, 0, 0);
      const workEnd = new Date(nextStart);
      workEnd.setHours(closeHour, closeMinute, 0, 0);

      if (nextStart.getTime() < workStart.getTime() || nextEnd.getTime() > workEnd.getTime()) {
        return { preview: null, reason: 'Изберете слот в работното време на специалиста.' };
      }

      const blockedByException = (calendarBoard?.exceptions ?? []).some(
        (exception) =>
          exception.staff_id === staffId &&
          overlapsRange(nextStart, nextEnd, exception.start_at, exception.end_at),
      );
      if (blockedByException) {
        return { preview: null, reason: 'Този интервал е блокиран.' };
      }

      const occupied = allAppointments.some(
        (appointment) =>
          appointment.id !== target.id &&
          appointment.staff_id === staffId &&
          !['cancelled', 'no_show'].includes(appointment.status) &&
          overlapsRange(nextStart, nextEnd, appointment.start_at, appointment.end_at),
      );
      if (occupied) {
        return { preview: null, reason: 'Този час е зает. Пуснете върху свободен слот.' };
      }

      return {
        preview: {
          staffId,
          startAt: nextStart.toISOString(),
        },
        reason: null,
      };
    },
    [calendarBoard?.appointments, calendarBoard?.exceptions, calendarBoard?.staff],
  );

  const registerCalendarColumn = useCallback(
    (
      key: string,
      staffId: string,
      day: Date,
      rangeStartHour: number,
      pixelsPerHour: number,
    ) => (node: HTMLDivElement | null) => {
      if (!node) {
        delete calendarColumnRegistryRef.current[key];
        return;
      }

      calendarColumnRegistryRef.current[key] = {
        element: node,
        staffId,
        day,
        rangeStartHour,
        pixelsPerHour,
      };
    },
    [],
  );

  const resolvePlacementFromClientPoint = useCallback(
    (target: MoveTarget, clientX: number, clientY: number) => {
      for (const entry of Object.values(calendarColumnRegistryRef.current)) {
        const rect = entry.element?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
          continue;
        }

        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
          continue;
        }

        const slotHeight = entry.pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES);
        const slotCount = Math.max(1, Math.floor(rect.height / slotHeight));
        const relativeY = Math.min(Math.max(clientY - rect.top, 0), Math.max(rect.height - 1, 0));
        const slotIndex = Math.min(Math.floor(relativeY / slotHeight), slotCount - 1);
        const totalMinutes = entry.rangeStartHour * 60 + slotIndex * CALENDAR_SLOT_MINUTES;
        const nextStart = new Date(entry.day);
        nextStart.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);

        const candidate = resolveMovePlacement(target, nextStart.toISOString(), entry.staffId);
        invalidDropHintRef.current = candidate.reason || 'Пуснете върху свободен 15-минутен слот.';
        return candidate.preview;
      }

      invalidDropHintRef.current = 'Пуснете върху свободен 15-минутен слот.';
      return null;
    },
    [resolveMovePlacement],
  );

  const clearDesktopDragState = useCallback(() => {
    pointerDragRef.current = null;
    setDraggedAppointmentId(null);
    setDraggedRequestId(null);
    setDropPreview(null);
  }, []);

  const beginDesktopPointerDrag = useCallback(
    (target: MoveTarget, kind: 'appointment' | 'request', startX: number, startY: number) => {
      if (isCompactViewport || typeof window === 'undefined') return;
      pointerDragRef.current = { target, kind, moved: false, startX, startY };
    },
    [isCompactViewport],
  );

  const handleRequestPlacement = async (requestId: string, startAt: string, staffId: string) => {
    const request = inboxItems.find((item) => item.id === requestId);
    if (!request) {
      toast.error('Заявката не е намерена.');
      return;
    }

    try {
      const sameSlot =
        request.staff_id === staffId &&
        new Date(request.start_at).toISOString() === new Date(startAt).toISOString();

      if (!sameSlot) {
        const nextStart = new Date(startAt);
        const nextEnd = new Date(
          nextStart.getTime() + (new Date(request.end_at).getTime() - new Date(request.start_at).getTime()),
        );
        const hasConflict = (calendarBoard?.appointments ?? []).some((appointment) => {
          if (appointment.id === requestId || appointment.staff_id !== staffId) {
            return false;
          }

          if (['cancelled', 'no_show'].includes(appointment.status)) {
            return false;
          }

          return (
            new Date(appointment.start_at).getTime() < nextEnd.getTime() &&
            new Date(appointment.end_at).getTime() > nextStart.getTime()
          );
        });

        if (hasConflict) {
          toast.error('Този час вече е зает. Избери друг свободен час.');
          return;
        }

        await apiClient.patch(`/appointments/${requestId}/reschedule`, { startAt, staffId });
      }

      await apiClient.patch(`/appointments/${requestId}/status`, { status: 'confirmed' });
      await refetch();
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      qc.invalidateQueries({ queryKey: ['appointment-context'] });
      setDraggedRequestId(null);
      setDropPreview(null);
      setTouchMoveTarget(null);
      setTouchMoveMode(null);
      setPendingTouchPlacement(null);
      setShowRequestsPanel(false);
      toast.success(sameSlot ? 'Заявката е потвърдена.' : 'Часът е преместен и потвърден.');
    } catch (error: any) {
      toast.error(getRescheduleErrorMessage(error, 'Неуспешно потвърждение на заявката.'));
    }
  };

  const confirmTouchMove = async () => {
    if (!touchMoveTarget || !pendingTouchPlacement || touchMoveMode !== 'confirm') return;

    if (touchMoveTarget.source === 'request') {
      await handleRequestPlacement(touchMoveTarget.id, pendingTouchPlacement.startAt, pendingTouchPlacement.staffId);
      return;
    }

    handleDropReschedule(touchMoveTarget.id, pendingTouchPlacement.startAt, pendingTouchPlacement.staffId);
  };

  const appointments = calendarBoard?.appointments ?? [];
  const dayAppointments = useMemo(
    () => sortByStartAt(appointments.filter((item) => isSameDay(new Date(item.start_at), currentDate))),
    [appointments, currentDate],
  );
  const calendarStaff = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; color: string; appointments: Appointment[]; working_hours: CalendarBoardStaff['working_hours'] }>();

    for (const staffMember of calendarBoard?.staff ?? []) {
      grouped.set(staffMember.id, {
        id: staffMember.id,
        name: staffMember.name,
        color: staffMember.color || '#D946EF',
        appointments: [],
        working_hours: staffMember.working_hours,
      });
    }

    for (const appointment of appointments) {
      const existing = grouped.get(appointment.staff_id);
      if (existing) {
        existing.appointments.push(appointment);
        continue;
      }

      grouped.set(appointment.staff_id, {
        id: appointment.staff_id,
        name: appointment.staff_name,
        color: appointment.staff_color || appointment.service_color || '#D946EF',
        appointments: [appointment],
        working_hours: {},
      });
    }

    return [...grouped.values()].sort((left, right) => left.name.localeCompare(right.name, 'bg'));
  }, [appointments, calendarBoard?.staff]);
  const inboxItems = useMemo(() => sortByStartAt(upcoming).map(buildInboxItem), [upcoming]);
  const actionItems = useMemo(
    () => inboxItems.filter((item) => item.bucket === 'actions'),
    [inboxItems],
  );
  const updateItems = useMemo(
    () => inboxItems.filter((item) => item.bucket === 'updates'),
    [inboxItems],
  );
  const selectedAppointment = useMemo(
    () => dayAppointments.find((appointment) => appointment.id === selectedRecordId) ?? null,
    [dayAppointments, selectedRecordId],
  );
  const selectedInboxItem = useMemo(
    () => inboxItems.find((appointment) => appointment.id === selectedRecordId) ?? null,
    [inboxItems, selectedRecordId],
  );
  const detailedAppointment = selectedContext?.appointment ?? selectedAppointment;
  const moveTargetAppointment = detailedAppointment ?? null;
  const activeWaitlistEntries = useMemo(
    () => waitlistEntries.filter((entry) => ['waiting', 'notified'].includes(entry.status)),
    [waitlistEntries],
  );

  const attentionCount = actionItems.length;
  const updateCount = updateItems.length;
  const filteredDayAppointments = useMemo(
    () =>
      dayAppointments.filter(
        (item) =>
          (staffFilter === 'all' ? true : item.staff_id === staffFilter) &&
          matchesCalendarStatusFilter(item, statusFilter),
      ),
    [dayAppointments, staffFilter, statusFilter],
  );
  const appointmentsInView = useMemo(
    () =>
      calendarView === 'week' || calendarView === 'month'
        ? sortByStartAt(
            appointments.filter(
              (item) =>
                (staffFilter === 'all' ? true : item.staff_id === staffFilter) &&
                matchesCalendarStatusFilter(item, statusFilter),
            ),
          )
        : filteredDayAppointments,
    [appointments, calendarView, filteredDayAppointments, staffFilter, statusFilter],
  );
  const totalRevenue = useMemo(
    () =>
      appointmentsInView.reduce((sum, appointment) => {
        const ownerState = appointment.owner_view_state || appointment.status;
        if (!['confirmed', 'approved', 'booked_direct', 'proposal_accepted', 'completed'].includes(ownerState)) {
          return sum;
        }
        return sum + Number(appointment.price ?? 0);
      }, 0),
    [appointmentsInView],
  );
  const confirmedInView = useMemo(
    () =>
      appointmentsInView.filter((appointment) =>
        ['confirmed', 'approved', 'booked_direct', 'proposal_accepted'].includes(
          getCalendarOwnerState(appointment),
        ),
      ).length,
    [appointmentsInView],
  );
  const pendingInView = useMemo(
    () =>
      appointmentsInView.filter((appointment) =>
        REQUEST_OWNER_STATES.includes(
          getCalendarOwnerState(appointment) as (typeof REQUEST_OWNER_STATES)[number],
        ),
      ).length,
    [appointmentsInView],
  );
  const weekDays = useMemo(
    () =>
      calendarView === 'week'
        ? eachDayOfInterval({ start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) })
        : [currentDate],
    [calendarView, currentDate],
  );
  const monthDays = useMemo(
    () =>
      calendarView === 'month'
        ? eachDayOfInterval({
            start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
            end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
          })
        : [],
    [calendarView, currentDate],
  );
  const visibleStaffColumns = useMemo(
    () => (staffFilter === 'all' ? calendarStaff : calendarStaff.filter((staff) => staff.id === staffFilter)),
    [calendarStaff, staffFilter],
  );
  const visibleExceptions = useMemo(
    () =>
      (calendarBoard?.exceptions ?? []).filter(
        (exception) =>
          (staffFilter === 'all' || exception.staff_id === staffFilter) &&
          (calendarView !== 'week' ? isSameDay(new Date(exception.start_at), currentDate) : true),
      ),
    [calendarBoard?.exceptions, calendarView, currentDate, staffFilter],
  );
  const compactDayAppointments = useMemo(
    () =>
      sortByStartAt(
        appointments.filter(
          (item) =>
            isSameDay(new Date(item.start_at), currentDate) &&
            (staffFilter === 'all' ? true : item.staff_id === staffFilter) &&
            matchesCalendarStatusFilter(item, statusFilter),
        ),
      ),
    [appointments, currentDate, staffFilter, statusFilter],
  );
  const compactDayExceptions = useMemo(
    () =>
      (calendarBoard?.exceptions ?? []).filter(
        (exception) =>
          isSameDay(new Date(exception.start_at), currentDate) &&
          (staffFilter === 'all' ? true : exception.staff_id === staffFilter),
      ),
    [calendarBoard?.exceptions, currentDate, staffFilter],
  );
  const calendarRange = useMemo(() => buildCalendarRange(appointmentsInView), [appointmentsInView]);
  const pixelsPerHour = calendarZoom === 'compact' ? 72 : calendarZoom === 'precise' ? 112 : 88;
  const desktopCalendarGrid = useMemo(
    () => buildCalendarGridMetrics(calendarRange, pixelsPerHour),
    [calendarRange, pixelsPerHour],
  );
  const hourSlots = desktopCalendarGrid.hourSlots;
  const calendarHeight = desktopCalendarGrid.height;
  const moveDropSlots = desktopCalendarGrid.dropSlots;
  const nowIndicatorOffset = useMemo(() => {
    if (!isToday(currentDate)) return null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = calendarRange.startHour * 60;
    const endMinutes = calendarRange.endHour * 60;
    if (minutes < startMinutes || minutes > endMinutes) return null;
    return ((minutes - startMinutes) / 60) * pixelsPerHour;
  }, [calendarRange.endHour, calendarRange.startHour, currentDate]);
  const visibleBlockList = useMemo(
    () =>
      [...visibleExceptions].sort(
        (left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime(),
      ),
    [visibleExceptions],
  );
  const mobileBoardStaff = useMemo(
    () =>
      visibleStaffColumns.map((staffMember) => ({
        ...staffMember,
        dayAppointments: compactDayAppointments.filter((appointment) => appointment.staff_id === staffMember.id),
        dayExceptions: compactDayExceptions.filter((exception) => exception.staff_id === staffMember.id),
      })),
    [compactDayAppointments, compactDayExceptions, visibleStaffColumns],
  );
  const desktopBoardStaff = useMemo(
    () =>
      visibleStaffColumns.map((staffMember) => ({
        ...staffMember,
        dayAppointments: filteredDayAppointments.filter((appointment) => appointment.staff_id === staffMember.id),
      })),
    [filteredDayAppointments, visibleStaffColumns],
  );
  const weekGridColumns = useMemo(
    () =>
      weekDays.flatMap((day) =>
        visibleStaffColumns.map((staffMember) => ({
          key: `${format(day, 'yyyy-MM-dd')}-${staffMember.id}`,
          day,
          staff: staffMember,
          appointments: sortByStartAt(
            appointments.filter(
              (appointment) =>
                appointment.staff_id === staffMember.id &&
                isSameDay(new Date(appointment.start_at), day) &&
                matchesCalendarStatusFilter(appointment, statusFilter),
            ),
          ),
          exceptions: (calendarBoard?.exceptions ?? []).filter(
            (exception) =>
              exception.staff_id === staffMember.id &&
              isSameDay(new Date(exception.start_at), day),
          ),
        })),
      ),
    [appointments, calendarBoard?.exceptions, statusFilter, visibleStaffColumns, weekDays],
  );
  const monthCells = useMemo(
    () =>
      monthDays.map((day) => {
        const dayAppointments = sortByStartAt(
          appointments.filter(
            (appointment) =>
              isSameDay(new Date(appointment.start_at), day) &&
              (staffFilter === 'all' ? true : appointment.staff_id === staffFilter) &&
              matchesCalendarStatusFilter(appointment, statusFilter),
          ),
        );

        const requests = dayAppointments.filter((appointment) =>
          REQUEST_OWNER_STATES.includes(
            getCalendarOwnerState(appointment) as (typeof REQUEST_OWNER_STATES)[number],
          ),
        ).length;
        const booked = dayAppointments.filter((appointment) =>
          ['confirmed', 'approved', 'booked_direct', 'proposal_accepted'].includes(
            getCalendarOwnerState(appointment),
          ),
        ).length;
        const cancelled = dayAppointments.filter((appointment) => isCancelledCalendarItem(appointment)).length;

        return { day, appointments: dayAppointments, requests, booked, cancelled };
      }),
    [appointments, monthDays, staffFilter, statusFilter],
  );
  const monthMaxLoad = useMemo(
    () => Math.max(...monthCells.map((cell) => cell.appointments.length), 1),
    [monthCells],
  );
  const calendarTitle = useMemo(() => {
    if (calendarView === 'month') {
      return format(currentDate, "LLLL yyyy 'г.'", { locale: bg });
    }

    if (calendarView !== 'week') {
      return format(currentDate, "d MMMM yyyy 'г.'", { locale: bg });
    }

    const weekEnd = addDays(rangeEndExclusive, -1);
    return `${format(rangeStart, 'd MMM', { locale: bg })} – ${format(weekEnd, "d MMMM yyyy 'г.'", { locale: bg })}`;
  }, [calendarView, currentDate, rangeEndExclusive, rangeStart]);
  const calendarSubtitle = useMemo(() => {
    if (calendarView === 'month') {
      return 'Месечен преглед на натовареността';
    }

    if (calendarView !== 'week') {
      return format(currentDate, 'EEEE', { locale: bg });
    }

    return 'Седмичен изглед по дни и специалисти';
  }, [calendarView, currentDate]);

  const calendarEmptyState = useMemo(() => {
    if (appointmentsInView.length || visibleExceptions.length) {
      return null;
    }

    const hasFilter = staffFilter !== 'all' || statusFilter !== 'active';
    if (hasFilter) {
      return {
        title: 'Няма резултати за текущите филтри',
        description: 'Сменете статуса или специалиста, за да видите други записи, без да напускате календара.',
      };
    }

    return {
      title:
        calendarView === 'week'
          ? 'Няма записани часове за тази седмица'
          : calendarView === 'month'
            ? 'Няма записани часове за този месец'
            : 'Няма записани часове за този ден',
      description: 'Изберете друга дата или добавете ръчна резервация.',
    };
  }, [appointmentsInView.length, calendarView, staffFilter, statusFilter, visibleExceptions.length]);

  useEffect(() => {
    if (!selectedRecordId) return;
    const existsInDay = dayAppointments.some((appointment) => appointment.id === selectedRecordId);
    const existsInInbox = inboxItems.some((item) => item.id === selectedRecordId);
    if (existsInDay || existsInInbox) return;
    setSelectedRecordId(null);
    setShowDesktopDetails(false);
    setShowMobileDetails(false);
  }, [dayAppointments, inboxItems, selectedRecordId]);

  useEffect(() => {
    if (!calendarStaff.length) return;

    if (!didAutoSelectStaffRef.current && staffFilter === 'all') {
      setStaffFilter(calendarStaff[0].id);
      didAutoSelectStaffRef.current = true;
      return;
    }

    if (staffFilter !== 'all' && !calendarStaff.some((staff) => staff.id === staffFilter)) {
      setStaffFilter(calendarStaff[0].id);
    }
  }, [calendarStaff, staffFilter]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncViewportMode = () => {
      setIsCompactViewport(window.innerWidth < 1280);
      if (window.innerWidth < 1024) {
        setShowDesktopDetails(false);
        return;
      }
    };

    syncViewportMode();
    window.addEventListener('resize', syncViewportMode);
    return () => window.removeEventListener('resize', syncViewportMode);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = pointerDragRef.current;
      if (!dragState) return;
      if (!dragState.moved) {
        const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
        if (distance < 6) return;
        dragState.moved = true;
        suppressTapUntilRef.current = Date.now() + 500;
        setDraggedAppointmentId(dragState.kind === 'appointment' ? dragState.target.id : null);
        setDraggedRequestId(dragState.kind === 'request' ? dragState.target.id : null);
        setDropPreview({
          staffId: dragState.target.staff_id,
          startAt: dragState.target.start_at,
        });
      }
      const nextTarget = resolvePointerDropTarget(dragState.target, event.clientX, event.clientY);
      if (!nextTarget) {
        setDropPreview(null);
        return;
      }
      setDropPreview(nextTarget);
    };

    const handlePointerUp = async () => {
      const dragState = pointerDragRef.current;
      if (!dragState) return;
      const preview = dropPreview;
      if (dragState.moved) {
        if (preview) {
          if (dragState.kind === 'request') {
            await handleRequestPlacement(dragState.target.id, preview.startAt, preview.staffId);
          } else {
            handleDropReschedule(dragState.target.id, preview.startAt, preview.staffId);
          }
        } else {
          toast.error(invalidDropHintRef.current);
        }
      }
      clearDesktopDragState();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [
    clearDesktopDragState,
    dropPreview,
    handleRequestPlacement,
    handleDropReschedule,
    resolvePlacementFromClientPoint,
  ]);

  const activePreviewTarget = useMemo(() => {
    if (touchMoveTarget) return touchMoveTarget;
    if (draggedAppointmentId) {
      return appointments.find((appointment) => appointment.id === draggedAppointmentId) ?? null;
    }
    if (draggedRequestId) {
      return inboxItems.find((item) => item.id === draggedRequestId) ?? null;
    }
    return null;
  }, [appointments, draggedAppointmentId, draggedRequestId, inboxItems, touchMoveTarget]);

  const previewDurationMinutes = useMemo(
    () => getEventDurationMinutes(activePreviewTarget?.start_at, activePreviewTarget?.end_at),
    [activePreviewTarget],
  );
  const previewPlacementLabel = useMemo(() => {
    if (!dropPreview) return null;

    const previewDate = new Date(dropPreview.startAt);
    const staffName =
      (calendarBoard?.staff ?? []).find((staffMember) => staffMember.id === dropPreview.staffId)?.name ||
      activePreviewTarget?.staff_name ||
      null;

    const parts = [
      calendarView === 'week' ? format(previewDate, 'EEE d MMM', { locale: bg }) : null,
      format(previewDate, 'HH:mm'),
      staffName,
    ].filter(Boolean);

    return parts.join(' · ');
  }, [activePreviewTarget?.staff_name, calendarBoard?.staff, calendarView, dropPreview]);

  const getPreviewMetrics = useCallback(
    (startAt: string, rangeStartHour: number, pxPerHour: number) => {
      const startOffset = getMinuteOffset(startAt, rangeStartHour);
      const top = Math.max((startOffset / 60) * pxPerHour, 0);
      const height = Math.max((previewDurationMinutes / 60) * pxPerHour, 6);
      return { top, height };
    },
    [previewDurationMinutes],
  );

  function resolvePointerDropTarget(target: MoveTarget, clientX: number, clientY: number) {
    return resolvePlacementFromClientPoint(target, clientX, clientY);
  }

  useEffect(() => {
    setBlockDraft((current) => ({
      ...current,
      date: dateKey,
      staffId:
        current.staffId !== 'all' && calendarStaff.some((staff) => staff.id === current.staffId)
          ? current.staffId
          : staffFilter === 'all'
            ? calendarStaff[0]?.id || 'all'
            : staffFilter,
    }));
  }, [calendarStaff, dateKey, staffFilter]);

  const goToday = () => setCurrentDate(new Date());

  const openBookingWithPrefill = useCallback(
    (day: Date, staffId: string, preferredSlot: string) => {
      setCurrentDate(new Date(day));
      setBookingPrefill({
        date: format(day, 'yyyy-MM-dd'),
        staffId,
        preferredSlot,
      });
      setShowBookingModal(true);
    },
    [],
  );

  const openBlockEditorForBlock = (block: StaffException) => {
    setEditingBlockId(block.id);
    setBlockDraft({
      staffId: block.staff_id,
      date: format(new Date(block.start_at), 'yyyy-MM-dd'),
      startTime: format(new Date(block.start_at), 'HH:mm'),
      endTime: format(new Date(block.end_at), 'HH:mm'),
      type: block.type,
      note: block.note || '',
    });
    setShowBlockEditor(true);
  };

  const resetBlockDraft = () => {
    setEditingBlockId(null);
    setBlockDraft({
      staffId: staffFilter === 'all' ? calendarStaff[0]?.id || 'all' : staffFilter,
      date: dateKey,
      startTime: '12:00',
      endTime: '13:00',
      type: 'blocked',
      note: '',
    });
  };

  const toMoveTarget = (
    record: Pick<
      Appointment,
      'id' | 'start_at' | 'end_at' | 'status' | 'staff_id' | 'service_id' | 'client_name' | 'client_phone' | 'service_name' | 'staff_name'
    >,
    source: MoveTarget['source'],
  ): MoveTarget => ({
    ...record,
    source,
  });

  const clearTouchPlacementLongPressTimer = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const resetTouchPlacementLongPress = useCallback(() => {
    clearTouchPlacementLongPressTimer();
    touchPressRef.current = null;
  }, [clearTouchPlacementLongPressTimer]);

  const startTouchMoveMode = (target: MoveTarget, mode: 'gesture' | 'confirm' = 'confirm') => {
    resetTouchPlacementLongPress();
    setTouchMoveTarget(target);
    setTouchMoveMode(mode);
    setPendingTouchPlacement(null);
    setDropPreview(null);
    setCurrentDate(new Date(target.start_at));
    setShowMobileDetails(false);
    setShowDesktopDetails(false);
    setShowRequestsPanel(false);
    toast.message(
      mode === 'gesture'
        ? 'Пуснете върху свободен 15-минутен слот.'
        : 'Изберете нов 15-минутен слот и потвърдете преместването.',
    );
  };

  const beginTouchPlacementLongPress = (target: MoveTarget, event: React.TouchEvent<HTMLElement>) => {
    if (typeof window === 'undefined') return;
    if (['completed', 'cancelled', 'no_show'].includes(target.status)) return;
    const touch = event.touches[0];
    if (!touch) return;
    resetTouchPlacementLongPress();
    touchPressRef.current = {
      target,
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      moved: false,
    };
    longPressTimeoutRef.current = window.setTimeout(() => {
      const gesture = touchPressRef.current;
      if (!gesture || gesture.target.id !== target.id || gesture.moved) {
        return;
      }
      startTouchMoveMode(target, 'confirm');
      longPressTimeoutRef.current = null;
    }, LONG_PRESS_DELAY_MS);
  };

  const handleTouchPlacementLongPressMove = (event: React.TouchEvent<HTMLElement>) => {
    const gesture = touchPressRef.current;
    if (!gesture) return;

    const touch = Array.from(event.touches).find((entry) => entry.identifier === gesture.touchId) || event.touches[0];
    if (!touch) return;

    const distance = Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY);
    if (distance < LONG_PRESS_MOVE_TOLERANCE_PX) {
      return;
    }

    gesture.moved = true;
    resetTouchPlacementLongPress();
  };

  const focusRecord = (id: string, startAt: string) => {
    if (Date.now() < suppressTapUntilRef.current) {
      return;
    }
    setSelectedRecordId(id);
    setCurrentDate(new Date(startAt));
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowMobileDetails(true);
      return;
    }
    setShowMobileDetails(false);
    setShowDesktopDetails(true);
    setShowRequestsPanel(false);
  };

  useEffect(() => {
    if (!resizingBlock) return;

    const handleMouseMove = (event: MouseEvent) => {
      setResizingBlock((current) => {
        if (!current) return current;

        const snappedQuarterSteps = Math.round(
          Math.min(Math.max(event.clientY - current.columnTop, 0), current.columnHeight) / (pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES)),
        );
        const totalMinutes = calendarRange.startHour * 60 + snappedQuarterSteps * CALENDAR_SLOT_MINUTES;
        const nextPoint = new Date(current.dayIso);
        nextPoint.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);

        if (current.edge === 'start') {
          const latestAllowed = new Date(new Date(current.previewEndAt).getTime() - CALENDAR_SLOT_MINUTES * 60 * 1000);
          if (nextPoint >= latestAllowed) return current;
          return { ...current, previewStartAt: nextPoint.toISOString() };
        }

        const earliestAllowed = new Date(new Date(current.previewStartAt).getTime() + CALENDAR_SLOT_MINUTES * 60 * 1000);
        if (nextPoint <= earliestAllowed) return current;
        return { ...current, previewEndAt: nextPoint.toISOString() };
      });
    };

    const handleMouseUp = () => {
      setResizingBlock((current) => {
        if (!current) return null;

        if (
          current.previewStartAt !== current.originalStartAt ||
          current.previewEndAt !== current.originalEndAt
        ) {
          resizeBlockMutation.mutate({
            id: current.id,
            staffId: current.staffId,
            startAt: current.previewStartAt,
            endAt: current.previewEndAt,
            type: current.type,
            note: current.note,
          });
        }

        return null;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [calendarRange.startHour, pixelsPerHour, resizeBlockMutation, resizingBlock]);

  const beginBlockResize = (
    event: React.MouseEvent<HTMLButtonElement>,
    block: StaffException,
    edge: 'start' | 'end',
    day: Date,
  ) => {
    event.stopPropagation();
    const column = (event.currentTarget.closest('[data-calendar-column]') as HTMLElement | null);
    if (!column) return;

    const rect = column.getBoundingClientRect();
    setResizingBlock({
      id: block.id,
      edge,
      staffId: block.staff_id,
      type: block.type,
      note: block.note || null,
      originalStartAt: block.start_at,
      originalEndAt: block.end_at,
      previewStartAt: block.start_at,
      previewEndAt: block.end_at,
      columnTop: rect.top,
      columnHeight: rect.height,
      dayIso: new Date(day).toISOString(),
    });
  };

  const getExceptionWindow = (block: StaffException) => {
    if (resizingBlock?.id === block.id) {
      return {
        startAt: resizingBlock.previewStartAt,
        endAt: resizingBlock.previewEndAt,
      };
    }

    return {
      startAt: block.start_at,
      endAt: block.end_at,
    };
  };

  const prefillWaitlistFromAppointment = (appointment: Appointment) => {
    setWaitlistDraft({
      clientName: appointment.client_name,
      clientPhone: formatBulgarianPhoneForDisplay(appointment.client_phone),
      clientEmail: '',
      serviceId: appointment.service_id,
      staffId: appointment.staff_id,
      desiredDate: format(new Date(appointment.start_at), 'yyyy-MM-dd'),
      desiredFrom: format(new Date(appointment.start_at), 'HH:mm'),
      desiredTo: format(new Date(appointment.end_at), 'HH:mm'),
      notes: `Резервен клиент при освобождаване на слот за ${appointment.service_name}.`,
    });
    setShowWaitlistModal(true);
  };

  const renderPrimaryActions = (appointment: Appointment) => {
    if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) return null;

    const canConfirm = appointment.status === 'pending' || appointment.status === 'proposal_pending';
    const phoneHref = appointment.client_phone ? `tel:${appointment.client_phone}` : null;

    return (
      <div className="flex flex-wrap gap-2">
        {canConfirm && (
          <button
            onClick={() => handleStatusChange(appointment.id, 'confirmed')}
            className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Потвърди
          </button>
        )}
        <button
          type="button"
          onClick={() => openAppointmentMove(appointment)}
          className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-100"
        >
          Премести
        </button>
        <button
          onClick={() => handleStatusChange(appointment.id, 'cancelled')}
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
        >
          {canConfirm ? 'Откажи' : 'Отмени'}
        </button>
        {phoneHref && (
          <a
            href={phoneHref}
            className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Обади се
          </a>
        )}
      </div>
    );
  };

  const renderCalendarEmptyState = () => (
    <div className="rounded-[28px] border border-dashed border-gray-200 bg-white/80 px-6 py-14 text-center">
      <p className="text-lg font-semibold text-gray-500">{calendarEmptyState?.title}</p>
      <p className="mt-2 text-sm text-gray-400">{calendarEmptyState?.description}</p>
    </div>
  );

  const renderAppointmentCardBody = (appointment: Appointment, height: number) => {
    const startTime = format(new Date(appointment.start_at), 'HH:mm');
    const endTime = format(new Date(appointment.end_at), 'HH:mm');
    const mode = height < 30 ? 'micro' : height < 72 ? 'tiny' : height < 104 ? 'compact' : 'full';

    if (mode === 'micro') {
      return (
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${getAppointmentStatusCueClass(appointment)}`} />
          <p className="truncate text-[10px] font-bold leading-none text-gray-800">
            {startTime} · {appointment.client_name}
          </p>
        </div>
      );
    }

    return (
      <>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${getAppointmentStatusCueClass(appointment)}`} />
          <p className="text-[11px] font-bold text-gray-700">
            {startTime} - {endTime}
          </p>
        </div>
        <p className={`mt-1 font-black text-gray-900 ${mode === 'tiny' ? 'line-clamp-1 text-[13px]' : 'line-clamp-2 text-sm'}`}>
          {appointment.client_name}
        </p>
        {mode !== 'tiny' && (
          <p className={`mt-1 font-semibold text-gray-600 ${mode === 'compact' ? 'line-clamp-1 text-[11px]' : 'line-clamp-2 text-xs'}`}>
            {appointment.service_name}
          </p>
        )}
      </>
    );
  };

  const renderDesktopDetailsPanel = () => {
    if (!(selectedAppointment || selectedInboxItem)) {
      return (
        <div className="mt-4 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-400">
          Изберете заявка, клиентско действие или запис от календара.
        </div>
      );
    }

    return (
        <div className="mt-4 space-y-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedInboxItem && (
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${selectedInboxItem.toneClass}`}>
                {selectedInboxItem.detailLabel}
              </span>
            )}
            {detailedAppointment && (
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  getOwnerStatusPresentation(detailedAppointment).cls
                }`}
              >
                {getOwnerStatusPresentation(detailedAppointment).label}
              </span>
            )}
          </div>
          <h3 className="mt-3 text-xl font-black text-gray-900">
            {detailedAppointment?.client_name || selectedInboxItem?.client_name}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {detailedAppointment
              ? `${detailedAppointment.service_name} при ${detailedAppointment.staff_name}`
              : selectedInboxItem?.summary}
          </p>
        </div>

        {detailedAppointment && (
          <div className="grid gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Следващи действия</p>
            <div className="flex flex-wrap gap-2">{renderPrimaryActions(detailedAppointment)}</div>
            {detailedAppointment.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => handleStatusChange(detailedAppointment.id, 'no_show')}
                className="w-fit rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Отбележи неявяване
              </button>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Дата и слот</p>
              <p className="mt-1.5 text-sm font-semibold text-gray-900">
                {formatAppointmentDay(detailedAppointment?.start_at || selectedInboxItem!.start_at)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Телефон</p>
              <p className="mt-1.5 text-sm font-semibold text-gray-900">
                {formatBulgarianPhoneForDisplay(
                  detailedAppointment?.client_phone || selectedInboxItem!.client_phone,
                )}
              </p>
            </div>
            {detailedAppointment && (
              <>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Услуга</p>
                  <p className="mt-1.5 text-sm font-semibold text-gray-900">{detailedAppointment.service_name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Специалист</p>
                  <p className="mt-1.5 text-sm font-semibold text-gray-900">{detailedAppointment.staff_name}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Стойност</p>
                  <p className="mt-1.5 text-sm font-semibold text-gray-900">
                    {detailedAppointment.price != null ? formatEuroAmount(detailedAppointment.price) : 'Няма цена'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Статус</p>
                  <p className="mt-1.5 text-sm font-semibold text-gray-900">
                    {getOwnerStatusPresentation(detailedAppointment).label}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {selectedContext?.appointment &&
          (selectedContext.appointment.client_name_source === 'owner' ||
            (selectedContext.appointment.original_client_name &&
              selectedContext.appointment.original_client_name !== selectedContext.appointment.client_name)) && (
          <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Име в клиентската база</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{selectedContext.appointment.client_name}</p>
            <p className="mt-1 text-xs text-gray-500">
              {selectedContext.appointment.client_name_source === 'owner'
                ? 'Ръчно име от собственика'
                : 'Име от първата клиентска заявка'}
            </p>
            {selectedContext.appointment.original_client_name &&
              selectedContext.appointment.original_client_name !== selectedContext.appointment.client_name && (
                <p className="mt-2 text-xs text-gray-500">
                  Първо въведено име: {selectedContext.appointment.original_client_name}
                </p>
              )}
          </div>
        )}

        {detailedAppointment?.internal_notes && (
          <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Бележка</p>
            <p className="mt-2 text-sm text-gray-700">{detailedAppointment.internal_notes}</p>
          </div>
        )}

        {selectedContext?.appointment?.cancellation_reason && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-500">Причина за отмяна</p>
            <p className="mt-2 text-sm text-rose-700">{selectedContext.appointment.cancellation_reason}</p>
          </div>
        )}

        {selectedInboxItem?.bucket === 'updates' && (
          <button
            type="button"
            onClick={() => handleOwnerAlertRead(selectedInboxItem.id)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Маркирай като видяно
          </button>
        )}
      </div>
    );
  };

  const renderRequestCard = (request: UpcomingAppointment) => (
    <div
      key={request.id}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        beginDesktopPointerDrag(
          toMoveTarget(request as unknown as Appointment, 'request'),
          'request',
          event.clientX,
          event.clientY,
        );
      }}
      onTouchStart={(event) => beginTouchPlacementLongPress(toMoveTarget(request as unknown as Appointment, 'request'), event)}
      onTouchMove={handleTouchPlacementLongPressMove}
      onTouchEnd={resetTouchPlacementLongPress}
      onTouchCancel={resetTouchPlacementLongPress}
      className="rounded-3xl border border-amber-100 bg-white p-4 shadow-sm select-none"
      style={{ WebkitTouchCallout: 'none', touchAction: 'manipulation' }}
    >
      <button type="button" onClick={() => focusRecord(request.id, request.start_at)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
              Нова заявка
            </span>
            <p className="mt-3 text-base font-black text-gray-900">{request.client_name}</p>
            <p className="mt-1 text-sm text-gray-600">{request.service_name}</p>
            <p className="mt-1 text-xs text-gray-500">
              {request.staff_name} · {formatAppointmentDay(request.start_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">{isCompactViewport ? 'Задръж' : 'Дръпни'}</p>
            <p className="mt-2 text-xs text-gray-500">{isCompactViewport ? 'задръж и постави' : 'към календара'}</p>
          </div>
        </div>
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => handleStatusChange(request.id, 'confirmed')}
          className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
        >
          Потвърди
        </button>
        <button
          type="button"
          onClick={() => startTouchMoveMode(toMoveTarget(request as unknown as Appointment, 'request'))}
          className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100"
        >
          Постави в календара
        </button>
        <button
          type="button"
          onClick={() => handleStatusChange(request.id, 'cancelled')}
          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          Откажи
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5">
        <section className="min-w-0">
          <div className="glass-panel rounded-[32px] border border-white/60 p-3 shadow-xl shadow-black/5 sm:p-5">
            <div className="flex flex-col gap-2 border-b border-gray-100 pb-3 sm:gap-3 sm:pb-4">
	              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	                <div>
	                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Календар</p>
	                  <h3 className="mt-1 text-lg font-black text-gray-900 sm:text-xl">
	                    {calendarTitle}
                  </h3>
                  <p className="mt-1 text-xs capitalize text-gray-500 sm:text-sm">
                    {calendarSubtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex w-full items-center rounded-2xl border border-gray-200 bg-white p-1 sm:w-auto">
                    <button
                      type="button"
                      onClick={() => setCalendarView('grid')}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        calendarView === 'grid'
                          ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20'
                          : 'text-gray-600'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" />
                      Ден
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarView('week')}
                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                        calendarView === 'week'
                          ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20'
                          : 'text-gray-600'
                      }`}
                    >
                      <CalendarDays className="h-4 w-4" />
                      Седмица
                    </button>
                  </div>
                  <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4">
                    <User className="h-4 w-4 text-gray-400" />
                    <select
                      value={staffFilter}
                      onChange={(event) => setStaffFilter(event.target.value)}
                      className="h-11 w-full bg-transparent text-sm font-semibold text-gray-700 outline-none"
                    >
                      <option value="all">Всички специалисти</option>
                      {calendarStaff.map((staffMember) => (
                        <option key={staffMember.id} value={staffMember.id}>
                          {staffMember.name}
                        </option>
                      ))}
                    </select>
                  </div>
	                  <button
		                    onClick={() =>
                          setCurrentDate(
                            subDays(currentDate, calendarView === 'week' ? 7 : calendarView === 'month' ? 30 : 1),
                          )
                        }
	                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
	                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      setCurrentDate(
                        addDays(currentDate, calendarView === 'week' ? 7 : calendarView === 'month' ? 30 : 1),
                      )
                    }
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={dateKey}
                    onChange={(e) => setCurrentDate(new Date(`${e.target.value}T12:00:00`))}
                    className="sr-only"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (dateInputRef.current?.showPicker) {
                        dateInputRef.current.showPicker();
                        return;
                      }
                      dateInputRef.current?.click();
                    }}
                    className="flex h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <CalendarDays className="w-4 h-4" />
                    Избери дата
                  </button>
                  {!isToday(currentDate) && (
                    <button
                      onClick={goToday}
                      className="rounded-2xl border border-[var(--color-primary)]/15 bg-[var(--color-primary)]/8 px-4 py-3 text-sm font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/12"
                    >
                      Днес
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setBookingPrefill(
                        staffFilter !== 'all'
                          ? {
                              date: dateKey,
                              staffId: staffFilter,
                              preferredSlot: '',
                            }
                          : null,
                      );
                      setShowBookingModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 transition-opacity hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" />
                    Нова резервация
                  </button>
                </div>
              </div>

		              <div className="hidden flex-wrap gap-2 sm:flex">
		                <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm">
		                  <p className="text-base font-black text-gray-900">{appointmentsInView.length}</p>
		                  <p className="text-[11px] text-gray-500">{calendarView === 'week' ? 'записа' : calendarView === 'month' ? 'за месеца' : 'за деня'}</p>
		                </div>
		                <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm">
		                  <p className="text-base font-black text-emerald-700">{confirmedInView}</p>
		                  <p className="text-[11px] text-gray-500">запазени</p>
		                </div>
		                <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm">
		                  <p className="text-base font-black text-amber-700">{pendingInView}</p>
		                  <p className="text-[11px] text-gray-500">нови заявки</p>
		                </div>
		                <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm">
		                  <p className="text-base font-black text-[var(--color-primary)]">{formatEuroAmount(totalRevenue)}</p>
		                  <p className="text-[11px] text-gray-500">оборот</p>
		                </div>
		              </div>
            </div>

	            <div className="mt-3 sm:mt-5">
	              {isLoading ? (
	                <div className="flex justify-center py-20">
	                  <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
	                </div>
	              ) : (
	                <div className="space-y-4">
	                  <div className="flex flex-col gap-2 rounded-[28px] border border-white/70 bg-white/80 p-2.5 shadow-sm sm:gap-3 sm:p-3">
	                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	                      <div className="min-w-0">
	                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
		                          {calendarView === 'week' ? 'Седмичен борд' : 'Дневен борд'}
		                        </p>
		                        <h4 className="mt-1 text-sm font-black text-gray-900">
		                          {calendarView === 'week' ? 'Седмичен преглед' : 'Дневен график'}
		                        </h4>
		                        <p className="mt-1 hidden text-xs text-gray-500 sm:block">
		                          {calendarView === 'week' ? 'Дни × специалисти' : 'Специалисти × часове'}
		                        </p>
	                      </div>
	                      <div className="hidden items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold text-gray-600 sm:inline-flex">
	                        <SlidersHorizontal className="h-4 w-4" />
	                        {staffFilter === 'all'
                            ? 'Показани са всички специалисти'
                            : `Активен специалист: ${visibleStaffColumns[0]?.name ?? 'специалист'}`}
	                      </div>
	                    </div>

                      <div className="flex flex-col gap-2 rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-2.5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex flex-wrap gap-2">
                          {STATUS_FILTER_OPTIONS.map((option) => (
                            <button
                              key={option.key}
                              type="button"
                              onClick={() => setStatusFilter(option.key as typeof statusFilter)}
                              className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                                statusFilter === option.key
                                  ? 'bg-gray-900 text-white'
                                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowRequestsPanel((current) => !current)}
                            className="hidden items-center gap-2 rounded-2xl border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 lg:inline-flex"
                          >
                            <ClipboardList className="h-4 w-4" />
                            Заявки ({actionItems.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowUnavailable((current) => !current)}
                            className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                              showUnavailable
                                ? 'border border-slate-300 bg-slate-100 text-slate-700'
                                : 'border border-gray-200 bg-white text-gray-500'
                            }`}
                          >
                            {showUnavailable ? 'Скрий блоковете' : 'Покажи блоковете'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              resetBlockDraft();
                              setShowBlockEditor(true);
                            }}
                            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <Ban className="h-4 w-4" />
                            Блокирай време
                          </button>
                        </div>
                      </div>
	                  </div>
	                      {calendarEmptyState ? (
	                        renderCalendarEmptyState()
	                      ) : (
	                        <>
	                          {calendarView !== 'list' && (
	                            <div className="space-y-4 lg:hidden">
	                              {calendarView === 'week' && (
	                                <div className="overflow-x-auto pb-1">
	                                  <div className="flex min-w-max gap-2">
	                                    {weekDays.map((day) => (
	                                      <button
	                                        key={day.toISOString()}
	                                        type="button"
	                                        onClick={() => setCurrentDate(day)}
	                                        className={`rounded-2xl border px-3 py-2 text-sm font-semibold ${
	                                          isSameDay(day, currentDate)
	                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
	                                            : 'border-gray-200 bg-white text-gray-600'
	                                        }`}
	                                      >
	                                        {format(day, 'EEE d MMM', { locale: bg })}
	                                      </button>
	                                    ))}
	                                  </div>
	                                </div>
	                              )}
	                              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
	                                {touchMoveTarget ? (
	                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	                                    <div>
	                                      <p className="font-semibold">Изберете нов слот за {touchMoveTarget.client_name}</p>
	                                      <p className="text-xs text-sky-700/80">
                                          {touchMoveMode === 'gesture'
                                            ? 'Пуснете върху свободен 15-минутен слот.'
                                            : 'Докоснете точния 15-минутен слот в графика.'}
                                        </p>
                                        {previewPlacementLabel && (
                                          <p className="mt-2 text-xs font-bold text-sky-900">
                                            Целеви час: {previewPlacementLabel}
                                          </p>
                                        )}
	                                    </div>
	                                    <button
	                                      type="button"
	                                      onClick={clearTouchMoveState}
	                                      className="rounded-2xl border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-700"
	                                    >
	                                      Откажи преместването
	                                    </button>
	                                  </div>
	                                ) : (
	                                  <div className="flex flex-col gap-1">
                                      <p className="font-semibold">Докоснете празен слот, за да създадете нов час.</p>
                                      <p className="text-xs text-sky-700/80">
                                        Задръжте запис и го плъзнете по целия дневен таймлайн. За преместване в друг ден използвайте бутона <span className="font-semibold">„Премести“</span>.
                                      </p>
                                    </div>
	                                )}
	                              </div>
                                <MobileDayBoard
                                  currentDate={currentDate}
                                  staffMembers={mobileBoardStaff}
                                  calendarZoom={calendarZoom}
                                  showUnavailable={showUnavailable}
                                  selectedRecordId={selectedRecordId}
                                  touchMoveTarget={touchMoveTarget}
                                  touchMoveMode={touchMoveMode}
                                  dropPreview={dropPreview}
                                  onPreviewChange={(preview) => {
                                    setPendingTouchPlacement(preview);
                                    setDropPreview(preview);
                                  }}
                                  onStartGestureMove={(target) => startTouchMoveMode(target, 'gesture')}
                                  onCancelMove={clearTouchMoveState}
                                  onCommitMove={async (target, preview) => {
                                    clearTouchMoveState();
                                    if (target.source === 'request') {
                                      await handleRequestPlacement(target.id, preview.startAt, preview.staffId);
                                      return;
                                    }
                                    handleDropReschedule(target.id, preview.startAt, preview.staffId);
                                  }}
                                  onOpenBooking={(staffId, slotDate) =>
                                    openBookingWithPrefill(currentDate, staffId, format(slotDate, 'HH:mm'))
                                  }
                                  onOpenDetails={focusRecord}
                                  onEditBlock={openBlockEditorForBlock}
                                  resolveMovePlacement={resolveMovePlacement}
                                  renderAppointmentCardBody={renderAppointmentCardBody}
                                  isSecondaryAppointment={(appointment) =>
                                    isSecondaryOwnerState(appointment.owner_view_state || appointment.status)
                                  }
                                  getAppointmentAccent={(appointment) =>
                                    appointment.service_color || appointment.staff_color || 'var(--color-primary)'
                                  }
                                />
	                            </div>
	                          )}
                            {calendarView === 'month' ? (
                              <div className="rounded-[28px] border border-white/70 bg-white/90 p-3 shadow-sm">
                                <div className="mb-3 grid grid-cols-7 gap-2 px-1">
                                  {['Пон', 'Вт', 'Сря', 'Чет', 'Пет', 'Съб', 'Нед'].map((label) => (
                                    <div key={label} className="px-2 py-1 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                                      {label}
                                    </div>
                                  ))}
                                </div>
                                <div className="grid grid-cols-7 gap-2">
                                  {monthCells.map((cell) => {
                                    const isCurrentMonth = cell.day.getMonth() === currentDate.getMonth();
                                    const isSelectedDay = isSameDay(cell.day, currentDate);
                                    const loadRatio = cell.appointments.length / monthMaxLoad;
                                    const heatClass =
                                      loadRatio >= 0.8
                                        ? 'bg-rose-500'
                                        : loadRatio >= 0.55
                                          ? 'bg-amber-400'
                                          : loadRatio >= 0.25
                                            ? 'bg-emerald-400'
                                            : 'bg-gray-200';
                                    return (
                                      <button
                                        key={cell.day.toISOString()}
                                        type="button"
                                        onClick={() => {
                                          setCurrentDate(cell.day);
                                          setCalendarView('grid');
                                        }}
                                        className={`min-h-[128px] rounded-[22px] border p-3 text-left transition ${
                                          isSelectedDay
                                            ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/8 shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-[var(--color-primary)]/25 hover:bg-gray-50/80'
                                        } ${!isCurrentMonth ? 'opacity-45' : ''}`}
                                      >
                                        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                          <div
                                            className={`h-full rounded-full ${heatClass}`}
                                            style={{ width: `${Math.max(loadRatio * 100, cell.appointments.length ? 12 : 0)}%` }}
                                          />
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className={`text-sm font-black ${isToday(cell.day) ? 'text-[var(--color-primary)]' : 'text-gray-900'}`}>
                                            {format(cell.day, 'd')}
                                          </span>
                                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-500">
                                            {cell.appointments.length}
                                          </span>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-1.5">
                                          {cell.requests > 0 && (
                                            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                                              {cell.requests} заяв.
                                            </span>
                                          )}
                                          {cell.booked > 0 && (
                                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                              {cell.booked} запаз.
                                            </span>
                                          )}
                                          {cell.cancelled > 0 && (
                                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                                              {cell.cancelled} втор.
                                            </span>
                                          )}
                                        </div>
                                        <div className="mt-3 space-y-1.5">
                                          {cell.appointments.slice(0, 2).map((appointment) => (
                                            <div
                                              key={appointment.id}
                                              className="truncate rounded-xl border border-gray-100 bg-gray-50/80 px-2 py-1.5 text-[11px] font-semibold text-gray-700"
                                            >
                                              {format(new Date(appointment.start_at), 'HH:mm')} · {appointment.client_name}
                                            </div>
                                          ))}
                                          {cell.appointments.length > 2 && (
                                            <div className="text-[11px] font-semibold text-gray-400">
                                              +{cell.appointments.length - 2} още
                                            </div>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : calendarView === 'week' ? (
	                        <div className="hidden lg:block overflow-x-auto rounded-[28px] border border-white/70 bg-white/90 shadow-sm">
                          <div
                            className="grid min-w-[1480px]"
                            style={{ gridTemplateColumns: `64px repeat(${Math.max(weekGridColumns.length, 1)}, minmax(156px, 1fr))` }}
                          >
                            <div className="sticky top-0 z-10 border-b border-r border-gray-100 bg-white/95 px-3 py-4 backdrop-blur">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Час</p>
                            </div>
                            {weekGridColumns.map((column, index) => (
                              <div
                                key={column.key}
                                className={`sticky top-0 z-10 border-b border-r border-gray-100 bg-white/95 px-2.5 py-3 backdrop-blur last:border-r-0 ${
                                  index % Math.max(visibleStaffColumns.length, 1) === 0 ? 'border-l-2 border-l-gray-200' : ''
                                } ${isToday(column.day) ? 'bg-[var(--color-primary)]/5' : ''}`}
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                                  {format(column.day, 'EEE d MMM', { locale: bg })}
                                </p>
                                <div className="mt-2 flex items-center gap-2">
                                  <span
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-black text-white"
                                    style={{ backgroundColor: column.staff.color || 'var(--color-primary)' }}
                                  >
                                    {getInitials(column.staff.name)}
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-black text-gray-900">{column.staff.name}</p>
                                    <p className="text-[10px] text-gray-500">{column.appointments.length} записа</p>
                                  </div>
                                </div>
                              </div>
                            ))}

                            <div className="relative border-r border-gray-100 bg-gray-50/60" style={{ height: `${calendarHeight}px` }}>
                              {hourSlots.slice(0, -1).map((hour) => {
                                const top = (hour - calendarRange.startHour) * pixelsPerHour;
                                return (
                                  <div key={hour}>
                                    <div className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ top: `${top}px` }} />
                                    <div className="absolute left-0 top-0 -translate-y-1/2 px-3 text-xs font-semibold text-gray-400" style={{ top: `${top}px` }}>
                                      {String(hour).padStart(2, '0')}:00
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {weekGridColumns.map((column, index) => (
                              <div
                                key={column.key}
                                data-calendar-column={column.key}
                                ref={registerCalendarColumn(
                                  column.key,
                                  column.staff.id,
                                  column.day,
                                  calendarRange.startHour,
                                  pixelsPerHour,
                                )}
                                className={`relative border-r border-gray-100 bg-white/70 last:border-r-0 ${
                                  index % Math.max(visibleStaffColumns.length, 1) === 0 ? 'border-l-2 border-l-gray-200' : ''
                                }`}
                                style={{ height: `${calendarHeight}px` }}
                              >
                                {showUnavailable && (() => {
                                  const dayKey = getWorkingDayKey(column.day);
                                  const schedule = column.staff.working_hours?.[dayKey];
                                  const overlays: Array<{
                                    id?: string;
                                    top: number;
                                    height: number;
                                    label: string;
                                    kind: 'closed' | 'exception';
                                    block?: StaffException;
                                  }> = [];

                                  if (!schedule?.isOpen) {
                                    overlays.push({
                                      top: 0,
                                      height: calendarHeight,
                                      label: 'Почивен ден',
                                      kind: 'closed',
                                    });
                                  } else {
                                    const [openHour, openMinute] = schedule.open.split(':').map(Number);
                                    const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
                                    const openOffset = (openHour * 60 + openMinute - calendarRange.startHour * 60) / 60 * pixelsPerHour;
                                    const closeOffset = (closeHour * 60 + closeMinute - calendarRange.startHour * 60) / 60 * pixelsPerHour;

                                    if (openOffset > 0) {
                                      overlays.push({
                                        top: 0,
                                        height: openOffset,
                                        label: 'Извън работно време',
                                        kind: 'closed',
                                      });
                                    }
                                    if (closeOffset < calendarHeight) {
                                      overlays.push({
                                        top: Math.max(closeOffset, 0),
                                        height: Math.max(calendarHeight - closeOffset, 0),
                                        label: 'Извън работно време',
                                        kind: 'closed',
                                      });
                                    }
                                  }

                                  for (const exception of column.exceptions) {
                                    const window = getExceptionWindow(exception);
                                    const top = Math.max((getMinuteOffset(window.startAt, calendarRange.startHour) / 60) * pixelsPerHour, 0);
                                    const bottom = Math.min((getMinuteOffset(window.endAt, calendarRange.startHour) / 60) * pixelsPerHour, calendarHeight);
                                    const height = Math.max(bottom - top, 40);
                                    overlays.push({
                                      id: exception.id,
                                      top,
                                      height,
                                      label: exception.note || 'Блокиран интервал',
                                      kind: 'exception',
                                      block: exception,
                                    });
                                  }

                                  return overlays.map((overlay, overlayIndex) => (
                                    <div
                                      key={overlay.id || `${column.key}-overlay-${overlayIndex}`}
                                      className={`absolute left-0 right-0 z-0 border-y ${
                                        overlay.kind === 'exception' ? 'border-slate-300/70' : 'border-gray-200/80'
                                      }`}
                                      style={{
                                        top: `${overlay.top}px`,
                                        height: `${overlay.height}px`,
                                        background:
                                          overlay.kind === 'exception'
                                            ? 'repeating-linear-gradient(-45deg, rgba(148,163,184,0.16), rgba(148,163,184,0.16) 6px, rgba(148,163,184,0.05) 6px, rgba(148,163,184,0.05) 12px)'
                                            : 'rgba(148,163,184,0.08)',
                                      }}
                                    >
                                      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
                                        {overlay.label}
                                      </span>
                                      {overlay.block && (
                                        <>
                                          <button
                                            type="button"
                                            onMouseDown={(event) => beginBlockResize(event, overlay.block!, 'start', column.day)}
                                            className="absolute left-1/2 top-0 z-[3] h-3 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow"
                                          />
                                          <button
                                            type="button"
                                            onMouseDown={(event) => beginBlockResize(event, overlay.block!, 'end', column.day)}
                                            className="absolute bottom-0 left-1/2 z-[3] h-3 w-10 -translate-x-1/2 translate-y-1/2 rounded-full border border-slate-200 bg-white shadow"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => openBlockEditorForBlock(overlay.block!)}
                                            className="absolute right-2 top-2 rounded-full border border-white/80 bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm"
                                          >
                                            Редактирай
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  ));
                                })()}

                                {moveDropSlots.map((slot) => {
                                  const [hour, minute] = slot.label.split(':').map(Number);
                                  const nextStart = new Date(column.day);
                                  nextStart.setHours(hour, minute, 0, 0);
                                  return (
                                    <div
                                      key={`${column.key}-${slot.key}`}
                                      className="absolute left-0 right-0 z-[1] transition-colors"
                                      style={{ top: `${slot.top}px`, height: `${pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES)}px` }}
                                      onDragOver={(event) => {
                                        if (!draggedAppointmentId && !draggedRequestId) return;
                                        event.preventDefault();
                                        const dragTarget = draggedAppointmentId
                                          ? appointments.find((appointment) => appointment.id === draggedAppointmentId)
                                          : inboxItems.find((item) => item.id === draggedRequestId);
                                        if (!dragTarget) return;
                                        const normalizedDragTarget = draggedAppointmentId
                                          ? toMoveTarget(dragTarget as Appointment, 'appointment')
                                          : toMoveTarget(dragTarget as Appointment, 'request');
                                        const candidate = resolveMovePlacement(
                                          normalizedDragTarget,
                                          nextStart.toISOString(),
                                          column.staff.id,
                                        );
                                        invalidDropHintRef.current =
                                          candidate.reason || 'Пуснете върху свободен 15-минутен слот.';
                                        setDropPreview(candidate.preview);
                                      }}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        if (draggedAppointmentId) {
                                          handleDropReschedule(draggedAppointmentId, nextStart.toISOString(), column.staff.id);
                                          return;
                                        }
                                        if (draggedRequestId) {
                                          void handleRequestPlacement(draggedRequestId, nextStart.toISOString(), column.staff.id);
                                        }
                                      }}
                                      onClick={() => {
                                        if (Date.now() < suppressTapUntilRef.current) return;
                                        if (draggedAppointmentId || draggedRequestId || touchMoveTarget) return;
                                        openBookingWithPrefill(column.day, column.staff.id, slot.label);
                                      }}
                                    >
                                    </div>
                                  );
                                })}

                                {dropPreview?.staffId === column.staff.id &&
                                isSameDay(new Date(dropPreview.startAt), column.day) ? (
                                  (() => {
                                    const metrics = getPreviewMetrics(dropPreview.startAt, calendarRange.startHour, pixelsPerHour);
                                    return (
                                      <div
                                        className="pointer-events-none absolute left-2 right-2 z-[2] rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/14 shadow-[0_12px_32px_rgba(79,70,229,0.18)]"
                                        style={{ top: `${metrics.top}px`, height: `${metrics.height}px` }}
                                      />
                                    );
                                  })()
                                ) : null}

                                {moveDropSlots.map((slot) => {
                                  const [, minute] = slot.label.split(':').map(Number);
                                  return (
                                    <div
                                      key={`line-${column.key}-${slot.key}`}
                                      className={`absolute left-0 right-0 ${
                                        minute === 0 ? 'border-t border-gray-100' : 'border-t border-dashed border-gray-100/80'
                                      }`}
                                      style={{ top: `${slot.top}px` }}
                                    />
                                  );
                                })}

                                {isToday(column.day) && nowIndicatorOffset !== null && (
                                  <div
                                    className="absolute left-0 right-0 z-[1] border-t-2 border-rose-400"
                                    style={{ top: `${nowIndicatorOffset}px` }}
                                  >
                                    <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-white bg-rose-500 shadow" />
                                  </div>
                                )}

                                {column.appointments.map((appointment) => {
                                  const metrics = getEventLayoutMetrics(
                                    appointment.start_at,
                                    appointment.end_at,
                                    calendarRange.startHour,
                                    pixelsPerHour,
                                    6,
                                  );
                                  const ownerState = appointment.owner_view_state || appointment.status;
                                  const isSelected = selectedRecordId === appointment.id;
                                  const isSecondary = isSecondaryOwnerState(ownerState);
                                  const accent = appointment.service_color || appointment.staff_color || 'var(--color-primary)';
                                  const soft = isSecondary
                                    ? 'rgba(248,250,252,0.95)'
                                    : colorWithAlpha(accent, '18', 'rgba(14, 165, 233, 0.1)');

                                  return (
                                    <button
                                      key={appointment.id}
                                      type="button"
                                      onPointerDown={(event) => {
                                        if (event.pointerType !== 'mouse' || event.button !== 0) return;
                                        if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) return;
                                        beginDesktopPointerDrag(
                                          toMoveTarget(appointment, 'appointment'),
                                          'appointment',
                                          event.clientX,
                                          event.clientY,
                                        );
                                      }}
                                      onClick={() => focusRecord(appointment.id, appointment.start_at)}
                                      className={`absolute left-2 right-2 z-[2] rounded-2xl border px-3 py-2 text-left shadow-sm transition-transform hover:scale-[1.01] ${
                                        isSelected ? 'ring-2 ring-[var(--color-primary)]/25' : ''
                                      } ${isSecondary ? 'opacity-45 saturate-50' : ''} ${
                                        draggedAppointmentId === appointment.id ? 'opacity-20 scale-[0.99]' : ''
                                      } overflow-hidden`}
                                      style={{
                                        top: `${metrics.top}px`,
                                        height: `${metrics.height}px`,
                                        borderColor: colorWithAlpha(accent, isSecondary ? '28' : '55', 'rgba(14, 165, 233, 0.3)'),
                                        backgroundColor: soft,
                                        borderStyle: isSecondary ? 'dashed' : 'solid',
                                      }}
                                    >
                                      {renderAppointmentCardBody(appointment, metrics.height)}
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
	                      ) : calendarView === 'grid' ? (
			                    <div className="hidden lg:block">
		                      <div className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/90 shadow-sm">
	                        <div
	                          className="grid min-w-[760px]"
	                          style={{ gridTemplateColumns: `64px repeat(${Math.max(visibleStaffColumns.length, 1)}, minmax(190px, 1fr))` }}
	                        >
	                          <div className="sticky top-0 z-10 border-b border-r border-gray-100 bg-white/95 px-3 py-4 backdrop-blur">
	                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Час</p>
	                          </div>
	                          {desktopBoardStaff.map((staffMember) => (
	                            <div
	                              key={staffMember.id}
	                              className="sticky top-0 z-10 border-b border-r border-gray-100 bg-white/95 px-3 py-3 backdrop-blur last:border-r-0"
	                            >
	                              <div className="flex items-center gap-3">
	                                <span
	                                  className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-black text-white shadow-sm"
	                                  style={{ backgroundColor: staffMember.color || 'var(--color-primary)' }}
	                                >
	                                  {getInitials(staffMember.name)}
	                                </span>
	                                <div className="min-w-0">
	                                  <p className="truncate text-xs font-black text-gray-900">{staffMember.name}</p>
	                                  <p className="text-[10px] text-gray-500">{staffMember.dayAppointments.length} записа</p>
	                                </div>
	                              </div>
	                            </div>
	                          ))}

	                          <div className="relative border-r border-gray-100 bg-gray-50/60" style={{ height: `${calendarHeight}px` }}>
	                            {hourSlots.slice(0, -1).map((hour) => {
	                              const top = (hour - calendarRange.startHour) * pixelsPerHour;
	                              return (
	                                <div key={hour}>
	                                  <div
	                                    className="absolute left-0 right-0 border-t border-dashed border-gray-200"
	                                    style={{ top: `${top}px` }}
	                                  />
	                                  <div className="absolute left-0 top-0 -translate-y-1/2 px-3 text-xs font-semibold text-gray-400" style={{ top: `${top}px` }}>
	                                    {String(hour).padStart(2, '0')}:00
	                                  </div>
	                                </div>
	                              );
	                            })}
	                          </div>

		                          {desktopBoardStaff.map((staffMember) => (
		                            <div
		                              key={staffMember.id}
                                  data-calendar-column={staffMember.id}
                                  ref={registerCalendarColumn(
                                    `day-${staffMember.id}`,
                                    staffMember.id,
                                    currentDate,
                                    calendarRange.startHour,
                                    pixelsPerHour,
                                  )}
		                              className="relative border-r border-gray-100 bg-white/70 last:border-r-0"
		                              style={{ height: `${calendarHeight}px` }}
		                            >
		                              {showUnavailable && (() => {
		                                const dayKey = getWorkingDayKey(currentDate);
		                                const schedule = staffMember.working_hours?.[dayKey];
		                                const staffExceptions = visibleExceptions.filter((exception) => exception.staff_id === staffMember.id);
                                const overlays: Array<{
                                  id?: string;
                                  top: number;
                                  height: number;
                                  label: string;
                                  kind: 'closed' | 'exception';
                                  block?: StaffException;
                                }> = [];

		                                if (!schedule?.isOpen) {
		                                  overlays.push({
		                                    top: 0,
		                                    height: calendarHeight,
		                                    label: 'Почивен ден',
		                                    kind: 'closed',
		                                  });
		                                } else {
		                                  const [openHour, openMinute] = schedule.open.split(':').map(Number);
		                                  const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
		                                  const openOffset = (openHour * 60 + openMinute - calendarRange.startHour * 60) / 60 * pixelsPerHour;
		                                  const closeOffset = (closeHour * 60 + closeMinute - calendarRange.startHour * 60) / 60 * pixelsPerHour;

		                                  if (openOffset > 0) {
		                                    overlays.push({
		                                      top: 0,
		                                      height: openOffset,
		                                      label: 'Извън работно време',
		                                      kind: 'closed',
		                                    });
		                                  }
		                                  if (closeOffset < calendarHeight) {
		                                    overlays.push({
		                                      top: Math.max(closeOffset, 0),
		                                      height: Math.max(calendarHeight - closeOffset, 0),
		                                      label: 'Извън работно време',
		                                      kind: 'closed',
		                                    });
		                                  }
		                                }

                                for (const exception of staffExceptions) {
                                  const window = getExceptionWindow(exception);
                                  const top = Math.max((getMinuteOffset(window.startAt, calendarRange.startHour) / 60) * pixelsPerHour, 0);
                                  const bottom = Math.min((getMinuteOffset(window.endAt, calendarRange.startHour) / 60) * pixelsPerHour, calendarHeight);
                                  const height = Math.max(bottom - top, 40);
                                  overlays.push({
                                    id: exception.id,
                                    top,
                                    height,
                                    label: exception.note || 'Блокиран интервал',
                                    kind: 'exception',
                                    block: exception,
                                  });
                                }

                                return overlays.map((overlay, index) => (
                                  <div
                                    key={overlay.id || `${staffMember.id}-overlay-${index}`}
                                    className={`absolute left-0 right-0 z-0 border-y ${
                                      overlay.kind === 'exception' ? 'border-slate-300/70' : 'border-gray-200/80'
                                    }`}
		                                    style={{
		                                      top: `${overlay.top}px`,
		                                      height: `${overlay.height}px`,
		                                      background:
		                                        overlay.kind === 'exception'
		                                          ? 'repeating-linear-gradient(-45deg, rgba(148,163,184,0.16), rgba(148,163,184,0.16) 6px, rgba(148,163,184,0.05) 6px, rgba(148,163,184,0.05) 12px)'
		                                          : 'rgba(148,163,184,0.08)',
		                                    }}
                                  >
                                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
                                      {overlay.label}
                                    </span>
                                    {overlay.block && (
                                      <>
                                        <button
                                          type="button"
                                          onMouseDown={(event) => beginBlockResize(event, overlay.block!, 'start', currentDate)}
                                          className="absolute left-1/2 top-0 z-[3] h-3 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow"
                                        />
                                        <button
                                          type="button"
                                          onMouseDown={(event) => beginBlockResize(event, overlay.block!, 'end', currentDate)}
                                          className="absolute bottom-0 left-1/2 z-[3] h-3 w-10 -translate-x-1/2 translate-y-1/2 rounded-full border border-slate-200 bg-white shadow"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => openBlockEditorForBlock(overlay.block!)}
                                          className="absolute right-2 top-2 rounded-full border border-white/80 bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm"
                                        >
                                          Редактирай
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ));
                              })()}

		                              {moveDropSlots.map((slot) => (
		                                <div
		                                  key={`${staffMember.id}-${slot.key}`}
		                                  className="absolute left-0 right-0 z-[1] transition-colors"
		                                  style={{ top: `${slot.top}px`, height: `${pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES)}px` }}
		                                  onDragOver={(event) => {
		                                    if (!draggedAppointmentId && !draggedRequestId) return;
		                                    event.preventDefault();
		                                    const [hour, minute] = slot.label.split(':').map(Number);
		                                    const nextStart = new Date(currentDate);
		                                    nextStart.setHours(hour, minute, 0, 0);
                                        const dragTarget = draggedAppointmentId
                                          ? appointments.find((appointment) => appointment.id === draggedAppointmentId)
                                          : inboxItems.find((item) => item.id === draggedRequestId);
                                        if (!dragTarget) return;
                                        const normalizedDragTarget = draggedAppointmentId
                                          ? toMoveTarget(dragTarget as Appointment, 'appointment')
                                          : toMoveTarget(dragTarget as Appointment, 'request');
                                        const candidate = resolveMovePlacement(
                                          normalizedDragTarget,
                                          nextStart.toISOString(),
                                          staffMember.id,
                                        );
                                        invalidDropHintRef.current =
                                          candidate.reason || 'Пуснете върху свободен 15-минутен слот.';
                                        setDropPreview(candidate.preview);
		                                  }}
		                                  onDrop={(event) => {
		                                    event.preventDefault();
		                                    const [hour, minute] = slot.label.split(':').map(Number);
		                                    const nextStart = new Date(currentDate);
		                                    nextStart.setHours(hour, minute, 0, 0);
		                                    if (draggedAppointmentId) {
                                      handleDropReschedule(draggedAppointmentId, nextStart.toISOString(), staffMember.id);
                                      return;
                                    }
		                                    if (draggedRequestId) {
		                                      void handleRequestPlacement(draggedRequestId, nextStart.toISOString(), staffMember.id);
		                                    }
		                                  }}
                                      onClick={() => {
                                        if (Date.now() < suppressTapUntilRef.current) return;
                                        if (draggedAppointmentId || draggedRequestId || touchMoveTarget) return;
                                        openBookingWithPrefill(currentDate, staffMember.id, slot.label);
                                      }}
		                                >
                                    </div>
		                              ))}

                                {dropPreview?.staffId === staffMember.id &&
                                isSameDay(new Date(dropPreview.startAt), currentDate) ? (
                                  (() => {
                                    const metrics = getPreviewMetrics(dropPreview.startAt, calendarRange.startHour, pixelsPerHour);
                                    return (
                                      <div
                                        className="pointer-events-none absolute left-2 right-2 z-[2] rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/14 shadow-[0_12px_32px_rgba(79,70,229,0.18)]"
                                        style={{ top: `${metrics.top}px`, height: `${metrics.height}px` }}
                                      />
                                    );
                                  })()
                                ) : null}

		                              {moveDropSlots.map((slot) => {
                                  const [, minute] = slot.label.split(':').map(Number);
                                  return (
	                                  <div
	                                    key={`line-${staffMember.id}-${slot.key}`}
	                                    className={`absolute left-0 right-0 ${
                                        minute === 0 ? 'border-t border-gray-100' : 'border-t border-dashed border-gray-100/80'
                                      }`}
	                                    style={{ top: `${slot.top}px` }}
	                                  />
	                                );
                                })}

	                              {nowIndicatorOffset !== null && (
	                                <div
	                                  className="absolute left-0 right-0 z-[1] border-t-2 border-rose-400"
	                                  style={{ top: `${nowIndicatorOffset}px` }}
	                                >
	                                  <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-white bg-rose-500 shadow" />
	                                </div>
	                              )}

		                              {staffMember.dayAppointments.map((appointment) => {
		                                const metrics = getEventLayoutMetrics(
		                                  appointment.start_at,
		                                  appointment.end_at,
		                                  calendarRange.startHour,
		                                  pixelsPerHour,
		                                  6,
		                                );
		                                const ownerState = appointment.owner_view_state || appointment.status;
		                                const isSelected = selectedRecordId === appointment.id;
		                                const isSecondary = isSecondaryOwnerState(ownerState);
		                                const accent = appointment.service_color || appointment.staff_color || 'var(--color-primary)';
		                                const soft = isSecondary
		                                  ? 'rgba(248,250,252,0.95)'
		                                  : colorWithAlpha(accent, '18', 'rgba(14, 165, 233, 0.1)');

		                                return (
			                                  <button
			                                    key={appointment.id}
			                                    type="button"
			                                    onPointerDown={(event) => {
                                        if (event.pointerType !== 'mouse' || event.button !== 0) return;
                                        if (['completed', 'cancelled', 'no_show'].includes(appointment.status)) return;
                                        beginDesktopPointerDrag(
                                          toMoveTarget(appointment, 'appointment'),
                                          'appointment',
                                          event.clientX,
                                          event.clientY,
                                        );
                                      }}
				                                    onClick={() => focusRecord(appointment.id, appointment.start_at)}
			                                    className={`absolute left-2 right-2 z-[2] rounded-2xl border px-3 py-2 text-left shadow-sm transition-transform hover:scale-[1.01] select-none ${
			                                      isSelected ? 'ring-2 ring-[var(--color-primary)]/25' : ''
			                                    } ${isSecondary ? 'opacity-45 saturate-50' : ''} ${
                                        draggedAppointmentId === appointment.id ? 'opacity-20 scale-[0.99]' : ''
                                      } overflow-hidden`}
		                                    style={{
		                                      top: `${metrics.top}px`,
		                                      height: `${metrics.height}px`,
		                                      borderColor: colorWithAlpha(accent, isSecondary ? '28' : '55', 'rgba(14, 165, 233, 0.3)'),
		                                      backgroundColor: soft,
		                                      borderStyle: isSecondary ? 'dashed' : 'solid',
		                                      boxShadow: isSelected ? '0 0 0 1px rgba(99, 102, 241, 0.2)' : undefined,
                                          WebkitTouchCallout: 'none',
                                          touchAction: touchMoveTarget ? 'none' : 'manipulation',
		                                    }}
		                                  >
		                                    {renderAppointmentCardBody(appointment, metrics.height)}
			                                  </button>
			                                );
			                              })}
	                            </div>
	                          ))}
	                        </div>
	                      </div>
	                    </div>
		                  ) : null}
	                        </>
	                      )}

			                  <div className={`${calendarView === 'list' ? 'space-y-3' : 'hidden'}`}>
	                    {filteredDayAppointments.map((appointment) => {
	                      const startTime = format(new Date(appointment.start_at), 'HH:mm');
	                      const endTime = format(new Date(appointment.end_at), 'HH:mm');
	                      const isSelected = selectedRecordId === appointment.id;
                        const isSecondary = isSecondaryOwnerState(appointment.owner_view_state || appointment.status);

	                      return (
	                        <div
	                          key={appointment.id}
	                          className={`group flex w-full gap-3 rounded-[24px] border p-3 text-left shadow-sm transition-all sm:p-4 ${
	                            isSelected
	                              ? 'border-[var(--color-primary)] bg-white ring-2 ring-[var(--color-primary)]/10'
	                              : 'border-gray-100 bg-white/90 hover:border-[var(--color-primary)]/25 hover:bg-white'
	                          } ${isSecondary ? 'opacity-55 saturate-50' : ''}`}
	                        >
	                          <button
	                            type="button"
		                            onClick={() => focusRecord(appointment.id, appointment.start_at)}
	                            className="flex w-full gap-3 text-left select-none"
                              style={{ WebkitTouchCallout: 'none', touchAction: touchMoveTarget ? 'none' : 'manipulation' }}
	                          >
	                            <div className="flex w-16 flex-shrink-0 flex-col items-center gap-1.5 rounded-[20px] border border-gray-100 bg-gray-50/80 px-2 py-3">
	                              <span className="text-sm font-black text-gray-900">{startTime}</span>
	                              <div
	                                className="h-full min-h-[28px] w-1.5 rounded-full"
	                                style={{ backgroundColor: appointment.service_color || appointment.staff_color || 'var(--color-primary)' }}
	                              />
	                              <span className="text-[11px] font-semibold text-gray-400">{endTime}</span>
	                            </div>

	                            <div className="min-w-0 flex-1">
	                              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
	                                <div className="min-w-0">
	                                  <p className="truncate text-base font-black text-gray-900">{appointment.client_name}</p>
	                                  <p className="mt-1 text-sm font-semibold text-gray-700">{appointment.service_name}</p>
		                                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
	                                    <span className="flex items-center gap-1">
	                                      <Clock className="w-3.5 h-3.5" />
	                                      {startTime} – {endTime}
	                                    </span>
		                                  </div>
	                                </div>
	                              </div>
	                            </div>
	                          </button>
	                        </div>
	                      );
	                    })}
	                  </div>
	                </div>
	              )}
	            </div>
          </div>

        </section>

      </div>

      {showRequestsPanel && (
        <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setShowRequestsPanel(false)}>
          <div
            className="absolute inset-x-4 bottom-4 max-h-[82vh] overflow-y-auto rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-2xl shadow-black/10 backdrop-blur lg:inset-y-4 lg:bottom-auto lg:left-4 lg:right-auto lg:w-[360px] lg:max-w-[calc(100vw-2rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-gray-200 lg:hidden" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Заявки</p>
                <h3 className="mt-1 text-lg font-black text-gray-900">Чакат решение</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestsPanel(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {actionItems.length ? (
                actionItems.map((item) => renderRequestCard(item))
              ) : (
                <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-sm text-gray-400">
                  Няма чакащи заявки за решение.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDesktopDetails && (selectedAppointment || selectedInboxItem) && (
        <div className="fixed inset-0 z-30 hidden bg-black/40 p-4 lg:flex lg:items-center lg:justify-center" onClick={() => setShowDesktopDetails(false)}>
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[32px] border border-white/70 bg-white/95 p-5 shadow-2xl shadow-black/10 backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Детайли за часа</p>
              <button
                type="button"
                onClick={() => setShowDesktopDetails(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderDesktopDetailsPanel()}
          </div>
        </div>
      )}

      {dropPreview && activePreviewTarget && previewPlacementLabel && (
        <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+12px)] z-40 -translate-x-1/2">
          <div className="rounded-full border border-[var(--color-primary)]/20 bg-white/95 px-4 py-2 shadow-xl shadow-black/10 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Нов час</p>
            <p className="mt-0.5 text-sm font-bold text-gray-900">{previewPlacementLabel}</p>
          </div>
        </div>
      )}

      {touchMoveTarget && touchMoveMode === 'confirm' && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+20px)] left-4 right-4 z-40 lg:hidden">
          <div className="rounded-[24px] border border-white/70 bg-white/95 p-3 shadow-2xl shadow-black/10 backdrop-blur">
            <p className="text-sm font-semibold text-gray-900">{touchMoveTarget.client_name}</p>
            <p className="mt-1 text-xs text-gray-500">
              {pendingTouchPlacement
                ? 'Слотът е избран. Потвърдете преместването.'
                : 'Докоснете 15-минутен слот в календара.'}
            </p>
            {previewPlacementLabel && (
              <p className="mt-2 rounded-2xl bg-[var(--color-primary)]/8 px-3 py-2 text-xs font-bold text-[var(--color-primary)]">
                {previewPlacementLabel}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={confirmTouchMove}
                disabled={!pendingTouchPlacement || rescheduleMutation.isPending}
                className="flex-1 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Потвърди преместването
              </button>
              <button
                type="button"
                onClick={clearTouchMoveState}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700"
              >
                Отказ
              </button>
            </div>
          </div>
        </div>
      )}

      {(draggedAppointmentId || draggedRequestId) && activePreviewTarget && (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 hidden -translate-x-1/2 rounded-2xl border border-[var(--color-primary)]/20 bg-white/95 px-4 py-3 shadow-2xl shadow-black/10 backdrop-blur lg:flex lg:min-w-[280px] lg:max-w-[420px] lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-gray-900">{activePreviewTarget.client_name}</p>
            <p className="truncate text-xs font-semibold text-gray-500">{activePreviewTarget.service_name}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">Преместване</p>
            <p className="mt-1 text-sm font-bold text-[var(--color-primary)]">
              {dropPreview ? 'Пуснете върху свободния слот в колоната.' : 'Плъзнете към свободен слот'}
            </p>
          </div>
        </div>
      )}

      {!showRequestsPanel && !touchMoveTarget && !showMobileDetails && !selectedRecordId && actionItems.length > 0 && (
        <button
          type="button"
          onClick={() => setShowRequestsPanel(true)}
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] right-4 z-30 rounded-full bg-amber-500 px-4 py-3 text-sm font-semibold text-white shadow-xl lg:hidden"
        >
          Заявки ({actionItems.length})
        </button>
      )}

      {showMobileDetails && (selectedAppointment || selectedInboxItem) && (
        <MobileBottomSheet open={showMobileDetails} onClose={() => setShowMobileDetails(false)}>
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-gray-200" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Детайли</p>
              <h3 className="mt-1 text-lg font-black text-gray-900">
                {detailedAppointment?.client_name || selectedInboxItem?.client_name}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {detailedAppointment
                  ? `${detailedAppointment.service_name} · ${detailedAppointment.staff_name}`
                  : selectedInboxItem?.summary}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMobileDetails(false)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Дата и час</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {formatAppointmentDay(detailedAppointment?.start_at || selectedInboxItem!.start_at)}
                </p>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Контакт</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">
                  {formatBulgarianPhoneForDisplay(
                    detailedAppointment?.client_phone || selectedInboxItem!.client_phone,
                  )}
                </p>
              </div>
            </div>

            {detailedAppointment && (
              <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Статус</p>
                    <span
                      className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                        getOwnerStatusPresentation(detailedAppointment).cls
                      }`}
                    >
                      {getOwnerStatusPresentation(detailedAppointment).label}
                    </span>
                  </div>
                  {detailedAppointment.price != null && (
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Стойност</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">{formatEuroAmount(detailedAppointment.price)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {detailedAppointment && <div>{renderPrimaryActions(detailedAppointment)}</div>}

            {selectedInboxItem?.bucket === 'updates' && (
              <button
                type="button"
                onClick={() => handleOwnerAlertRead(selectedInboxItem.id)}
                className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Маркирай като видяно
              </button>
            )}
          </div>
        </MobileBottomSheet>
      )}

      {showBlockEditor && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto flex h-full max-w-4xl items-center justify-center">
            <div className="w-full max-h-[92vh] overflow-y-auto rounded-[28px] border border-gray-100 bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Time blocks</p>
                  <h3 className="mt-1 text-xl font-black text-gray-900">Блокирани интервали и почивки</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Създавате реални блокове в `staff_exceptions`, които веднага се отразяват в календара и при drag/drop валидациите.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetBlockDraft();
                    setShowBlockEditor(false);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-[28px] border border-gray-100 bg-gray-50 p-4">
                    <h4 className="text-sm font-black text-gray-900">{editingBlockId ? 'Редакция на блок' : 'Нов блок'}</h4>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Специалист</label>
                        <select
                          value={blockDraft.staffId}
                          onChange={(event) => setBlockDraft((current) => ({ ...current, staffId: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        >
                          {calendarStaff.map((staffMember) => (
                            <option key={staffMember.id} value={staffMember.id}>
                              {staffMember.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Дата</label>
                        <input
                          type="date"
                          value={blockDraft.date}
                          onChange={(event) => setBlockDraft((current) => ({ ...current, date: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-gray-700">От</label>
                          <input
                            type="time"
                            value={blockDraft.startTime}
                            onChange={(event) => setBlockDraft((current) => ({ ...current, startTime: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-gray-700">До</label>
                          <input
                            type="time"
                            value={blockDraft.endTime}
                            onChange={(event) => setBlockDraft((current) => ({ ...current, endTime: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Тип</label>
                        <select
                          value={blockDraft.type}
                          onChange={(event) => setBlockDraft((current) => ({ ...current, type: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        >
                          <option value="blocked">Блокирано време</option>
                          <option value="partial_day">Частичен блок</option>
                          <option value="vacation">Отпуск</option>
                          <option value="sick">Болничен</option>
                        </select>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Бележка</label>
                        <input
                          type="text"
                          value={blockDraft.note}
                          onChange={(event) => setBlockDraft((current) => ({ ...current, note: event.target.value }))}
                          placeholder="Пример: обедна почивка"
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => createBlockMutation.mutate()}
                        disabled={
                          createBlockMutation.isPending ||
                          !blockDraft.staffId ||
                          blockDraft.staffId === 'all' ||
                          !blockDraft.date ||
                          !blockDraft.startTime ||
                          !blockDraft.endTime
                        }
                        className="w-full rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 disabled:opacity-50"
                      >
                        {createBlockMutation.isPending ? 'Записване...' : editingBlockId ? 'Обнови блока' : 'Запази блока'}
                      </button>
                      {editingBlockId && (
                        <button
                          type="button"
                          onClick={resetBlockDraft}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          Откажи редакцията
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Видими блокове</p>
                      <h4 className="mt-1 text-base font-black text-gray-900">
                        {calendarView === 'week' ? 'Блокове за седмицата' : 'Блокове за деня'}
                      </h4>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {visibleBlockList.length}
                    </span>
                  </div>

                  {!visibleBlockList.length ? (
                    <div className="rounded-[28px] border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                      Няма блокирани интервали в текущия изглед.
                    </div>
                  ) : (
                    visibleBlockList.map((block) => {
                      const staffMember = calendarStaff.find((staff) => staff.id === block.staff_id);
                      return (
                        <div key={block.id} className="rounded-[28px] border border-gray-100 bg-white px-4 py-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span
                                  className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white"
                                  style={{ backgroundColor: staffMember?.color || block.staff_color || 'var(--color-primary)' }}
                                >
                                  {getInitials(staffMember?.name || block.staff_name || 'S')}
                                </span>
                                <div>
                                  <p className="text-sm font-black text-gray-900">{staffMember?.name || block.staff_name || 'Специалист'}</p>
                                  <p className="text-xs text-gray-500">{getExceptionTypeLabel(block.type)}</p>
                                </div>
                              </div>
                              <p className="mt-3 text-sm font-semibold text-gray-900">
                                {formatAppointmentDay(block.start_at)} – {format(new Date(block.end_at), 'HH:mm')}
                              </p>
                              {block.note && <p className="mt-2 text-sm text-gray-500">{block.note}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openBlockEditorForBlock(block)}
                                className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Редактирай
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteBlockMutation.mutate(block.id)}
                                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                                aria-label="Изтрий блока"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showWaitlistModal && (
        <div className="fixed inset-0 z-50 bg-black/45 p-4">
          <div className="mx-auto flex h-full max-w-5xl items-center justify-center">
            <div className="w-full max-h-[92vh] overflow-y-auto rounded-[28px] border border-gray-100 bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Waitlist</p>
                  <h3 className="mt-1 text-xl font-black text-gray-900">Резервен списък</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Тук записвате клиенти за освободени слотове и изпращате покана директно от календара.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWaitlistModal(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-[28px] border border-gray-100 bg-gray-50 p-4">
                    <h4 className="text-sm font-black text-gray-900">Нов чакащ клиент</h4>
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Клиент</label>
                        <input
                          type="text"
                          value={waitlistDraft.clientName}
                          onChange={(event) => setWaitlistDraft((current) => ({ ...current, clientName: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          placeholder="Име на клиента"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Телефон</label>
                        <input
                          type="tel"
                          value={waitlistDraft.clientPhone}
                          onChange={(event) => setWaitlistDraft((current) => ({ ...current, clientPhone: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          placeholder="+359..."
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Имейл</label>
                        <input
                          type="email"
                          value={waitlistDraft.clientEmail}
                          onChange={(event) => setWaitlistDraft((current) => ({ ...current, clientEmail: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          placeholder="По избор"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Услуга</label>
                        <select
                          value={waitlistDraft.serviceId}
                          onChange={(event) => setWaitlistDraft((current) => ({ ...current, serviceId: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        >
                          <option value="">Изберете услуга</option>
                          {adminServices.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Специалист</label>
                        <select
                          value={waitlistDraft.staffId}
                          onChange={(event) => setWaitlistDraft((current) => ({ ...current, staffId: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                        >
                          <option value="">Всеки свободен</option>
                          {calendarStaff.map((staffMember) => (
                            <option key={staffMember.id} value={staffMember.id}>
                              {staffMember.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-gray-700">Дата</label>
                          <input
                            type="date"
                            value={waitlistDraft.desiredDate}
                            onChange={(event) => setWaitlistDraft((current) => ({ ...current, desiredDate: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-gray-700">От</label>
                          <input
                            type="time"
                            value={waitlistDraft.desiredFrom}
                            onChange={(event) => setWaitlistDraft((current) => ({ ...current, desiredFrom: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold text-gray-700">До</label>
                          <input
                            type="time"
                            value={waitlistDraft.desiredTo}
                            onChange={(event) => setWaitlistDraft((current) => ({ ...current, desiredTo: event.target.value }))}
                            className="w-full rounded-2xl border border-gray-200 bg-white px-3 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold text-gray-700">Бележка</label>
                        <textarea
                          rows={3}
                          value={waitlistDraft.notes}
                          onChange={(event) => setWaitlistDraft((current) => ({ ...current, notes: event.target.value }))}
                          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                          placeholder="Напр. свободен е следобед, държи на конкретен специалист..."
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => waitlistCreateMutation.mutate()}
                        disabled={
                          waitlistCreateMutation.isPending ||
                          !waitlistDraft.clientName.trim() ||
                          !waitlistDraft.serviceId ||
                          !/^\+359\d{9}$/.test(normalizeBulgarianPhone(waitlistDraft.clientPhone))
                        }
                        className="w-full rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 disabled:opacity-50"
                      >
                        {waitlistCreateMutation.isPending ? 'Записване...' : 'Добави в чакащи'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Активни записи</p>
                      <h4 className="mt-1 text-base font-black text-gray-900">Чакащи и уведомени</h4>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                      {activeWaitlistEntries.length}
                    </span>
                  </div>

                  {!waitlistEntries.length ? (
                    <div className="rounded-[28px] border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                      Няма записи в чакащи за текущия диапазон.
                    </div>
                  ) : (
                    waitlistEntries.map((entry) => {
                      const status = getWaitlistStatusPresentation(entry.status);
                      const notifyStartAt =
                        detailedAppointment?.start_at ||
                        (entry.desired_date && entry.desired_from
                          ? `${entry.desired_date}T${entry.desired_from}+03:00`
                          : null);

                      return (
                        <div key={entry.id} className="rounded-[28px] border border-gray-100 bg-white px-4 py-4 shadow-sm">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-black text-gray-900">{entry.client_name}</p>
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${status.cls}`}>
                                  {status.label}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                {entry.service_name}
                                {entry.staff_name ? ` · ${entry.staff_name}` : ''}
                              </p>
                            </div>
                            <div className="text-right text-xs text-gray-500">
                              <p>{formatBulgarianPhoneForDisplay(entry.client_phone)}</p>
                              {entry.desired_date && <p>{entry.desired_date}</p>}
                            </div>
                          </div>

                          {(entry.desired_from || entry.desired_to || entry.notes) && (
                            <div className="mt-3 space-y-1 text-xs text-gray-500">
                              {(entry.desired_from || entry.desired_to) && (
                                <p>
                                  Желан слот: {entry.desired_from?.slice(0, 5) || 'няма'}
                                  {entry.desired_to ? ` – ${entry.desired_to.slice(0, 5)}` : ''}
                                </p>
                              )}
                              {entry.notes && <p>{entry.notes}</p>}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                waitlistNotifyMutation.mutate({
                                  id: entry.id,
                                  slotStartAt: notifyStartAt,
                                  slotStaffId: detailedAppointment?.staff_id || entry.staff_id || null,
                                  appointmentId: detailedAppointment?.id || null,
                                })
                              }
                              disabled={!notifyStartAt || waitlistNotifyMutation.isPending}
                              className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                            >
                              Изпрати свободен слот
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                waitlistStatusMutation.mutate({
                                  id: entry.id,
                                  status: 'booked',
                                  bookedAppointmentId: detailedAppointment?.id || null,
                                })
                              }
                              className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                            >
                              Маркирай записан
                            </button>
                            <button
                              type="button"
                              onClick={() => waitlistStatusMutation.mutate({ id: entry.id, status: 'cancelled' })}
                              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                            >
                              Архивирай
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
	      )}

	      <AppointmentMoveModal
	        open={showMoveModal}
	        appointment={moveTargetAppointment}
	        onClose={() => setShowMoveModal(false)}
	        onMoved={(startAt) => {
	          setShowMoveModal(false);
	          setCurrentDate(new Date(startAt));
	          refetch();
	          qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
	          qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
	          qc.invalidateQueries({ queryKey: ['appointment-context'] });
	          qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
	        }}
	      />

	      <AdminBookingModal
	        open={showBookingModal}
	        defaultDate={bookingPrefill?.date || dateKey}
          defaultStaffId={bookingPrefill?.staffId || ''}
          preferredSlot={bookingPrefill?.preferredSlot || ''}
        onClose={() => {
          setShowBookingModal(false);
          setBookingPrefill(null);
        }}
        onCreated={handleBookingCreated}
      />
    </div>
  );
}

function AppointmentMoveModal({
  open,
  appointment,
  onClose,
  onMoved,
}: {
  open: boolean;
  appointment: Appointment | (AppointmentContextResponse['appointment'] & Appointment) | null;
  onClose: () => void;
  onMoved: (startAt: string) => void;
}) {
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const appointmentServiceId = appointment?.service_id || '';

  useEffect(() => {
    if (!open || !appointment) return;
    setStaffId(appointment.staff_id);
    setSelectedDate(format(new Date(appointment.start_at), 'yyyy-MM-dd'));
    setSelectedSlot('');
  }, [appointment, open]);

  const { data: staffOptions, isLoading: staffLoading } = useQuery({
    queryKey: ['appointment-move-staff', appointmentServiceId],
    queryFn: () => apiClient.get<StaffMember[]>('/staff', { serviceId: appointmentServiceId }),
    enabled: open && Boolean(appointmentServiceId),
    staleTime: 30 * 1000,
  });

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ['appointment-move-slots', appointmentServiceId, staffId, selectedDate],
    queryFn: () =>
      apiClient.get<Slot[]>('/appointments/slots', {
        serviceId: appointmentServiceId,
        staffId,
        date: selectedDate,
      }),
    enabled: open && Boolean(appointmentServiceId) && Boolean(staffId) && Boolean(selectedDate),
    staleTime: 15 * 1000,
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!appointment) {
        throw new Error('Липсва резервация за преместване.');
      }

      const [year, month, day] = selectedDate.split('-').map(Number);
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
      await apiClient.patch(`/appointments/${appointment.id}/reschedule`, { startAt, staffId });
      return startAt;
    },
    onSuccess: (startAt) => {
      toast.success('Часът е преместен.');
      queryClient.invalidateQueries({ queryKey: ['appointment-context'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      onMoved(startAt);
    },
    onError: (error: any) => {
      toast.error(getRescheduleErrorMessage(error, 'Неуспешно преместване на часа.'));
    },
  });

  if (!open || !appointment) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4">
      <div className="mx-auto flex h-full max-w-xl items-center justify-center">
        <div className="w-full max-h-[92vh] overflow-y-auto rounded-[28px] border border-gray-100 bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-5">
            <div>
              <h3 className="text-xl font-black text-gray-900">Премести час</h3>
              <p className="mt-1 text-sm text-gray-500">
                Избери нов специалист, дата и свободен слот за {appointment.client_name}.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Текущ запис</p>
              <p className="mt-2 text-sm font-black text-gray-900">{appointment.client_name}</p>
              <p className="mt-1 text-sm text-gray-600">{appointment.service_name}</p>
              <p className="mt-1 text-xs text-gray-500">
                {formatAppointmentDay(appointment.start_at)} · {appointment.staff_name}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Специалист</label>
                <select
                  value={staffId}
                  onChange={(event) => {
                    setStaffId(event.target.value);
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="">{staffLoading ? 'Зареждане...' : 'Изберете специалист'}</option>
                  {staffOptions?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Дата</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700">Свободни слотове</label>
              <div className="min-h-[84px] rounded-2xl border border-gray-200 bg-gray-50 p-3">
                {!staffId || !selectedDate ? (
                  <p className="text-sm text-gray-400">Избери специалист и дата.</p>
                ) : slotsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                  </div>
                ) : !slots?.length ? (
                  <p className="text-sm text-gray-400">Няма свободни слотове за този ден.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        onClick={() => setSelectedSlot(slot.start)}
                        className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                          selectedSlot === slot.start
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'border border-gray-200 bg-white text-gray-700 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                        }`}
                      >
                        {slot.start}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Отказ
              </button>
              <button
                type="button"
                disabled={!staffId || !selectedDate || !selectedSlot || moveMutation.isPending}
                onClick={() => moveMutation.mutate()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Запази новия час
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminBookingModal({
  open,
  defaultDate,
  defaultStaffId,
  preferredSlot,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultDate: string;
  defaultStaffId: string;
  preferredSlot: string;
  onClose: () => void;
  onCreated: (startAt: string) => void;
}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [lookupField, setLookupField] = useState<'name' | 'phone'>('name');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const lookupValue = lookupField === 'phone' ? clientPhone : clientName;
  const deferredLookupValue = useDeferredValue(lookupValue.trim());

  const resetForm = () => {
    setServiceId('');
    setStaffId(defaultStaffId);
    setSelectedDate(defaultDate);
    setSelectedSlot('');
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setNotes('');
    setLookupField('name');
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (open) {
      setServiceId('');
      setStaffId(defaultStaffId);
      setSelectedDate(defaultDate);
      setSelectedSlot('');
      setClientName('');
      setClientPhone('');
      setClientEmail('');
      setNotes('');
      setLookupField('name');
      setShowSuggestions(false);
    }
  }, [defaultDate, defaultStaffId, open]);

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['admin-booking-services'],
    queryFn: () => apiClient.get<Service[]>('/services/admin'),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ['admin-booking-staff', serviceId],
    queryFn: () => apiClient.get<StaffMember[]>('/staff', { serviceId }),
    enabled: open && !!serviceId,
    staleTime: 30 * 1000,
  });

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ['admin-booking-slots', serviceId, staffId, selectedDate],
    queryFn: () =>
      apiClient.get<Slot[]>('/appointments/slots', {
        serviceId,
        staffId,
        date: selectedDate,
      }),
    enabled: open && !!serviceId && !!staffId && !!selectedDate,
    staleTime: 15 * 1000,
  });

  const { data: clientSuggestions, isFetching: suggestionsLoading } = useQuery({
    queryKey: ['admin-booking-clients', lookupField, deferredLookupValue],
    queryFn: () => apiClient.get<ClientSuggestion[]>('/clients', { q: deferredLookupValue }),
    enabled: open && deferredLookupValue.length >= 2,
    staleTime: 15 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();

      return apiClient.post<{ id: string; status: string; startAt: string }>('/appointments/admin', {
        serviceId,
        staffId,
        startAt,
        clientName: clientName.trim(),
        clientPhone: normalizeBulgarianPhone(clientPhone),
        clientEmail: tenant.collectClientEmail ? clientEmail.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        consentGiven: true,
        publicBaseUrl: window.location.origin,
      });
    },
    onSuccess: (data) => {
      toast.success('Резервацията е записана.');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      resetForm();
      onCreated(data.startAt);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Грешка при записване на резервацията.');
    },
  });

  const canSubmit =
    !!serviceId &&
    !!staffId &&
    !!selectedDate &&
    !!selectedSlot &&
    clientName.trim().length >= 2 &&
    /^\+359\d{9}$/.test(normalizeBulgarianPhone(clientPhone));

  const preferredSlotAvailable = useMemo(
    () => Boolean(preferredSlot && slots?.some((slot) => slot.start === preferredSlot)),
    [preferredSlot, slots],
  );
  const nearestPreferredSlots = useMemo(() => {
    if (!preferredSlot || !slots?.length || preferredSlotAvailable) {
      return [];
    }

    const preferredMinutes = timeLabelToMinutes(preferredSlot);
    if (preferredMinutes === null) {
      return [];
    }

    const withMinutes = slots
      .map((slot) => {
        const slotMinutes = timeLabelToMinutes(slot.start);
        if (slotMinutes === null) {
          return null;
        }

        return {
          slot,
          slotMinutes,
          distanceMinutes: Math.abs(slotMinutes - preferredMinutes),
          direction: slotMinutes < preferredMinutes ? 'earlier' : 'later',
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    return withMinutes
      .sort((left, right) => {
        if (left.distanceMinutes !== right.distanceMinutes) {
          return left.distanceMinutes - right.distanceMinutes;
        }
        return left.slotMinutes - right.slotMinutes;
      })
      .slice(0, 4);
  }, [preferredSlot, preferredSlotAvailable, slots]);

  useEffect(() => {
    if (!staff?.length) return;

    if (defaultStaffId && staff.some((member) => member.id === defaultStaffId)) {
      setStaffId((current) => current || defaultStaffId);
      return;
    }

    if (staffId && !staff.some((member) => member.id === staffId)) {
      setStaffId('');
      setSelectedSlot('');
    }
  }, [defaultStaffId, staff, staffId]);

  useEffect(() => {
    if (!preferredSlot || !slots?.length || !preferredSlotAvailable) return;
    setSelectedSlot((current) => current || preferredSlot);
  }, [preferredSlot, preferredSlotAvailable, slots]);

  const chooseClient = (client: ClientSuggestion) => {
      setClientName(client.name);
      setClientPhone(formatBulgarianPhoneForDisplay(client.phone));
      setClientEmail(client.email || '');
      setShowSuggestions(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/45 p-4">
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
        <div className="w-full max-h-[92vh] overflow-y-auto rounded-[28px] border border-gray-100 bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-5">
            <div>
              <h3 className="text-xl font-black text-gray-900">Нова резервация от админ</h3>
              <p className="mt-1 text-sm text-gray-500">Часът ще се запише директно за избрания клиент.</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Услуга</label>
                <select
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    setStaffId('');
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="">{servicesLoading ? 'Зареждане...' : 'Изберете услуга'}</option>
                  {services?.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.price != null ? ` · ${service.price} €` : ' · цена по запитване'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Специалист</label>
                <select
                  value={staffId}
                  onChange={(e) => {
                    setStaffId(e.target.value);
                    setSelectedSlot('');
                  }}
                  disabled={!serviceId}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {!serviceId ? 'Първо изберете услуга' : staffLoading ? 'Зареждане...' : 'Изберете специалист'}
                  </option>
                  {staff?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Дата</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                />
                {preferredSlot ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--color-primary)]">
                    Избран слот от календара: {preferredSlot}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Свободни часове</label>
                <div className="min-h-[60px] rounded-2xl border border-gray-200 bg-gray-50 p-2">
                  {!serviceId || !staffId ? (
                    <p className="px-2 py-3 text-sm text-gray-400">Изберете услуга и специалист.</p>
                  ) : slotsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                    </div>
                  ) : preferredSlot && !preferredSlotAvailable && slots?.length ? (
                    <div className="space-y-3 px-2 py-2">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        <p className="font-semibold">
                          Точният час {preferredSlot} не е свободен за тази услуга.
                        </p>
                        <p className="mt-1 text-xs text-amber-800/80">
                          Показваме най-близките свободни варианти около избрания момент, включително по-ранни и по-късни часове.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {nearestPreferredSlots.map((option) => (
                          <button
                            key={option.slot.start}
                            type="button"
                            onClick={() => setSelectedSlot(option.slot.start)}
                            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                              selectedSlot === option.slot.start
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'bg-white text-gray-700 border border-amber-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                            }`}
                          >
                            {option.slot.start} {option.direction === 'earlier' ? '· по-рано' : '· по-късно'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : !slots?.length ? (
                    <p className="px-2 py-3 text-sm text-gray-400">Няма свободни часове за тази дата.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelectedSlot(slot.start)}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                            selectedSlot === slot.start
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white text-gray-700 border border-gray-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                          }`}
                        >
                          {slot.start}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relative">
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Име на клиент</label>
                  <input
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      setLookupField('name');
                      setShowSuggestions(true);
                    }}
                    placeholder="Мария Иванова"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="relative">
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Телефон</label>
                  <input
                    value={clientPhone}
                    onChange={(e) => {
                      setClientPhone(e.target.value);
                      setLookupField('phone');
                      setShowSuggestions(true);
                    }}
                    placeholder="0888123456"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              {showSuggestions && deferredLookupValue.length >= 2 && (clientSuggestions?.length || suggestionsLoading) && (
                <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Търсене в клиентската база...
                    </div>
                  ) : (
                    clientSuggestions?.slice(0, 6).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => chooseClient(client)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatBulgarianPhoneForDisplay(client.phone)}
                            {tenant.collectClientEmail && client.email ? ` · ${client.email}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">{client.total_visits} посещ.</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {tenant.collectClientEmail && (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="maria@example.com"
                        className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Бележка</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Клиентът предпочита следобед."
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Резервацията ще се създаде директно. Ако клиентът вече съществува в базата, изборът от предложенията попълва автоматично име и телефон.
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Отказ
              </button>
              <button
                type="button"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Запиши
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
