'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays, isToday } from 'date-fns';
import { bg } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  CalendarDays,
  CheckCheck,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCcw,
  TriangleAlert,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
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
  client_name: string;
  client_phone: string;
  service_name: string;
  staff_name: string;
  status: string;
  owner_alert_state?: string;
  proposal_decision?: string;
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
  };
  notifications: NotificationLogEntry[];
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Заявка', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  proposal_pending: { label: 'Предложен час', cls: 'bg-violet-100 text-violet-800 border-violet-200' },
  confirmed: { label: 'Запазен час', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  completed: { label: 'Приключен', cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  cancelled: { label: 'Отменен', cls: 'bg-rose-100 text-rose-800 border-rose-200' },
  no_show: { label: 'Неявил се', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
};

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

function formatAppointmentDay(value: string) {
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
    booking_confirmed: 'Потвърден час',
    booking_cancelled_client: 'Клиентска отмяна',
    booking_cancelled_business: 'Отказ от салона',
    booking_proposal: 'Предложен нов час',
    reminder_24h: 'Напомняне 24 ч.',
    reminder_2h: 'Напомняне 2 ч.',
    status_changed: 'Промяна на статус',
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

export default function AdminCalendarPage() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [proposalTarget, setProposalTarget] = useState<Appointment | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [mobileWorkspace, setMobileWorkspace] = useState<'calendar' | 'inbox'>('calendar');
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const { data: appointments, isLoading, refetch } = useQuery({
    queryKey: ['appointments', dateKey],
    queryFn: () => apiClient.get<Appointment[]>('/appointments', { date: dateKey }),
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

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, { status });
      refetch();
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
    } catch {
      toast.error('Грешка при смяна на статуса');
    }
  };

  const handleOwnerAlertRead = async (id: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/owner-alert-read`, {});
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
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
  };

  const dayAppointments = useMemo(() => sortByStartAt(appointments), [appointments]);
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

  const totalRevenue = useMemo(
    () =>
      dayAppointments.reduce((sum, appointment) => {
        if (!['confirmed', 'completed'].includes(appointment.status)) return sum;
        return sum + (appointment.price ?? 0);
      }, 0),
    [dayAppointments],
  );

  const attentionCount = actionItems.length;
  const updateCount = updateItems.length;

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

  const goToday = () => setCurrentDate(new Date());

  const focusRecord = (id: string, startAt: string, workspace: 'calendar' | 'inbox' = 'calendar') => {
    setSelectedRecordId(id);
    setCurrentDate(new Date(startAt));
    setMobileWorkspace(workspace);
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

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-[28px] border border-white/60 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-xs font-semibold text-gray-500">
              <ClipboardList className="h-3.5 w-3.5" />
              Action Inbox + календар за деня
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900 sm:text-xl">Оперативен изглед за днешната работа</h2>
              <p className="mt-1 max-w-2xl text-sm text-gray-500">
                Календарът остава в центъра. Заявките и клиентските действия са отделени в inbox, вместо да бутат целия екран надолу.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[520px]">
            <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
              <div className="text-2xl font-black text-gray-900">{attentionCount}</div>
              <div className="mt-1 text-xs text-gray-500">Изискват действие</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
              <div className="text-2xl font-black text-sky-700">{updateCount}</div>
              <div className="mt-1 text-xs text-gray-500">Обновления</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
              <div className="text-2xl font-black text-emerald-700">{dayAppointments.length}</div>
              <div className="mt-1 text-xs text-gray-500">Часа за деня</div>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
              <div className="text-2xl font-black text-[var(--color-primary)]">{totalRevenue} €</div>
              <div className="mt-1 text-xs text-gray-500">Очакван оборот</div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-1 rounded-3xl border border-white/70 bg-white/80 px-2 py-2 shadow-lg shadow-black/5 backdrop-blur xl:hidden">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMobileWorkspace('calendar')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
              mobileWorkspace === 'calendar'
                ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                : 'bg-white text-gray-600'
            }`}
          >
            Календар
          </button>
          <button
            type="button"
            onClick={() => setMobileWorkspace('inbox')}
            className={`rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
              mobileWorkspace === 'inbox'
                ? 'bg-[var(--color-primary)] text-white shadow-lg shadow-[var(--color-primary)]/25'
                : 'bg-white text-gray-600'
            }`}
          >
            Действия ({attentionCount + updateCount})
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_340px]">
        <aside
          className={`min-h-0 ${mobileWorkspace === 'inbox' ? 'block' : 'hidden'} xl:block`}
        >
          <div className="glass-panel rounded-[28px] border border-white/60 p-4 shadow-xl shadow-black/5 xl:sticky xl:top-0">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Action inbox</p>
                <h3 className="mt-1 text-lg font-black text-gray-900">Какво чака решение</h3>
                <p className="mt-1 text-sm text-gray-500">Всичко, което иска внимание, е тук. Календарът остава отделно.</p>
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

            <div className="mt-4 space-y-5">
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

                        <div className="mt-3 flex flex-wrap gap-2">
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
                            Предложи нов час
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
        </aside>

        <section className={`${mobileWorkspace === 'calendar' ? 'block' : 'hidden'} xl:block`}>
          <div className="glass-panel rounded-[32px] border border-white/60 p-4 shadow-xl shadow-black/5 sm:p-5">
            <div className="flex flex-col gap-4 border-b border-gray-100 pb-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Календар</p>
                  <h3 className="mt-1 text-xl font-black text-gray-900">
                    {format(currentDate, "d MMMM yyyy 'г.'", { locale: bg })}
                  </h3>
                  <p className="mt-1 text-sm capitalize text-gray-500">
                    {format(currentDate, 'EEEE', { locale: bg })}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setCurrentDate(subDays(currentDate, 1))}
                    className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentDate(addDays(currentDate, 1))}
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
                  <div className="text-xl font-black text-gray-900">{dayAppointments.length}</div>
                  <div className="mt-1 text-xs text-gray-500">Всички записи</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-emerald-700">
                    {dayAppointments.filter((appointment) => appointment.status === 'confirmed').length}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Запазени часове</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-amber-700">
                    {dayAppointments.filter((appointment) => appointment.status === 'pending').length}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">Нови заявки</div>
                </div>
                <div className="rounded-2xl border border-white/70 bg-white/90 px-4 py-3 shadow-sm">
                  <div className="text-xl font-black text-[var(--color-primary)]">{totalRevenue} €</div>
                  <div className="mt-1 text-xs text-gray-500">Потвърден оборот</div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              {isLoading ? (
                <div className="flex justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
                </div>
              ) : !dayAppointments.length ? (
                <div className="rounded-[28px] border border-dashed border-gray-200 bg-white/80 px-6 py-16 text-center">
                  <p className="text-lg font-semibold text-gray-400">Няма записани часове за този ден</p>
                  <p className="mt-2 text-sm text-gray-300">Можете да изберете друга дата или да добавите ръчна резервация.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {dayAppointments.map((appointment) => {
                    const startTime = format(new Date(appointment.start_at), 'HH:mm');
                    const endTime = format(new Date(appointment.end_at), 'HH:mm');
                    const statusCfg = STATUS_CONFIG[appointment.status] ?? STATUS_CONFIG.pending;
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
                          onClick={() => setSelectedRecordId(appointment.id)}
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
              )}
            </div>
          </div>

          <div className="mt-5 xl:hidden">
            <div className="glass-panel rounded-[28px] border border-white/60 p-4 shadow-xl shadow-black/5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Детайли</p>
              {selectedAppointment || selectedInboxItem ? (
                <div className="mt-3 space-y-4">
                  <div>
                    <h3 className="text-lg font-black text-gray-900">
                      {detailedAppointment?.client_name || selectedInboxItem?.client_name}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {detailedAppointment
                        ? `${detailedAppointment.service_name} · ${detailedAppointment.staff_name}`
                        : selectedInboxItem?.summary}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Дата и час</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {formatAppointmentDay(detailedAppointment?.start_at || selectedInboxItem!.start_at)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Контакт</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {formatBulgarianPhoneForDisplay(
                          detailedAppointment?.client_phone || selectedInboxItem!.client_phone,
                        )}
                      </p>
                    </div>
                  </div>

                  {detailedAppointment && (
                    <div>{renderPrimaryActions(detailedAppointment)}</div>
                  )}

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
              ) : (
                <p className="mt-3 text-sm text-gray-400">Изберете заявка или час, за да видите детайли.</p>
              )}
            </div>
          </div>
        </section>

        <aside className="hidden xl:block">
          <div className="glass-panel rounded-[28px] border border-white/60 p-5 shadow-xl shadow-black/5 xl:sticky xl:top-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">Детайлен панел</p>

            {selectedAppointment || selectedInboxItem ? (
              <div className="mt-4 space-y-5">
                <div>
                  <div className="flex items-center gap-2">
                    {selectedInboxItem && (
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${selectedInboxItem.toneClass}`}>
                        {selectedInboxItem.detailLabel}
                      </span>
                    )}
                    {detailedAppointment && (
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          (STATUS_CONFIG[detailedAppointment?.status || 'pending'] ?? STATUS_CONFIG.pending).cls
                        }`}
                      >
                        {(STATUS_CONFIG[detailedAppointment?.status || 'pending'] ?? STATUS_CONFIG.pending).label}
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

                <div className="grid gap-3">
                  <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Дата и слот</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {formatAppointmentDay(detailedAppointment?.start_at || selectedInboxItem!.start_at)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Телефон</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {formatBulgarianPhoneForDisplay(
                        detailedAppointment?.client_phone || selectedInboxItem!.client_phone,
                      )}
                    </p>
                  </div>
                  {selectedContext?.appointment && (
                    <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Име в клиентската база</p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
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
                  <div className="rounded-2xl border border-gray-100 bg-white/80 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Следваща стъпка</p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {selectedInboxItem?.bucket === 'actions'
                        ? 'Вземете решение оттук или директно от Telegram.'
                        : selectedInboxItem?.bucket === 'updates'
                          ? 'Прегледайте обновлението и маркирайте като видяно.'
                          : detailedAppointment?.status === 'confirmed'
                            ? 'Часът е активен. Можете да го приключите, маркирате като no-show или отмените.'
                            : 'Прегледайте детайлите на записа.'}
                    </p>
                  </div>
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
                </div>

                {detailedAppointment && <div>{renderPrimaryActions(detailedAppointment)}</div>}

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
                              <p className="text-sm font-semibold text-gray-900">
                                {getNotificationTypeLabel(entry.type)}
                              </p>
                              <p className="mt-1 text-xs text-gray-500">
                                {getChannelLabel(entry.channel)} · {entry.sent_at ? formatAppointmentDay(entry.sent_at) : formatAppointmentDay(entry.created_at)}
                              </p>
                            </div>
                            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${getNotificationStatusClass(entry.status)}`}>
                              {getNotificationStatusLabel(entry.status)}
                            </span>
                          </div>
                          {entry.error_message && (
                            <p className="mt-2 text-xs text-rose-600">{entry.error_message}</p>
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
            ) : (
              <div className="mt-4 rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-400">
                Изберете заявка, клиентско действие или запис от календара.
              </div>
            )}
          </div>
        </aside>
      </div>

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
