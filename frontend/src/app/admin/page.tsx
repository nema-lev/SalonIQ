'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays, isToday, startOfDay, endOfDay, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { bg } from 'date-fns/locale';
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CalendarDays,
  CheckCheck,
  KeyRound,
  LayoutGrid,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCcw,
  Rows3,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  User,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import {
  formatBulgarianPhoneForDisplay,
  normalizeBulgarianPhone,
} from '@/lib/phone';
import { useTenant } from '@/lib/tenant-context';
import { ResponsiveSheet } from '@/components/admin/ResponsiveSheet';

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

interface CalendarBoardResponse {
  staff: CalendarBoardStaff[];
  appointments: Appointment[];
  exceptions: StaffException[];
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
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  requested: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  proposal_pending: { label: 'Предложен час', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  proposal_sent: { label: 'Предложен час', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  confirmed: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  approved: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  booked_direct: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  proposal_accepted: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  completed: { label: 'Приключен', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  cancelled: { label: 'Отменен', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  rejected: { label: 'Отказан', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  proposal_rejected: { label: 'Отказан', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  cancelled_by_owner: { label: 'Отменен от салона', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  cancelled_by_client: { label: 'Отменен от клиент', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  no_show: { label: 'Неявил се', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

const STATUS_FILTER_OPTIONS = [
  { key: 'all', label: 'Всички статуси' },
  { key: 'requests', label: 'Заявки' },
  { key: 'booked', label: 'Запазени' },
  { key: 'cancelled', label: 'Отказани / отменени' },
  { key: 'completed', label: 'Приключени' },
] as const;

type InboxBucket = 'actions' | 'updates';

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

  if (appointment.owner_alert_state === 'proposal_accepted') {
    return {
      ...appointment,
      bucket: 'updates',
      label: 'Клиент прие',
      summary: 'Клиентът прие предложен нов час.',
      detailLabel: 'Прието предложение',
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      requiresAction: false,
    };
  }

  if (appointment.owner_alert_state === 'proposal_rejected') {
    return {
      ...appointment,
      bucket: 'updates',
      label: 'Клиент отказа',
      summary: 'Клиентът отказа предложения от Вас нов час.',
      detailLabel: 'Отказано предложение',
      toneClass: 'border-rose-200 bg-rose-50 text-rose-700',
      requiresAction: false,
    };
  }

  if (appointment.status === 'proposal_pending') {
    return {
      ...appointment,
      bucket: 'actions',
      label: 'Чака клиент',
      summary: 'Изпратено е предложение за нов час и чака отговор.',
      detailLabel: 'Предложен час',
      toneClass: 'border-violet-200 bg-violet-50 text-violet-700',
      requiresAction: true,
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

function formatAppointmentDay(value?: string) {
  if (!value) return "";
  return format(new Date(value), "d MMM yyyy '·' HH:mm", { locale: bg });
}

function sortByStartAt<T extends { start_at: string }>(items: T[] | undefined) {
  return [...(items ?? [])].sort(
    (left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime(),
  );
}

function getNotificationTypeLabel(type: string) {
  const labels: Record<string, string> = {
    booking_pending: 'Нова заявка',
    'booking-pending': 'Нова заявка',
    booking_confirmed: 'Потвърден час',
    'booking-confirmed': 'Потвърден час',
    booking_approved: 'Потвърден час',
    'booking-approved': 'Потвърден час',
    booking_cancelled_client: 'Клиентска отмяна',
    'booking-cancelled-client': 'Клиентска отмяна',
    booking_cancelled_business: 'Отказ от салона',
    'booking-cancelled-business': 'Отказ от салона',
    booking_proposal: 'Предложен нов час',
    'booking-proposal': 'Предложен нов час',
    reminder_24h: 'Напомняне 24 ч.',
    'reminder-24h': 'Напомняне 24 ч.',
    reminder_2h: 'Напомняне 2 ч.',
    'reminder-2h': 'Напомняне 2 ч.',
    status_changed: 'Промяна на статус',
    'status-changed': 'Промяна на статус',
  };

  return labels[type] || type;
}

function getNotificationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    sent: 'Изпратено',
    delivered: 'Доставено',
    failed: 'Грешка',
    pending: 'Чака',
    read: 'Прочетено',
  };

  return labels[status] || status;
}

function getNotificationStatusClass(status: string) {
  const styles: Record<string, string> = {
    sent: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    delivered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    failed: 'border-rose-200 bg-rose-50 text-rose-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    read: 'border-sky-200 bg-sky-50 text-sky-700',
  };

  return styles[status] || 'border-gray-200 bg-gray-50 text-gray-600';
}

function getChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    telegram: 'Telegram',
    sms: 'SMS',
    email: 'Email',
  };

  return labels[channel] || channel;
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

function getVisitProgressClass(progress?: string) {
  const styles: Record<string, string> = {
    scheduled: 'border-slate-200 bg-slate-100 text-slate-700',
    checked_in: 'border-sky-200 bg-sky-100 text-sky-700',
    in_service: 'border-violet-200 bg-violet-100 text-violet-700',
    completed: 'border-emerald-200 bg-emerald-100 text-emerald-700',
    no_show: 'border-rose-200 bg-rose-100 text-rose-700',
  };

  return styles[progress || 'scheduled'] || styles.scheduled;
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

function getWorkingDayKey(value: Date) {
  return format(value, 'EEE', { locale: bg }).toLowerCase().slice(0, 3);
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

function matchesCalendarStatusFilter(
  item: { status?: string; owner_view_state?: string },
  filter: 'all' | 'requests' | 'booked' | 'cancelled' | 'completed',
) {
  if (filter === 'all') return true;
  const key = item.owner_view_state || item.status || 'pending';

  if (filter === 'requests') {
    return ['pending', 'requested', 'proposal_pending', 'proposal_sent'].includes(key);
  }

  if (filter === 'booked') {
    return ['confirmed', 'approved', 'booked_direct', 'proposal_accepted'].includes(key);
  }

  if (filter === 'cancelled') {
    return [
      'cancelled',
      'rejected',
      'proposal_rejected',
      'cancelled_by_owner',
      'cancelled_by_client',
    ].includes(key);
  }

  return ['completed', 'no_show'].includes(key);
}

export default function AdminCalendarPage() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [showBlockEditor, setShowBlockEditor] = useState(false);
  const [proposalTarget, setProposalTarget] = useState<Appointment | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [showInboxSheet, setShowInboxSheet] = useState(false);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [calendarView, setCalendarView] = useState<'grid' | 'list' | 'week'>('grid');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'requests' | 'booked' | 'cancelled' | 'completed'>('all');
  const [showUnavailable, setShowUnavailable] = useState(true);
  const [draggedAppointmentId, setDraggedAppointmentId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<{ staffId: string; startAt: string } | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [blockDraft, setBlockDraft] = useState({
    staffId: 'all',
    date: format(new Date(), 'yyyy-MM-dd'),
    startTime: '12:00',
    endTime: '13:00',
    type: 'blocked',
    note: '',
  });
  const dateKey = format(currentDate, 'yyyy-MM-dd');
  const rangeStart = useMemo(
    () => (calendarView === 'week' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfDay(currentDate)),
    [calendarView, currentDate],
  );
  const rangeEndExclusive = useMemo(
    () =>
      calendarView === 'week'
        ? addDays(endOfWeek(currentDate, { weekStartsOn: 1 }), 1)
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
    staleTime: 30 * 1000,
  });

  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: ['appointments-upcoming'],
    queryFn: () =>
      apiClient.get<UpcomingAppointment[]>('/appointments/upcoming', {
        limit: '12',
        mode: 'attention',
      }),
    staleTime: 30 * 1000,
    refetchInterval: 15000,
  });

  const { data: selectedContext, isLoading: contextLoading } = useQuery({
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
      toast.success('Часът е преместен.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно преместване на часа.');
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
      return apiClient.post('/appointments/staff-blocks', {
        staffId: blockDraft.staffId,
        startAt,
        endAt,
        type: blockDraft.type,
        note: blockDraft.note.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      toast.success('Интервалът е блокиран.');
      setBlockDraft((current) => ({ ...current, note: '' }));
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно блокиране на интервала.');
    },
  });

  const deleteBlockMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/appointments/staff-blocks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      toast.success('Блокираният интервал е изтрит.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно изтриване на блока.');
    },
  });

  const visitProgressMutation = useMutation({
    mutationFn: ({ id, progress }: { id: string; progress: 'scheduled' | 'checked_in' | 'in_service' }) =>
      apiClient.patch(`/appointments/${id}/visit-progress`, { progress }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['appointment-context'] });
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      toast.success('Прогресът на посещението е обновен.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Неуспешно обновяване на прогреса.');
    },
  });

  const retryNotificationMutation = useMutation({
    mutationFn: ({ appointmentId, type }: { appointmentId: string; type: string }) =>
      apiClient.post(`/appointments/${appointmentId}/notifications/retry`, { type }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['appointment-context'] });
      toast.success('Известието е пуснато отново.');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Retry на известието не мина.');
    },
  });

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, { status });
      refetch();
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
      qc.invalidateQueries({ queryKey: ['appointment-context', id] });
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
    setProposalTarget(null);
    setCurrentDate(new Date(startAt));
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
    qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
    qc.invalidateQueries({ queryKey: ['appointment-context'] });
    qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
  };

  const handleDropReschedule = (appointmentId: string, startAt: string, staffId: string) => {
    rescheduleMutation.mutate({ id: appointmentId, startAt, staffId });
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
      calendarView === 'week'
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
          appointment.owner_view_state || appointment.status,
        ),
      ).length,
    [appointmentsInView],
  );
  const pendingInView = useMemo(
    () =>
      appointmentsInView.filter((appointment) =>
        ['pending', 'requested', 'proposal_pending', 'proposal_sent'].includes(
          appointment.owner_view_state || appointment.status,
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
  const calendarRange = useMemo(() => buildCalendarRange(filteredDayAppointments), [filteredDayAppointments]);
  const hourSlots = useMemo(
    () =>
      Array.from({ length: calendarRange.endHour - calendarRange.startHour + 1 }, (_, index) => calendarRange.startHour + index),
    [calendarRange.endHour, calendarRange.startHour],
  );
  const pixelsPerHour = 88;
  const calendarHeight = (calendarRange.endHour - calendarRange.startHour) * pixelsPerHour;
  const nowIndicatorOffset = useMemo(() => {
    if (!isToday(currentDate)) return null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = calendarRange.startHour * 60;
    const endMinutes = calendarRange.endHour * 60;
    if (minutes < startMinutes || minutes > endMinutes) return null;
    return ((minutes - startMinutes) / 60) * pixelsPerHour;
  }, [calendarRange.endHour, calendarRange.startHour, currentDate]);
  const halfHourDropSlots = useMemo(
    () =>
      Array.from({ length: (calendarRange.endHour - calendarRange.startHour) * 2 }, (_, index) => {
        const totalMinutes = calendarRange.startHour * 60 + index * 30;
        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;
        return {
          key: `${hour}-${minute}`,
          top: index * (pixelsPerHour / 2),
          label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
        };
      }),
    [calendarRange.endHour, calendarRange.startHour],
  );
  const visibleBlockList = useMemo(
    () =>
      [...visibleExceptions].sort(
        (left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime(),
      ),
    [visibleExceptions],
  );
  const calendarTitle = useMemo(() => {
    if (calendarView !== 'week') {
      return format(currentDate, "d MMMM yyyy 'г.'", { locale: bg });
    }

    const weekEnd = addDays(rangeEndExclusive, -1);
    return `${format(rangeStart, 'd MMM', { locale: bg })} – ${format(weekEnd, "d MMMM yyyy 'г.'", { locale: bg })}`;
  }, [calendarView, currentDate, rangeEndExclusive, rangeStart]);
  const calendarSubtitle = useMemo(() => {
    if (calendarView !== 'week') {
      return format(currentDate, 'EEEE', { locale: bg });
    }

    return 'Седмичен изглед по дни и специалисти';
  }, [calendarView, currentDate]);

  const calendarEmptyState = useMemo(() => {
    if (appointmentsInView.length || visibleExceptions.length) {
      return null;
    }

    const hasFilter = staffFilter !== 'all' || statusFilter !== 'all';
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
          : 'Няма записани часове за този ден',
      description: 'Изберете друга дата или добавете ръчна резервация.',
    };
  }, [appointmentsInView.length, calendarView, staffFilter, statusFilter, visibleExceptions.length]);

  useEffect(() => {
    if (selectedRecordId) return;
    const nextSelection = actionItems[0]?.id || updateItems[0]?.id || dayAppointments[0]?.id || null;
    if (nextSelection) {
      setSelectedRecordId(nextSelection);
    }
  }, [actionItems, dayAppointments, selectedRecordId, updateItems]);

  useEffect(() => {
    if (!selectedRecordId) return;
    const existsInDay = dayAppointments.some((appointment) => appointment.id === selectedRecordId);
    const existsInInbox = inboxItems.some((item) => item.id === selectedRecordId);
    if (existsInDay || existsInInbox) return;

    const nextSelection = actionItems[0]?.id || updateItems[0]?.id || dayAppointments[0]?.id || null;
    setSelectedRecordId(nextSelection);
  }, [actionItems, dayAppointments, inboxItems, selectedRecordId, updateItems]);

  useEffect(() => {
    if (staffFilter === 'all') return;
    if (!calendarStaff.some((staff) => staff.id === staffFilter)) {
      setStaffFilter('all');
    }
  }, [calendarStaff, staffFilter]);

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

  const focusRecord = (id: string, startAt: string, workspace: 'calendar' | 'inbox' = 'calendar') => {
    setSelectedRecordId(id);
    setCurrentDate(new Date(startAt));

    setShowMobileDetails(true);
  };

  const renderPrimaryActions = (appointment: Appointment) => {
    if (appointment.status === 'pending' || appointment.status === 'proposal_pending') {
      return (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStatusChange(appointment.id, 'confirmed')}
            className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Потвърди
          </button>
          <button
            onClick={() => {
              setProposalTarget(appointment);
              setShowBookingModal(true);
            }}
            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
          >
            Предложи нов час
          </button>
          <button
            onClick={() => handleStatusChange(appointment.id, 'cancelled')}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Откажи
          </button>
        </div>
      );
    }

    if (appointment.status === 'confirmed') {
      return (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleStatusChange(appointment.id, 'completed')}
            className="rounded-xl bg-sky-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Приключи
          </button>
          <button
            onClick={() => handleStatusChange(appointment.id, 'no_show')}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Неявил се
          </button>
          <button
            onClick={() => handleStatusChange(appointment.id, 'cancelled')}
            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
          >
            Отмени
          </button>
        </div>
      );
    }

    return null;
  };

  const renderVisitProgressControls = (appointment: Appointment) => {
    if (appointment.status !== 'confirmed') return null;

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Посещение</p>
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getVisitProgressClass(appointment.visit_progress)}`}>
            {appointment.visit_progress_label || 'Очаква се'}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'scheduled', label: 'Очаква се' },
            { key: 'checked_in', label: 'Пристигнал' },
            { key: 'in_service', label: 'В процес' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => visitProgressMutation.mutate({ id: appointment.id, progress: option.key as 'scheduled' | 'checked_in' | 'in_service' })}
              className={`rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
                appointment.visit_progress === option.key
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderCalendarEmptyState = () => (
    <div className="rounded-[28px] border border-dashed border-gray-200 bg-white/80 px-6 py-14 text-center">
      <p className="text-lg font-semibold text-gray-500">{calendarEmptyState?.title}</p>
      <p className="mt-2 text-sm text-gray-400">{calendarEmptyState?.description}</p>
    </div>
  );

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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Бързи действия</p>
            <div className="grid grid-cols-2 gap-2">
              {detailedAppointment.status !== 'proposal_pending' &&
                ['pending', 'confirmed'].includes(detailedAppointment.status) && (
                  <button
                    type="button"
                    onClick={() =>
                      handleStatusChange(
                        detailedAppointment.id,
                        detailedAppointment.status === 'pending' ? 'confirmed' : 'completed',
                      )
                    }
                    className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white hover:opacity-90"
                  >
                    {detailedAppointment.status === 'pending' ? 'Потвърди' : 'Приключи'}
                  </button>
                )}
              {['pending', 'proposal_pending'].includes(detailedAppointment.status) && (
                <button
                  type="button"
                  onClick={() => {
                    setProposalTarget(detailedAppointment);
                    setShowBookingModal(true);
                  }}
                  className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                >
                  Нов час
                </button>
              )}
              {detailedAppointment.status === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(detailedAppointment.id, 'no_show')}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Неявил се
                </button>
              )}
              {!['completed', 'cancelled', 'no_show'].includes(detailedAppointment.status) && (
                <button
                  type="button"
                  onClick={() => handleStatusChange(detailedAppointment.id, 'cancelled')}
                  className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"
                >
                  {detailedAppointment.status === 'confirmed' ? 'Отмени' : 'Откажи'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 min-[1600px]:grid-cols-1">
          <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Дата и слот</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {formatAppointmentDay(detailedAppointment?.start_at || selectedInboxItem?.start_at || "")}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Телефон</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {formatBulgarianPhoneForDisplay(
                detailedAppointment?.client_phone || selectedInboxItem?.client_phone || "",
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Стойност</p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {detailedAppointment?.price != null ? formatEuroAmount(detailedAppointment.price) : 'Няма цена'}
            </p>
          </div>
          {detailedAppointment && (
            <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Резюме</p>
              <div className="mt-2 space-y-1.5 text-sm text-gray-700">
                <p><span className="font-semibold text-gray-900">Услуга:</span> {detailedAppointment.service_name}</p>
                <p><span className="font-semibold text-gray-900">Специалист:</span> {detailedAppointment.staff_name}</p>
                <p><span className="font-semibold text-gray-900">Статус:</span> {getOwnerStatusPresentation(detailedAppointment).label}</p>
              </div>
            </div>
          )}
        </div>

        {detailedAppointment && renderVisitProgressControls(detailedAppointment)}

        {selectedContext?.appointment && (
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

        <div className="rounded-3xl border border-gray-100 bg-white/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Notification center</p>
              <h4 className="mt-1 text-sm font-black text-gray-900">История на известията</h4>
            </div>
            {contextLoading && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-primary)]" />}
          </div>

          <div className="mt-4 space-y-3">
            {selectedContext?.notifications?.length ? (
              selectedContext.notifications.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-gray-100 bg-gray-50/80 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{getNotificationTypeLabel(entry.type)}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {getChannelLabel(entry.channel)} · {entry.sent_at ? formatAppointmentDay(entry.sent_at) : formatAppointmentDay(entry.created_at)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getNotificationStatusClass(entry.status)}`}>
                      {getNotificationStatusLabel(entry.status)}
                    </span>
                  </div>
                  {entry.error_message && <p className="mt-2 text-xs text-rose-600">{entry.error_message}</p>}
                  {entry.status === 'failed' && detailedAppointment && (
                    <button
                      type="button"
                      onClick={() =>
                        retryNotificationMutation.mutate({
                          appointmentId: detailedAppointment.id,
                          type: entry.type,
                        })
                      }
                      className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Retry
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400">За този запис още няма лог на известия.</p>
            )}
          </div>
        </div>

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

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-1 rounded-3xl border border-white/70 bg-white/80 px-2 py-2 shadow-lg shadow-black/5 backdrop-blur xl:hidden">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setShowInboxSheet(false)}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
              !showInboxSheet
                ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                : 'bg-white text-gray-600'
            }`}
          >
            Календар
          </button>
          <button
            type="button"
            onClick={() => setShowInboxSheet(true)}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
              showInboxSheet
                ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                : 'bg-white text-gray-600'
            }`}
          >
            Действия ({attentionCount + updateCount})
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-w-0">
        <ResponsiveSheet
          side="left"
          isOpen={showInboxSheet}
          onClose={() => setShowInboxSheet(false)}
          title="Action inbox"
        >
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Action inbox</p>
                <h3 className="mt-1 text-lg font-black text-gray-900">Какво чака решение</h3>
                <p className="mt-1 text-sm text-gray-500">Всичко, което иска внимание, е тук. Календарът остава отделно и не изчезва при филтриране.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  refetch();
                  qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
                  qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
                }}
                className="rounded-2xl border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50"
                aria-label="Обнови inbox"
              >
                <RefreshCcw className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 min-h-0 space-y-5 overflow-y-auto pr-1">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-bold text-gray-900">Изисква действие</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                    {attentionCount}
                  </span>
                </div>

                {upcomingLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                  </div>
                ) : !actionItems.length ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-400">
                    Няма нови заявки за решение.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {actionItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-3xl border p-3 shadow-sm transition-all ${selectedRecordId === item.id ? 'border-[var(--color-primary)] bg-white ring-2 ring-[var(--color-primary)]/10' : 'border-gray-100 bg-white/90'} `}
                      >
                        <button
                          type="button"
                          onClick={() => focusRecord(item.id, item.start_at, 'calendar')}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${item.toneClass}`}>
                                {item.label}
                              </div>
                              <p className="mt-2 truncate text-sm font-bold text-gray-900">{item.client_name}</p>
                              <p className="mt-1 text-xs text-gray-500">{item.summary}</p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                              <p className="font-semibold text-gray-700">{format(new Date(item.start_at), 'HH:mm')}</p>
                              <p>{format(new Date(item.start_at), 'd MMM', { locale: bg })}</p>
                            </div>
                          </div>
                          <div className="mt-3 space-y-1 text-xs text-gray-500">
                            <p>{item.service_name}</p>
                            <p>{item.staff_name}</p>
                            <p>{formatBulgarianPhoneForDisplay(item.client_phone)}</p>
                          </div>
                        </button>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          {item.status !== 'proposal_pending' && (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(item.id, 'confirmed')}
                              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                            >
                              Потвърди
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const target = dayAppointments.find((appointment) => appointment.id === item.id);
                              if (target) {
                                setProposalTarget(target);
                                setShowBookingModal(true);
                              } else {
                                focusRecord(item.id, item.start_at, 'calendar');
                              }
                            }}
                            className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-100"
                          >
                            Нов час
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusChange(item.id, 'cancelled')}
                            className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                          >
                            Откажи
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCheck className="h-4 w-4 text-sky-600" />
                    <p className="text-sm font-bold text-gray-900">Обновления</p>
                  </div>
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700">
                    {updateCount}
                  </span>
                </div>

                {upcomingLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                  </div>
                ) : !updateItems.length ? (
                  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-400">
                    Няма нови клиентски действия.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {updateItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-3xl border p-3 shadow-sm transition-all ${selectedRecordId === item.id ? 'border-[var(--color-primary)] bg-white ring-2 ring-[var(--color-primary)]/10' : 'border-gray-100 bg-white/90'}`}
                      >
                        <button
                          type="button"
                          onClick={() => focusRecord(item.id, item.start_at, 'calendar')}
                          className="w-full text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${item.toneClass}`}>
                                {item.label}
                              </div>
                              <p className="mt-2 truncate text-sm font-bold text-gray-900">{item.client_name}</p>
                              <p className="mt-1 text-xs text-gray-500">{item.summary}</p>
                            </div>
                            <div className="text-right text-xs text-gray-400">
                              <p className="font-semibold text-gray-700">{format(new Date(item.start_at), 'HH:mm')}</p>
                              <p>{format(new Date(item.start_at), 'd MMM', { locale: bg })}</p>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOwnerAlertRead(item.id)}
                          className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Маркирай като видяно
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </ResponsiveSheet>

        <section className="block w-full min-w-0">
          <div className="glass-panel rounded-[32px] border border-white/60 p-4 shadow-xl shadow-black/5 sm:p-5">
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-5">
	              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	                <div>
	                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Календар</p>
	                  <h3 className="mt-1 text-xl font-black text-gray-900">
	                    {calendarTitle}
                  </h3>
                  <p className="mt-1 text-sm capitalize text-gray-500">
                    {calendarSubtitle}
                  </p>
                </div>

	                <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowInboxSheet(true)}
                      className="hidden xl:inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2"
                    >
                      <ClipboardList className="h-4 w-4" />
                      Заявки
                      {(attentionCount + updateCount) > 0 && (
                        <span className="ml-1 inline-flex h-5 items-center justify-center rounded-full bg-rose-100 px-2 text-xs font-bold text-rose-600">
                          {attentionCount + updateCount}
                        </span>
                      )}
                    </button>

	                  <div className="hidden items-center rounded-2xl border border-gray-200 bg-white p-1 lg:flex">
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
	                      Грид
	                    </button>
	                    <button
	                      type="button"
	                      onClick={() => setCalendarView('list')}
	                      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
	                        calendarView === 'list'
	                          ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/20'
	                          : 'text-gray-600'
	                      }`}
	                    >
	                      <Rows3 className="h-4 w-4" />
	                      Списък
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
	                  <button
	                    onClick={() => setCurrentDate(subDays(currentDate, calendarView === 'week' ? 7 : 1))}
	                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
	                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentDate(addDays(currentDate, calendarView === 'week' ? 7 : 1))}
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
                      setProposalTarget(null);
                      setShowBookingModal(true);
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 transition-opacity hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" />
                    Нова резервация
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-gray-900">{appointmentsInView.length}</div>
                  <div className="mt-1 text-xs text-gray-500">{calendarView === 'week' ? 'Записи в седмицата' : 'Записи за деня'}</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-emerald-700">{confirmedInView}</div>
                  <div className="mt-1 text-xs text-gray-500">Запазени часове</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-amber-700">{pendingInView}</div>
                  <div className="mt-1 text-xs text-gray-500">Нови заявки</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-[var(--color-primary)]">{formatEuroAmount(totalRevenue)}</div>
                  <div className="mt-1 text-xs text-gray-500">Потвърден оборот</div>
                </div>
              </div>
            </div>

	            <div className="mt-5">
	              {isLoading ? (
	                <div className="flex justify-center py-20">
	                  <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
	                </div>
	              ) : (
	                <div className="space-y-4">
	                  <div className="flex flex-col gap-3 rounded-[28px] border border-white/70 bg-white/80 p-4 shadow-sm">
	                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
	                      <div>
		                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
		                          {calendarView === 'week' ? 'Week board' : 'Day board'}
		                        </p>
		                        <h4 className="mt-1 text-base font-black text-gray-900">
		                          {calendarView === 'week' ? 'Седмичен преглед' : 'Дневен график'}
		                        </h4>
		                        <p className="mt-1 text-sm text-gray-500">
		                          {calendarView === 'week'
		                            ? 'Седмичен изглед по дни и специалисти.'
		                            : 'Разпределение по специалисти и часове.'}
		                        </p>
	                      </div>
	                      <div className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
	                        <SlidersHorizontal className="h-4 w-4" />
	                        {staffFilter === 'all' ? 'Показани са всички специалисти' : `Филтър: ${visibleStaffColumns[0]?.name ?? 'специалист'}`}
	                      </div>
	                    </div>

	                    <div className="overflow-x-auto pb-1">
	                      <div className="flex min-w-max gap-2">
	                        <button
	                          type="button"
	                          onClick={() => setStaffFilter('all')}
	                          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition-colors ${
	                            staffFilter === 'all'
	                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
	                              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
	                          }`}
	                        >
	                          <Users className="h-4 w-4" />
	                          Всички
	                        </button>
	                        {calendarStaff.map((staffMember) => {
	                          const isActive = staffFilter === staffMember.id;
	                          return (
	                            <button
	                              key={staffMember.id}
	                              type="button"
	                              onClick={() => setStaffFilter(staffMember.id)}
	                              className={`inline-flex items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors ${
	                                isActive
	                                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
	                                  : 'border-gray-200 bg-white hover:bg-gray-50'
	                              }`}
	                            >
	                              <span
	                                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-white"
	                                style={{ backgroundColor: staffMember.color || 'var(--color-primary)' }}
	                              >
	                                {getInitials(staffMember.name)}
	                              </span>
	                              <span className="min-w-0">
	                                <span className="block truncate text-sm font-semibold text-gray-900">{staffMember.name}</span>
	                                <span className="block text-xs text-gray-500">{staffMember.appointments.length} часа</span>
	                              </span>
	                            </button>
	                          );
	                        })}
	                      </div>
	                    </div>

                      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 p-3 lg:flex-row lg:items-center lg:justify-between">
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
                            onClick={() => setShowBlockEditor(true)}
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
                      ) : calendarView === 'week' ? (
		                    <div className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/90 shadow-sm">
		                      <div className="grid min-w-[1180px] grid-cols-7 gap-0">
		                        {weekDays.map((day) => {
                              const dayItems = sortByStartAt(
                                appointments.filter(
                                  (appointment) =>
                                    isSameDay(new Date(appointment.start_at), day) &&
                                    (staffFilter === 'all' || appointment.staff_id === staffFilter) &&
                                    matchesCalendarStatusFilter(appointment, statusFilter),
                                ),
                              );
                              const exceptionCount = (calendarBoard?.exceptions ?? []).filter(
                                (exception) =>
                                  isSameDay(new Date(exception.start_at), day) &&
                                  (staffFilter === 'all' || exception.staff_id === staffFilter),
                              ).length;

		                          return (
		                            <div
		                              key={day.toISOString()}
		                              className={`min-h-[640px] border-r border-gray-100 px-3 py-4 last:border-r-0 ${
		                                isToday(day) ? 'bg-[var(--color-primary)]/3' : 'bg-white/70'
		                              }`}
		                            >
		                              <div className="border-b border-gray-100 pb-3">
		                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
		                                  {format(day, 'EEEE', { locale: bg })}
		                                </p>
		                                <div className="mt-1 flex items-center justify-between gap-2">
		                                  <h5 className="text-lg font-black text-gray-900">{format(day, 'd MMM', { locale: bg })}</h5>
		                                  {isToday(day) && (
		                                    <span className="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-[11px] font-bold text-[var(--color-primary)]">
		                                      Днес
		                                    </span>
		                                  )}
		                                </div>
		                                <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
		                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                                        {dayItems.filter((item) => item.status === 'confirmed').length} запазени
                                      </span>
		                                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                                        {dayItems.filter((item) => item.status === 'pending').length} заявки
                                      </span>
		                                  {exceptionCount > 0 && (
		                                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                          {exceptionCount} блока
                                        </span>
		                                  )}
		                                </div>
		                              </div>

                              <div className="mt-3 space-y-3">
                                {visibleStaffColumns.map((staffMember) => {
                                  const staffItems = dayItems.filter((item) => item.staff_id === staffMember.id);
                                  const staffBlocks = (calendarBoard?.exceptions ?? []).filter(
                                    (exception) => exception.staff_id === staffMember.id && isSameDay(new Date(exception.start_at), day),
                                  );
                                  const isDropTarget =
                                    dropPreview?.staffId === staffMember.id &&
                                    dropPreview?.startAt &&
                                    isSameDay(new Date(dropPreview.startAt), day);

                                  return (
                                    <div
                                      key={`${day.toISOString()}-${staffMember.id}`}
                                      className={`rounded-3xl border p-3 transition-colors ${
                                        isDropTarget
                                          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/6'
                                          : 'border-gray-100 bg-white/90'
                                      }`}
                                      onDragOver={(event) => {
                                        if (!draggedAppointmentId) return;
                                        const source = appointments.find((item) => item.id === draggedAppointmentId);
                                        if (!source) return;
                                        event.preventDefault();
                                        const sourceDate = new Date(source.start_at);
                                        const nextStart = new Date(day);
                                        nextStart.setHours(sourceDate.getHours(), sourceDate.getMinutes(), 0, 0);
                                        setDropPreview({ staffId: staffMember.id, startAt: nextStart.toISOString() });
                                      }}
                                      onDrop={(event) => {
                                        if (!draggedAppointmentId) return;
                                        const source = appointments.find((item) => item.id === draggedAppointmentId);
                                        if (!source) return;
                                        event.preventDefault();
                                        const sourceDate = new Date(source.start_at);
                                        const nextStart = new Date(day);
                                        nextStart.setHours(sourceDate.getHours(), sourceDate.getMinutes(), 0, 0);
                                        handleDropReschedule(draggedAppointmentId, nextStart.toISOString(), staffMember.id);
                                      }}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-black text-white"
                                            style={{ backgroundColor: staffMember.color || 'var(--color-primary)' }}
                                          >
                                            {getInitials(staffMember.name)}
                                          </span>
                                          <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-gray-900">{staffMember.name}</p>
                                            <p className="text-[11px] text-gray-500">{staffItems.length} записа</p>
                                          </div>
                                        </div>
                                        {staffBlocks.length > 0 && (
                                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                            {staffBlocks.length} блока
                                          </span>
                                        )}
                                      </div>

                                      {staffBlocks.length > 0 && showUnavailable && (
                                        <div className="mt-3 flex flex-wrap gap-2">
                                          {staffBlocks.slice(0, 2).map((block) => (
                                            <button
                                              key={block.id}
                                              type="button"
                                              onClick={() => setShowBlockEditor(true)}
                                              className="rounded-2xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600"
                                            >
                                              {format(new Date(block.start_at), 'HH:mm')}–{format(new Date(block.end_at), 'HH:mm')} · {getExceptionTypeLabel(block.type)}
                                            </button>
                                          ))}
                                        </div>
                                      )}

                                      <div className="mt-3 space-y-2">
                                        {!staffItems.length ? (
                                          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">
                                            Пуснете запис тук. Ще запази същия начален час.
                                          </div>
                                        ) : (
                                          staffItems.map((appointment) => {
                                            const statusCfg = getOwnerStatusPresentation(appointment);
                                            const accent = appointment.service_color || appointment.staff_color || 'var(--color-primary)';
                                            const isSelected = appointment.id === selectedRecordId;

                                            return (
                                              <button
                                                key={appointment.id}
                                                type="button"
                                                draggable={!['completed', 'cancelled', 'no_show'].includes(appointment.status)}
                                                onDragStart={() => setDraggedAppointmentId(appointment.id)}
                                                onDragEnd={() => {
                                                  setDraggedAppointmentId(null);
                                                  setDropPreview(null);
                                                }}
                                                onClick={() => focusRecord(appointment.id, appointment.start_at)}
                                                className={`w-full rounded-2xl border p-3 text-left shadow-sm transition-transform hover:scale-[1.01] ${
                                                  isSelected ? 'ring-2 ring-[var(--color-primary)]/25' : ''
                                                }`}
                                                style={{
                                                  borderColor: colorWithAlpha(accent, '55', 'rgba(14, 165, 233, 0.3)'),
                                                  backgroundColor: colorWithAlpha(accent, '18', 'rgba(14, 165, 233, 0.08)'),
                                                }}
                                              >
                                                <div className="flex items-start justify-between gap-2">
                                                  <p className="text-[11px] font-bold text-gray-700">
                                                    {format(new Date(appointment.start_at), 'HH:mm')} - {format(new Date(appointment.end_at), 'HH:mm')}
                                                  </p>
                                                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusCfg.cls}`}>
                                                    {statusCfg.label}
                                                  </span>
                                                </div>
	                                                <p className="mt-2 line-clamp-2 text-sm font-black text-gray-900">{appointment.client_name}</p>
	                                                <p className="mt-1 line-clamp-2 text-xs font-semibold text-gray-700">{appointment.service_name}</p>
	                                                <p className="mt-2 text-[11px] text-gray-500">
	                                                  {formatBulgarianPhoneForDisplay(appointment.client_phone)}
	                                                </p>
                                                  {appointment.status === 'confirmed' && (
                                                    <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${getVisitProgressClass(appointment.visit_progress)}`}>
                                                      {appointment.visit_progress_label}
                                                    </span>
                                                  )}
	                                              </button>
	                                            );
	                                          })
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
		                            </div>
		                          );
		                        })}
		                      </div>
		                    </div>
		                  ) : calendarView === 'grid' ? (
		                    <div className="block">
		                      <div className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/90 shadow-sm">
	                        <div
	                          className="grid min-w-[880px]"
	                          style={{ gridTemplateColumns: `72px repeat(${Math.max(visibleStaffColumns.length, 1)}, minmax(220px, 1fr))` }}
	                        >
	                          <div className="sticky top-0 z-10 border-b border-r border-gray-100 bg-white/95 px-3 py-4 backdrop-blur">
	                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">Час</p>
	                          </div>
	                          {visibleStaffColumns.map((staffMember) => (
	                            <div
	                              key={staffMember.id}
	                              className="sticky top-0 z-10 border-b border-r border-gray-100 bg-white/95 px-4 py-4 backdrop-blur last:border-r-0"
	                            >
	                              <div className="flex items-center gap-3">
	                                <span
	                                  className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white shadow-sm"
	                                  style={{ backgroundColor: staffMember.color || 'var(--color-primary)' }}
	                                >
	                                  {getInitials(staffMember.name)}
	                                </span>
	                                <div className="min-w-0">
	                                  <p className="truncate text-sm font-black text-gray-900">{staffMember.name}</p>
	                                  <p className="text-xs text-gray-500">{staffMember.appointments.length} записа</p>
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

		                          {visibleStaffColumns.map((staffMember) => (
		                            <div
		                              key={staffMember.id}
		                              className="relative border-r border-gray-100 bg-white/70 last:border-r-0"
		                              style={{ height: `${calendarHeight}px` }}
		                            >
		                              {showUnavailable && (() => {
		                                const dayKey = getWorkingDayKey(currentDate);
		                                const schedule = staffMember.working_hours?.[dayKey];
		                                const staffExceptions = visibleExceptions.filter((exception) => exception.staff_id === staffMember.id);
		                                const overlays: Array<{ top: number; height: number; label: string; kind: 'closed' | 'exception' }> = [];

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
		                                  const top = Math.max((getMinuteOffset(exception.start_at, calendarRange.startHour) / 60) * pixelsPerHour, 0);
		                                  const bottom = Math.min((getMinuteOffset(exception.end_at, calendarRange.startHour) / 60) * pixelsPerHour, calendarHeight);
		                                  const height = Math.max(bottom - top, 40);
		                                  overlays.push({
		                                    top,
		                                    height,
		                                    label: exception.note || 'Блокиран интервал',
		                                    kind: 'exception',
		                                  });
		                                }

		                                return overlays.map((overlay, index) => (
		                                  <div
		                                    key={`${staffMember.id}-overlay-${index}`}
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
		                                  </div>
		                                ));
		                              })()}

		                              {halfHourDropSlots.map((slot) => (
		                                <div
		                                  key={`${staffMember.id}-${slot.key}`}
		                                  className={`absolute left-0 right-0 z-[1] transition-colors ${
		                                    dropPreview?.staffId === staffMember.id &&
		                                    dropPreview?.startAt &&
		                                    format(new Date(dropPreview.startAt), 'HH:mm') === slot.label
		                                      ? 'bg-[var(--color-primary)]/8'
		                                      : ''
		                                  }`}
		                                  style={{ top: `${slot.top}px`, height: `${pixelsPerHour / 2}px` }}
		                                  onDragOver={(event) => {
		                                    if (!draggedAppointmentId) return;
		                                    event.preventDefault();
		                                    const [hour, minute] = slot.label.split(':').map(Number);
		                                    const nextStart = new Date(currentDate);
		                                    nextStart.setHours(hour, minute, 0, 0);
		                                    setDropPreview({ staffId: staffMember.id, startAt: nextStart.toISOString() });
		                                  }}
		                                  onDrop={(event) => {
		                                    event.preventDefault();
		                                    if (!draggedAppointmentId) return;
		                                    const [hour, minute] = slot.label.split(':').map(Number);
		                                    const nextStart = new Date(currentDate);
		                                    nextStart.setHours(hour, minute, 0, 0);
		                                    handleDropReschedule(draggedAppointmentId, nextStart.toISOString(), staffMember.id);
		                                  }}
		                                />
		                              ))}

		                              {hourSlots.slice(0, -1).map((hour) => {
		                                const top = (hour - calendarRange.startHour) * pixelsPerHour;
		                                return (
	                                  <div
	                                    key={hour}
	                                    className="absolute left-0 right-0 border-t border-gray-100"
	                                    style={{ top: `${top}px` }}
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

		                              {staffMember.appointments.map((appointment) => {
		                                const startOffset = getMinuteOffset(appointment.start_at, calendarRange.startHour);
		                                const endOffset = getMinuteOffset(appointment.end_at, calendarRange.startHour);
	                                const top = (startOffset / 60) * pixelsPerHour + 4;
	                                const height = Math.max(((endOffset - startOffset) / 60) * pixelsPerHour - 8, 56);
	                                const statusCfg = getOwnerStatusPresentation(appointment);
	                                const isSelected = selectedRecordId === appointment.id;
	                                const accent = appointment.service_color || appointment.staff_color || 'var(--color-primary)';
	                                const soft = colorWithAlpha(accent, '22', 'rgba(14, 165, 233, 0.12)');
	                                const startTime = format(new Date(appointment.start_at), 'HH:mm');
	                                const endTime = format(new Date(appointment.end_at), 'HH:mm');

	                                return (
		                                  <button
		                                    key={appointment.id}
		                                    type="button"
		                                    draggable={!['completed', 'cancelled', 'no_show'].includes(appointment.status)}
		                                    onDragStart={() => setDraggedAppointmentId(appointment.id)}
		                                    onDragEnd={() => {
		                                      setDraggedAppointmentId(null);
		                                      setDropPreview(null);
		                                    }}
		                                    onClick={() => focusRecord(appointment.id, appointment.start_at)}
		                                    className={`absolute left-2 right-2 z-[2] rounded-2xl border p-3 text-left shadow-sm transition-transform hover:scale-[1.01] ${
		                                      isSelected ? 'ring-2 ring-[var(--color-primary)]/25' : ''
		                                    }`}
	                                    style={{
	                                      top: `${top}px`,
	                                      height: `${height}px`,
	                                      borderColor: colorWithAlpha(accent, '55', 'rgba(14, 165, 233, 0.3)'),
	                                      backgroundColor: soft,
	                                      boxShadow: isSelected ? '0 0 0 1px rgba(99, 102, 241, 0.2)' : undefined,
	                                    }}
	                                  >
	                                    <div className="flex items-start justify-between gap-2">
	                                      <p className="text-[11px] font-bold text-gray-700">
	                                        {startTime} - {endTime}
	                                      </p>
	                                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusCfg.cls}`}>
	                                        {statusCfg.label}
	                                      </span>
	                                    </div>
	                                    <p className="mt-2 line-clamp-2 text-sm font-black text-gray-900">{appointment.client_name}</p>
	                                    <p className="mt-1 line-clamp-2 text-xs font-semibold text-gray-700">{appointment.service_name}</p>
		                                    <p className="mt-2 text-[11px] text-gray-500">{formatBulgarianPhoneForDisplay(appointment.client_phone)}</p>
                                      {appointment.status === 'confirmed' && (
                                        <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${getVisitProgressClass(appointment.visit_progress)}`}>
                                          {appointment.visit_progress_label}
                                        </span>
                                      )}
		                                  </button>
		                                );
		                              })}
	                            </div>
	                          ))}
	                        </div>
	                      </div>
	                    </div>
	                  ) : null}

		                  <div className={`${calendarView === 'list' ? 'space-y-4' : 'hidden'}`}>
	                    {filteredDayAppointments.map((appointment) => {
	                      const startTime = format(new Date(appointment.start_at), 'HH:mm');
	                      const endTime = format(new Date(appointment.end_at), 'HH:mm');
	                      const statusCfg = getOwnerStatusPresentation(appointment);
	                      const isSelected = selectedRecordId === appointment.id;

	                      return (
	                        <div
	                          key={appointment.id}
	                          className={`group flex w-full gap-4 rounded-[28px] border p-4 text-left shadow-sm transition-all sm:p-5 ${
	                            isSelected
	                              ? 'border-[var(--color-primary)] bg-white ring-2 ring-[var(--color-primary)]/10'
	                              : 'border-gray-100 bg-white/90 hover:border-[var(--color-primary)]/25 hover:bg-white'
	                          }`}
	                        >
	                          <button
	                            type="button"
	                            onClick={() => focusRecord(appointment.id, appointment.start_at)}
	                            className="flex w-full gap-4 text-left"
	                          >
	                            <div className="flex w-20 flex-shrink-0 flex-col items-center gap-2 rounded-[24px] border border-gray-100 bg-gray-50/80 px-3 py-4">
	                              <span className="text-base font-black text-gray-900">{startTime}</span>
	                              <div
	                                className="h-full min-h-[36px] w-1.5 rounded-full"
	                                style={{ backgroundColor: appointment.service_color || appointment.staff_color || 'var(--color-primary)' }}
	                              />
	                              <span className="text-xs font-semibold text-gray-400">{endTime}</span>
	                            </div>

	                            <div className="min-w-0 flex-1">
	                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
	                                <div className="min-w-0">
	                                  <div className="flex flex-wrap items-center gap-2">
	                                    <p className="truncate text-lg font-black text-gray-900">{appointment.client_name}</p>
	                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusCfg.cls}`}>
	                                      {statusCfg.label}
	                                    </span>
	                                  </div>
	                                  <p className="mt-1 text-sm font-semibold text-gray-700">{appointment.service_name}</p>
		                                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500">
	                                    <span className="flex items-center gap-1">
	                                      <User className="w-3.5 h-3.5" />
	                                      {appointment.staff_name}
	                                    </span>
	                                    <span className="flex items-center gap-1">
	                                      <Phone className="w-3.5 h-3.5" />
	                                      {formatBulgarianPhoneForDisplay(appointment.client_phone)}
	                                    </span>
	                                    <span className="flex items-center gap-1">
	                                      <Clock className="w-3.5 h-3.5" />
	                                      {startTime} – {endTime}
	                                    </span>
		                                    {appointment.price != null && (
		                                      <span className="font-semibold text-gray-700">{appointment.price} €</span>
		                                    )}
                                        {appointment.status === 'confirmed' && (
                                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${getVisitProgressClass(appointment.visit_progress)}`}>
                                            {appointment.visit_progress_label}
                                          </span>
                                        )}
		                                  </div>
	                                </div>

	                                <div className="max-w-sm text-xs text-gray-500 lg:text-right">
	                                  <p>{appointment.internal_notes || 'Няма вътрешна бележка за този запис.'}</p>
	                                </div>
	                              </div>
	                            </div>
	                          </button>

	                          <div className="mt-4">{renderPrimaryActions(appointment)}</div>
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

      <ResponsiveSheet
        side="right"
        isOpen={!!selectedRecordId && (!!selectedAppointment || !!selectedInboxItem)}
        onClose={() => {
          setSelectedRecordId(null);
          setShowMobileDetails(false);
        }}
        title="Детайли"
      >
        <div className="flex flex-col gap-3">
          <div className="mb-2">
            <h3 className="mt-1 text-xl font-black text-gray-900">
              {detailedAppointment?.client_name || selectedInboxItem?.client_name}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {detailedAppointment
                ? `${detailedAppointment.service_name} · ${detailedAppointment.staff_name}`
                : selectedInboxItem?.summary}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Дата и час</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">
                {formatAppointmentDay(detailedAppointment?.start_at || selectedInboxItem?.start_at || "")}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Контакт</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">
                {formatBulgarianPhoneForDisplay(
                  detailedAppointment?.client_phone || selectedInboxItem?.client_phone || "",
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
                    <p className="mt-2 text-sm font-semibold text-gray-900">{detailedAppointment.price} €</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {detailedAppointment && <div>{renderPrimaryActions(detailedAppointment)}</div>}
          {detailedAppointment && renderVisitProgressControls(detailedAppointment)}

          {selectedInboxItem?.bucket === 'updates' && (
            <button
              type="button"
              onClick={() => handleOwnerAlertRead(selectedInboxItem.id)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              Маркирай като видяно
            </button>
          )}

          <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Известия</p>
            <div className="mt-3 space-y-2">
              {selectedContext?.notifications?.length ? (
                selectedContext.notifications.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-white bg-white px-3 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{getNotificationTypeLabel(entry.type)}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {getChannelLabel(entry.channel)} · {entry.sent_at ? formatAppointmentDay(entry.sent_at) : formatAppointmentDay(entry.created_at)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${getNotificationStatusClass(entry.status)}`}>
                        {getNotificationStatusLabel(entry.status)}
                      </span>
                    </div>
                    {entry.error_message && (
                      <p className="mt-2 text-xs text-rose-600">{entry.error_message}</p>
                    )}
                    {entry.status === 'failed' && detailedAppointment && (
                      <button
                        type="button"
                        onClick={() =>
                          retryNotificationMutation.mutate({
                            appointmentId: detailedAppointment.id,
                            type: entry.type,
                          })
                        }
                        className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">Няма лог за известия към този запис.</p>
              )}
            </div>
          </div>
        </div>
      </ResponsiveSheet>

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
                  onClick={() => setShowBlockEditor(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-5 p-5 lg:grid-cols-[360px_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div className="rounded-[28px] border border-gray-100 bg-gray-50 p-4">
                    <h4 className="text-sm font-black text-gray-900">Нов блок</h4>
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
                        {createBlockMutation.isPending ? 'Записване...' : 'Запази блока'}
                      </button>
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
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AdminBookingModal
        open={showBookingModal}
        defaultDate={dateKey}
        proposalTarget={proposalTarget}
        onClose={() => {
          setShowBookingModal(false);
          setProposalTarget(null);
        }}
        onCreated={handleBookingCreated}
      />
    </div>
  );
}

function AdminBookingModal({
  open,
  defaultDate,
  proposalTarget,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultDate: string;
  proposalTarget: Appointment | null;
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
  const [mode, setMode] = useState<'direct' | 'ask-client'>('direct');

  const lookupValue = lookupField === 'phone' ? clientPhone : clientName;
  const deferredLookupValue = useDeferredValue(lookupValue.trim());

  const resetForm = () => {
    setServiceId('');
    setStaffId('');
    setSelectedDate(defaultDate);
    setSelectedSlot('');
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setNotes('');
    setLookupField('name');
    setShowSuggestions(false);
    setMode('direct');
  };

  useEffect(() => {
    if (open) {
      setSelectedDate(proposalTarget ? format(new Date(proposalTarget.start_at), 'yyyy-MM-dd') : defaultDate);
      setSelectedSlot('');
      if (proposalTarget) {
        setServiceId(proposalTarget.service_id);
        setStaffId(proposalTarget.staff_id);
        setClientName(proposalTarget.client_name);
        setClientPhone(formatBulgarianPhoneForDisplay(proposalTarget.client_phone));
        setMode('ask-client');
      }
    }
  }, [defaultDate, open, proposalTarget]);

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
    mutationFn: async (submitMode: 'direct' | 'ask-client') => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();

      if (proposalTarget) {
        return apiClient.post<{ id: string; status: string; startAt: string }>(
          `/appointments/${proposalTarget.id}/proposal`,
          {
            startAt,
            publicBaseUrl: window.location.origin,
          },
        );
      }

      return apiClient.post<{ id: string; status: string; startAt: string }>('/appointments/admin', {
        serviceId,
        staffId,
        startAt,
        clientName: clientName.trim(),
        clientPhone: normalizeBulgarianPhone(clientPhone),
        clientEmail: tenant.collectClientEmail ? clientEmail.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        consentGiven: true,
        askClient: submitMode === 'ask-client',
        publicBaseUrl: window.location.origin,
      });
    },
    onSuccess: (data, submitMode) => {
      toast.success(
        proposalTarget || submitMode === 'ask-client'
          ? 'Предложението е изпратено към клиента.'
          : 'Резервацията е записана директно и е потвърдена.',
      );
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
              <h3 className="text-xl font-black text-gray-900">
                {proposalTarget ? 'Предложи нов час' : 'Нова резервация от админ'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {proposalTarget
                  ? 'Изпращаш контра оферта към клиента. Часът ще бъде потвърден само ако той приеме.'
                  : 'Можеш или да запишеш директно, или да изпратиш предложение към клиента за потвърждение.'}
              </p>
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
                  disabled={Boolean(proposalTarget)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-gray-50 disabled:text-gray-400"
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
                  disabled={!serviceId || Boolean(proposalTarget)}
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

            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              proposalTarget || mode === 'ask-client'
                ? 'border-violet-100 bg-violet-50 text-violet-900'
                : 'border-emerald-100 bg-emerald-50 text-emerald-900'
            }`}>
              {proposalTarget || mode === 'ask-client'
                ? 'Ще изпратиш предложение към клиента. Часът няма да се счита за окончателно приет, докато клиентът не го потвърди.'
                : 'Резервацията ще се създаде директно като потвърдена. Ако клиентът вече съществува в базата, изборът от предложенията попълва автоматично име и телефон.'}
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
                onClick={() => {
                  setMode('direct');
                  createMutation.mutate('direct');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {proposalTarget ? 'Изпрати предложението' : 'Запиши директно'}
              </button>
              {!proposalTarget && (
                <button
                  type="button"
                  disabled={!canSubmit || createMutation.isPending}
                  onClick={() => {
                    setMode('ask-client');
                    createMutation.mutate('ask-client');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Питай клиента
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
