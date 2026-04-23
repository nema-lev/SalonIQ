'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
  subDays,
} from 'date-fns';
import { bg } from 'date-fns/locale';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  GripVertical,
  ListTodo,
  Loader2,
  Phone,
  Plus,
  UserRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { formatBulgarianPhoneForDisplay, normalizeBulgarianPhone } from '@/lib/phone';
import { AdminBookingModal } from './admin-booking-modal';
import { AppointmentMoveModal } from './appointment-move-modal';
import {
  CALENDAR_SLOT_MINUTES,
  type Appointment,
  type AppointmentContextResponse,
  type CalendarBoardResponse,
  type CalendarBoardStaff,
  type Service,
  type Slot,
  type StaffException,
  type WaitlistEntry,
  buildAppointmentLanes,
  buildCalendarGridMetrics,
  buildCalendarRange,
  colorWithAlpha,
  formatAppointmentDay,
  formatCalendarLabel,
  formatTimeLabel,
  getCalendarOwnerState,
  getEventDurationMinutes,
  getEventLayoutMetrics,
  getMinuteOffset,
  getRequestWindowLabel,
  getStatusTone,
  getWaitlistStatusPresentation,
  getWorkingDayKey,
  isCancelledCalendarItem,
  isRequestOwnerState,
  overlapsRange,
  sortByStartAt,
  timeLabelToMinutes,
} from './calendar-model';

type ViewMode = 'day' | 'week';

type DetailState =
  | { type: 'appointment'; id: string }
  | { type: 'request'; id: string }
  | null;

type DropPreview = {
  staffId: string;
  startAt: string;
} | null;

type ColumnRegistryEntry = {
  element: HTMLDivElement | null;
  staffId: string;
  day: Date;
  rangeStartHour: number;
  pixelsPerHour: number;
};

type DragState =
  | {
      kind: 'appointment';
      appointment: Appointment;
      moved: boolean;
      pointerId: number;
      startX: number;
      startY: number;
    }
  | {
      kind: 'request';
      request: WaitlistEntry;
      moved: boolean;
      pointerId: number;
      startX: number;
      startY: number;
    };

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    const normalizedMessage =
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.find((entry): entry is string => typeof entry === 'string')
          : null;

    if (normalizedMessage) {
      return normalizedMessage;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function buildDayHeaderLabel(currentDate: Date, view: ViewMode) {
  if (view === 'day') {
    return format(currentDate, "d MMMM yyyy 'г.'", { locale: bg });
  }

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  return `${format(weekStart, 'd MMM', { locale: bg })} - ${format(weekEnd, "d MMM yyyy", { locale: bg })}`;
}

function getSlotPreviewLabel(preview: DropPreview, staffList: CalendarBoardStaff[]) {
  if (!preview) return null;

  const staffName = staffList.find((staff) => staff.id === preview.staffId)?.name || 'Специалист';
  return `${format(new Date(preview.startAt), "EEE d MMM '·' HH:mm", { locale: bg })} · ${staffName}`;
}

function buildExceptionBlocks(
  schedule: CalendarBoardStaff['working_hours'][string] | undefined,
  exceptions: StaffException[],
  day: Date,
  calendarHeight: number,
  rangeStartHour: number,
  pixelsPerHour: number,
) {
  const overlays: Array<{
    top: number;
    height: number;
    label: string;
    tone: 'quiet' | 'blocked';
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
      top,
      height: Math.max(bottom - top, 38),
      label: exception.note?.trim() || 'Блокирано време',
      tone: 'blocked',
    });
  }

  return overlays;
}

function DetailDrawer({
  detail,
  appointment,
  appointmentContext,
  request,
  requestDuration,
  onClose,
  onConfirm,
  onCancel,
  onMove,
  onCall,
  onFirstAvailable,
  onArchiveRequest,
  firstAvailableLoading,
}: {
  detail: DetailState;
  appointment: Appointment | null;
  appointmentContext: AppointmentContextResponse | undefined;
  request: WaitlistEntry | null;
  requestDuration: number;
  onClose: () => void;
  onConfirm: (appointmentId: string) => void;
  onCancel: (appointmentId: string) => void;
  onMove: (appointment: Appointment) => void;
  onCall: (phone: string) => void;
  onFirstAvailable: (request: WaitlistEntry) => void;
  onArchiveRequest: (request: WaitlistEntry) => void;
  firstAvailableLoading: boolean;
}) {
  if (!detail) return null;

  const isAppointment = detail.type === 'appointment' && appointment;
  const tone = isAppointment && appointment ? getStatusTone(appointment) : null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/30 backdrop-blur-[1px]">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div className="absolute bottom-0 right-0 top-0 z-[71] w-full max-w-[380px] border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {isAppointment ? 'Детайли за час' : 'Pending request'}
              </p>
              <h3 className="mt-2 text-xl font-black text-slate-900">
                {isAppointment ? appointment?.client_name : request?.client_name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {isAppointment ? appointment?.service_name : request?.service_name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {isAppointment && appointment ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone?.chip ?? ''}`}>
                      {appointment.owner_view_label || tone?.label}
                    </span>
                    <span className="text-sm font-semibold text-slate-500">
                      {formatAppointmentDay(appointment.start_at)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Специалист</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{appointment.staff_name}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Телефон</p>
                      <button
                        type="button"
                        onClick={() => onCall(appointment.client_phone)}
                        className="mt-1 text-left text-sm font-semibold text-slate-900 hover:text-[var(--color-primary)]"
                      >
                        {formatBulgarianPhoneForDisplay(appointment.client_phone)}
                      </button>
                    </div>
                    {appointmentContext?.appointment.client_email && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Email</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {appointmentContext.appointment.client_email}
                        </p>
                      </div>
                    )}
                    {(appointment.internal_notes || appointmentContext?.appointment.cancellation_reason) && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Бележки</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {appointment.internal_notes || appointmentContext?.appointment.cancellation_reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {appointmentContext && (
                  <div className="rounded-[28px] border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">История</p>
                    <div className="mt-3 grid gap-3 text-sm text-slate-600">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        Известия: {appointmentContext.notification_summary.sent} изпратени / {appointmentContext.notification_summary.failed} проблемни
                      </div>
                      {appointmentContext.notifications.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <p className="font-semibold text-slate-900">{entry.type}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.channel} · {entry.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : request ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${getWaitlistStatusPresentation(request.status).cls}`}>
                      {getWaitlistStatusPresentation(request.status).label}
                    </span>
                    <span className="text-sm font-semibold text-slate-500">{requestDuration} мин.</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Телефон</p>
                      <button
                        type="button"
                        onClick={() => onCall(request.client_phone)}
                        className="mt-1 text-left text-sm font-semibold text-slate-900 hover:text-[var(--color-primary)]"
                      >
                        {formatBulgarianPhoneForDisplay(request.client_phone)}
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Предпочитание</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {request.staff_name || 'Без предпочитан специалист'}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{getRequestWindowLabel(request)}</p>
                    </div>
                    {request.notes && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Бележка</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">{request.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 px-5 py-4">
            {isAppointment && appointment ? (
              <div className="grid gap-2">
                {isRequestOwnerState(appointment) && (
                  <button
                    type="button"
                    onClick={() => onConfirm(appointment.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <Check className="h-4 w-4" />
                    Потвърди
                  </button>
                )}
                {!isCancelledCalendarItem(appointment) && (
                  <button
                    type="button"
                    onClick={() => onMove(appointment)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Премести
                  </button>
                )}
                {!isCancelledCalendarItem(appointment) && (
                  <button
                    type="button"
                    onClick={() => onCancel(appointment.id)}
                    className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700"
                  >
                    Откажи / отмени
                  </button>
                )}
              </div>
            ) : request ? (
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => onFirstAvailable(request)}
                  disabled={firstAvailableLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {firstAvailableLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Първи свободен
                </button>
                <button
                  type="button"
                  onClick={() => onArchiveRequest(request)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Архивирай
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminCalendarWorkspace() {
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<ViewMode>('day');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [detail, setDetail] = useState<DetailState>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<{ date: string; staffId: string; preferredSlot: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<Appointment | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview>(null);
  const [firstAvailableId, setFirstAvailableId] = useState<string | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const dragStateRef = useRef<DragState | null>(null);
  const columnRegistryRef = useRef<Record<string, ColumnRegistryEntry>>({});

  const rangeStart = useMemo(
    () => (view === 'week' ? startOfWeek(currentDate, { weekStartsOn: 1 }) : startOfDay(currentDate)),
    [currentDate, view],
  );
  const rangeEndExclusive = useMemo(
    () => (view === 'week' ? addDays(endOfWeek(currentDate, { weekStartsOn: 1 }), 1) : addDays(endOfDay(currentDate), 1)),
    [currentDate, view],
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
  });

  const { data: waitlistEntries = [] } = useQuery({
    queryKey: ['appointments-waitlist'],
    queryFn: () => apiClient.get<WaitlistEntry[]>('/appointments/waitlist'),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: 'always',
  });

  const { data: services = [] } = useQuery({
    queryKey: ['admin-calendar-services'],
    queryFn: () => apiClient.get<Service[]>('/services/admin'),
    staleTime: 60 * 1000,
  });

  const selectedAppointmentId = detail?.type === 'appointment' ? detail.id : null;
  const { data: selectedContext } = useQuery({
    queryKey: ['appointment-context', selectedAppointmentId],
    queryFn: () => apiClient.get<AppointmentContextResponse>(`/appointments/${selectedAppointmentId}/context`),
    enabled: Boolean(selectedAppointmentId),
    staleTime: 15 * 1000,
  });

  const appointments = calendarBoard?.appointments ?? [];
  const staffList = useMemo(
    () => [...(calendarBoard?.staff ?? [])].sort((left, right) => left.name.localeCompare(right.name, 'bg')),
    [calendarBoard?.staff],
  );
  const serviceMap = useMemo(() => new Map(services.map((service) => [service.id, service])), [services]);
  const visibleStaff = useMemo(
    () => (staffFilter === 'all' ? staffList : staffList.filter((staff) => staff.id === staffFilter)),
    [staffFilter, staffList],
  );
  const activeWaitlist = useMemo(
    () => waitlistEntries.filter((entry) => entry.status === 'waiting' || entry.status === 'notified'),
    [waitlistEntries],
  );
  const pendingTimedAppointments = useMemo(
    () =>
      sortByStartAt(
        appointments.filter((appointment) => {
          if (!isRequestOwnerState(appointment)) return false;
          if (view === 'week') {
            return true;
          }
          return isSameDay(new Date(appointment.start_at), currentDate);
        }),
      ),
    [appointments, currentDate, view],
  );
  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        if (staffFilter !== 'all' && appointment.staff_id !== staffFilter) return false;
        if (view === 'day') {
          return isSameDay(new Date(appointment.start_at), currentDate);
        }
        return true;
      }),
    [appointments, currentDate, staffFilter, view],
  );
  const filteredExceptions = useMemo(
    () =>
      (calendarBoard?.exceptions ?? []).filter((exception) => {
        if (staffFilter !== 'all' && exception.staff_id !== staffFilter) return false;
        if (view === 'day') {
          return isSameDay(new Date(exception.start_at), currentDate);
        }
        return true;
      }),
    [calendarBoard?.exceptions, currentDate, staffFilter, view],
  );
  const daysInView = useMemo(
    () =>
      view === 'week'
        ? eachDayOfInterval({
            start: startOfWeek(currentDate, { weekStartsOn: 1 }),
            end: endOfWeek(currentDate, { weekStartsOn: 1 }),
          })
        : [currentDate],
    [currentDate, view],
  );
  const quickDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(currentDate, index - 2)), [currentDate]);

  const calendarRange = useMemo(
    () =>
      buildCalendarRange({
        appointments: filteredAppointments,
        staffMembers: visibleStaff,
        exceptions: filteredExceptions,
        days: daysInView,
      }),
    [daysInView, filteredAppointments, filteredExceptions, visibleStaff],
  );
  const pixelsPerHour = 84;
  const gridMetrics = useMemo(
    () => buildCalendarGridMetrics(calendarRange, pixelsPerHour),
    [calendarRange, pixelsPerHour],
  );

  const selectedAppointment = useMemo(
    () => appointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null,
    [appointments, selectedAppointmentId],
  );
  const selectedRequest = useMemo(
    () => (detail?.type === 'request' ? activeWaitlist.find((entry) => entry.id === detail.id) ?? null : null),
    [activeWaitlist, detail],
  );
  const selectedRequestDuration = selectedRequest ? serviceMap.get(selectedRequest.service_id)?.duration_minutes ?? 60 : 60;

  useEffect(() => {
    if (!staffList.length) return;
    if (staffFilter !== 'all' && !staffList.some((staff) => staff.id === staffFilter)) {
      setStaffFilter('all');
    }
  }, [staffFilter, staffList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateViewport = () => {
      setIsCompactViewport(window.innerWidth < 1100);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const invalidateCalendar = useCallback(async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
    qc.invalidateQueries({ queryKey: ['appointments-waitlist'] });
    qc.invalidateQueries({ queryKey: ['appointment-context'] });
  }, [qc, refetch]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiClient.patch(`/appointments/${id}/status`, { status });
    },
    onSuccess: async () => {
      await invalidateCalendar();
      toast.success('Статусът е обновен.');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Неуспешна промяна на статуса.'));
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, startAt, staffId }: { id: string; startAt: string; staffId: string }) =>
      apiClient.patch(`/appointments/${id}/reschedule`, { startAt, staffId }),
    onSuccess: async () => {
      await invalidateCalendar();
      toast.success('Часът е преместен.');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Неуспешно преместване.'));
    },
  });

  const archiveRequestMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: WaitlistEntry['status'] }) =>
      apiClient.patch(`/appointments/waitlist/${id}/status`, { status }),
    onSuccess: async () => {
      await invalidateCalendar();
      toast.success('Заявката е обновена.');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Неуспешно обновяване на заявката.'));
    },
  });

  const createAppointmentFromRequestMutation = useMutation({
    mutationFn: async ({ request, staffId, startAt }: { request: WaitlistEntry; staffId: string; startAt: string }) => {
      const created = await apiClient.post<{ id: string; status: string; startAt: string }>('/appointments/admin', {
        serviceId: request.service_id,
        staffId,
        startAt,
        clientName: request.client_name,
        clientPhone: normalizeBulgarianPhone(request.client_phone),
        notes: request.notes || undefined,
        consentGiven: true,
        publicBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      });

      await apiClient.patch(`/appointments/waitlist/${request.id}/status`, {
        status: 'booked',
        bookedAppointmentId: created.id,
      });

      return created;
    },
    onSuccess: async (created) => {
      await invalidateCalendar();
      setCurrentDate(new Date(created.startAt));
      setDetail({ type: 'appointment', id: created.id });
      toast.success('Заявката е превърната в записан час.');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Неуспешно създаване на час от заявката.'));
    },
  });

  const resolvePlacement = useCallback(
    ({
      startAt,
      staffId,
      durationMinutes,
      ignoreAppointmentId,
    }: {
      startAt: string;
      staffId: string;
      durationMinutes: number;
      ignoreAppointmentId?: string;
    }) => {
      const nextStart = new Date(startAt);
      const nextEnd = new Date(nextStart.getTime() + durationMinutes * 60 * 1000);
      const staff = staffList.find((entry) => entry.id === staffId);
      if (!staff) {
        return { preview: null as DropPreview, reason: 'Специалистът не е намерен.' };
      }

      const dayKey = getWorkingDayKey(nextStart);
      const schedule = staff.working_hours?.[dayKey];
      if (!schedule?.isOpen) {
        return { preview: null as DropPreview, reason: 'Този ден е извън работното време на специалиста.' };
      }

      const [openHour, openMinute] = schedule.open.split(':').map(Number);
      const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
      const workStart = new Date(nextStart);
      workStart.setHours(openHour, openMinute, 0, 0);
      const workEnd = new Date(nextStart);
      workEnd.setHours(closeHour, closeMinute, 0, 0);

      if (nextStart.getTime() < workStart.getTime() || nextEnd.getTime() > workEnd.getTime()) {
        return { preview: null as DropPreview, reason: 'Изберете слот в работното време на специалиста.' };
      }

      const blocked = (calendarBoard?.exceptions ?? []).some(
        (exception) =>
          exception.staff_id === staffId &&
          overlapsRange(nextStart, nextEnd, exception.start_at, exception.end_at),
      );
      if (blocked) {
        return { preview: null as DropPreview, reason: 'Този интервал е блокиран.' };
      }

      const occupied = appointments.some((appointment) => {
        if (appointment.id === ignoreAppointmentId) return false;
        if (appointment.staff_id !== staffId) return false;
        if (isCancelledCalendarItem(appointment)) return false;
        return overlapsRange(nextStart, nextEnd, appointment.start_at, appointment.end_at);
      });
      if (occupied) {
        return { preview: null as DropPreview, reason: 'Този час вече е зает.' };
      }

      return {
        preview: {
          staffId,
          startAt: nextStart.toISOString(),
        },
        reason: null as string | null,
      };
    },
    [appointments, calendarBoard?.exceptions, staffList],
  );

  const registerColumn = useCallback(
    (key: string, staffId: string, day: Date) => (node: HTMLDivElement | null) => {
      if (!node) {
        delete columnRegistryRef.current[key];
        return;
      }
      columnRegistryRef.current[key] = {
        element: node,
        staffId,
        day,
        rangeStartHour: calendarRange.startHour,
        pixelsPerHour,
      };
    },
    [calendarRange.startHour, pixelsPerHour],
  );

  const resolvePreviewFromPoint = useCallback(
    (dragState: DragState, clientX: number, clientY: number) => {
      for (const entry of Object.values(columnRegistryRef.current)) {
        const rect = entry.element?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) continue;
        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;

        const slotHeight = entry.pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES);
        const slotCount = Math.max(1, Math.floor(rect.height / slotHeight));
        const relativeY = Math.min(Math.max(clientY - rect.top, 0), Math.max(rect.height - 1, 0));
        const slotIndex = Math.min(Math.floor(relativeY / slotHeight), slotCount - 1);
        const totalMinutes = entry.rangeStartHour * 60 + slotIndex * CALENDAR_SLOT_MINUTES;
        const nextStart = new Date(entry.day);
        nextStart.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);

        const durationMinutes =
          dragState.kind === 'appointment'
            ? getEventDurationMinutes(dragState.appointment.start_at, dragState.appointment.end_at)
            : serviceMap.get(dragState.request.service_id)?.duration_minutes ?? 60;

        return resolvePlacement({
          startAt: nextStart.toISOString(),
          staffId: entry.staffId,
          durationMinutes,
          ignoreAppointmentId: dragState.kind === 'appointment' ? dragState.appointment.id : undefined,
        });
      }

      return { preview: null as DropPreview, reason: 'Пуснете върху свободен 15-минутен слот.' };
    },
    [resolvePlacement, serviceMap],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;

      if (!dragState.moved) {
        const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
        if (distance < 6) return;
        dragState.moved = true;
      }

      const candidate = resolvePreviewFromPoint(dragState, event.clientX, event.clientY);
      setDropPreview(candidate.preview);
    };

    const handlePointerUp = async () => {
      const dragState = dragStateRef.current;
      const preview = dropPreview;
      dragStateRef.current = null;
      setDropPreview(null);

      if (!dragState?.moved || !preview) return;

      if (dragState.kind === 'appointment') {
        rescheduleMutation.mutate({
          id: dragState.appointment.id,
          startAt: preview.startAt,
          staffId: preview.staffId,
        });
        return;
      }

      createAppointmentFromRequestMutation.mutate({
        request: dragState.request,
        startAt: preview.startAt,
        staffId: preview.staffId,
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [createAppointmentFromRequestMutation, dropPreview, resolvePreviewFromPoint, rescheduleMutation]);

  const startAppointmentDrag = (event: React.PointerEvent<HTMLButtonElement>, appointment: Appointment) => {
    if (view !== 'day' || isCompactViewport) return;
    dragStateRef.current = {
      kind: 'appointment',
      appointment,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const startRequestDrag = (event: React.PointerEvent<HTMLButtonElement>, request: WaitlistEntry) => {
    if (view !== 'day' || isCompactViewport) return;
    dragStateRef.current = {
      kind: 'request',
      request,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const openBookingAtSlot = (day: Date, staffId: string, preferredSlot = '') => {
    setBookingPrefill({
      date: format(day, 'yyyy-MM-dd'),
      staffId,
      preferredSlot,
    });
    setShowBookingModal(true);
  };

  const handleConfirmAppointment = (appointmentId: string) => {
    statusMutation.mutate({ id: appointmentId, status: 'confirmed' });
  };

  const handleCancelAppointment = (appointmentId: string) => {
    statusMutation.mutate({ id: appointmentId, status: 'cancelled' });
  };

  const handleCall = (phone: string) => {
    if (typeof window === 'undefined') return;
    window.location.href = `tel:${phone}`;
  };

  const handleFirstAvailable = async (request: WaitlistEntry) => {
    try {
      setFirstAvailableId(request.id);
      const requestedStart = request.desired_date ? new Date(`${request.desired_date}T00:00:00`) : new Date();
      const baseDate = requestedStart > startOfDay(new Date()) ? requestedStart : startOfDay(new Date());
      const staffCandidates = request.staff_id ? [request.staff_id] : staffList.map((staff) => staff.id);
      let best: { staffId: string; startAt: string } | null = null;

      for (let offset = 0; offset < 14 && !best; offset += 1) {
        const day = addDays(baseDate, offset);
        const dateLabel = format(day, 'yyyy-MM-dd');
        const dayCandidates: Array<{ staffId: string; startAt: string }> = [];

        for (const staffId of staffCandidates) {
          const slots = await apiClient.get<Slot[]>('/appointments/slots', {
            serviceId: request.service_id,
            staffId,
            date: dateLabel,
          });

          const filteredSlots = slots.filter((slot) => {
            if (!request.desired_from || !request.desired_to) return true;
            return slot.start >= request.desired_from.slice(0, 5) && slot.start < request.desired_to.slice(0, 5);
          });

          if (filteredSlots[0]) {
            const [hours, minutes] = filteredSlots[0].start.split(':').map(Number);
            const startAt = new Date(day);
            startAt.setHours(hours, minutes, 0, 0);
            dayCandidates.push({ staffId, startAt: startAt.toISOString() });
          }
        }

        if (dayCandidates.length) {
          dayCandidates.sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());
          best = dayCandidates[0];
        }
      }

      if (!best) {
        toast.error('Не намерихме свободен слот по зададените предпочитания.');
        return;
      }

      createAppointmentFromRequestMutation.mutate({
        request,
        staffId: best.staffId,
        startAt: best.startAt,
      });
    } catch (error) {
      toast.error(getErrorMessage(error, 'Неуспешно търсене на първи свободен час.'));
    } finally {
      setFirstAvailableId(null);
    }
  };

  const calendarTitle = buildDayHeaderLabel(currentDate, view);
  const dayColumns = useMemo(
    () =>
      visibleStaff.map((staff) => ({
        staff,
        appointments: sortByStartAt(
          filteredAppointments.filter(
            (appointment) => appointment.staff_id === staff.id && isSameDay(new Date(appointment.start_at), currentDate),
          ),
        ),
        exceptions: filteredExceptions.filter(
          (exception) => exception.staff_id === staff.id && isSameDay(new Date(exception.start_at), currentDate),
        ),
      })),
    [currentDate, filteredAppointments, filteredExceptions, visibleStaff],
  );
  const weekRows = useMemo(
    () =>
      daysInView.map((day) => ({
        day,
        appointments: sortByStartAt(
          filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.start_at), day)),
        ),
      })),
    [daysInView, filteredAppointments],
  );

  const previewLabel = getSlotPreviewLabel(dropPreview, staffList);
  const leftColumn = (
    <aside className="space-y-4 xl:pr-2">
      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Навигация</p>
        <h2 className="mt-2 text-lg font-black text-slate-900">{formatCalendarLabel(currentDate)}</h2>
        <input
          type="date"
          value={format(currentDate, 'yyyy-MM-dd')}
          onChange={(event) => setCurrentDate(new Date(`${event.target.value}T12:00:00`))}
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
        />
        <div className="mt-4 grid gap-2">
          {quickDays.map((day) => (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => setCurrentDate(day)}
              className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                isSameDay(day, currentDate)
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                {format(day, 'EEE', { locale: bg })}
              </p>
              <p className="mt-1 text-sm font-semibold">{format(day, "d MMMM", { locale: bg })}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_22px_60px_rgba(15,23,42,0.06)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Контекст</p>
        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Чакат днес</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{pendingTimedAppointments.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Pending requests</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{activeWaitlist.length}</p>
          </div>
        </div>
      </div>
    </aside>
  );

  const pendingPanel = (
    <aside className="rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Pending Requests</p>
          <h2 className="mt-2 text-xl font-black text-slate-900">Чакащи действия</h2>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-500">
          {activeWaitlist.length + pendingTimedAppointments.length}
        </span>
      </div>

      <div className="max-h-[calc(100vh-180px)] space-y-5 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Без избран час</h3>
            <span className="text-xs font-semibold text-slate-400">{activeWaitlist.length}</span>
          </div>
          {activeWaitlist.length ? (
            activeWaitlist.map((request) => {
              const duration = serviceMap.get(request.service_id)?.duration_minutes ?? 60;
              return (
                <div
                  key={request.id}
                  className="rounded-[28px] border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-black text-slate-900">{request.client_name}</p>
                      <p className="mt-1 text-sm text-slate-600">{request.service_name} · {duration} мин.</p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getWaitlistStatusPresentation(request.status).cls}`}>
                      {getWaitlistStatusPresentation(request.status).label}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-slate-600">
                    <p>{formatBulgarianPhoneForDisplay(request.client_phone)}</p>
                    <p>{request.staff_name || 'Без предпочитан специалист'}</p>
                    <p>{getRequestWindowLabel(request)}</p>
                    {request.notes && (
                      <p className="line-clamp-2 rounded-2xl bg-white px-3 py-2 text-slate-600">{request.notes}</p>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onPointerDown={(event) => startRequestDrag(event, request)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                    >
                      <GripVertical className="h-4 w-4" />
                      Плъзни
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFirstAvailable(request)}
                      disabled={firstAvailableId === request.id}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
                    >
                      {firstAvailableId === request.id && <Loader2 className="h-4 w-4 animate-spin" />}
                      Първи свободен
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetail({ type: 'request', id: request.id })}
                      className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                    >
                      Отвори
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCall(request.client_phone)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                    >
                      <Phone className="h-4 w-4" />
                      Обади се
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Няма заявки без избран час.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-500">Чакат потвърждение</h3>
            <span className="text-xs font-semibold text-slate-400">{pendingTimedAppointments.length}</span>
          </div>
          {pendingTimedAppointments.length ? (
            pendingTimedAppointments.map((appointment) => (
              <div
                key={appointment.id}
                className="rounded-[28px] border border-amber-200 bg-amber-50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-black text-slate-900">{appointment.client_name}</p>
                    <p className="mt-1 text-sm text-slate-700">{appointment.service_name}</p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                    {formatTimeLabel(appointment.start_at)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-slate-600">
                  {formatAppointmentDay(appointment.start_at)} · {appointment.staff_name}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirmAppointment(appointment.id)}
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCancelAppointment(appointment.id)}
                    className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetail({ type: 'appointment', id: appointment.id })}
                    className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700"
                  >
                    Отвори
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Няма записи, които чакат потвърждение.
            </div>
          )}
        </section>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f7fb_0%,#eef2f7_100%)] px-4 py-4 text-slate-900 lg:px-6">
      <div className="mx-auto max-w-[1660px]">
        <header className="mb-4 rounded-[32px] border border-slate-200 bg-white px-5 py-4 shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Admin Calendar</p>
              <h1 className="mt-2 text-2xl font-black text-slate-900">Календар</h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setCurrentDate(view === 'week' ? addDays(currentDate, -7) : subDays(currentDate, 1))}
                  className="rounded-full px-3 py-2 text-slate-600 hover:bg-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date())}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDate(view === 'week' ? addDays(currentDate, 7) : addDays(currentDate, 1))}
                  className="rounded-full px-3 py-2 text-slate-600 hover:bg-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                {calendarTitle}
              </div>

              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                {(['day', 'week'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      view === option ? 'bg-slate-900 text-white' : 'text-slate-600'
                    }`}
                  >
                    {option === 'day' ? 'Day' : 'Week'}
                  </button>
                ))}
              </div>

              <select
                value={staffFilter}
                onChange={(event) => setStaffFilter(event.target.value)}
                className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="all">Всички специалисти</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() =>
                  openBookingAtSlot(
                    currentDate,
                    staffFilter === 'all' ? staffList[0]?.id || '' : staffFilter,
                    '',
                  )
                }
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                New Appointment
              </button>
            </div>
          </div>
        </header>

        {isCompactViewport ? (
          <div className="space-y-4">
            {leftColumn}

            <section className="rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setView('day')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${view === 'day' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600'}`}
                  >
                    График
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('week')}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${view === 'week' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600'}`}
                  >
                    Седмица
                  </button>
                </div>
              </div>

              <div className="space-y-3 px-5 py-5">
                {view === 'day' ? (
                  visibleStaff.map((staff) => {
                    const appointmentsForStaff = sortByStartAt(
                      filteredAppointments.filter(
                        (appointment) =>
                          appointment.staff_id === staff.id &&
                          isSameDay(new Date(appointment.start_at), currentDate),
                      ),
                    );
                    const exceptionsForStaff = filteredExceptions.filter(
                      (exception) =>
                        exception.staff_id === staff.id &&
                        isSameDay(new Date(exception.start_at), currentDate),
                    );

                    return (
                      <div key={staff.id} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: staff.color || '#0f172a' }}
                            />
                            <h3 className="text-base font-black text-slate-900">{staff.name}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => openBookingAtSlot(currentDate, staff.id)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          >
                            Нов час
                          </button>
                        </div>

                        {appointmentsForStaff.length ? (
                          <div className="mt-4 space-y-3">
                            {appointmentsForStaff.map((appointment) => {
                              const tone = getStatusTone(appointment);
                              return (
                                <button
                                  key={appointment.id}
                                  type="button"
                                  onClick={() => setDetail({ type: 'appointment', id: appointment.id })}
                                  className="w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-base font-black text-slate-900">{appointment.client_name}</p>
                                      <p className="mt-1 text-sm text-slate-600">{appointment.service_name}</p>
                                    </div>
                                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}>
                                      {appointment.owner_view_label || tone.label}
                                    </span>
                                  </div>
                                  <p className="mt-3 text-sm text-slate-600">
                                    {formatTimeLabel(appointment.start_at)} - {formatTimeLabel(appointment.end_at)}
                                  </p>
                                  <div className="mt-4 grid grid-cols-3 gap-2">
                                    {isRequestOwnerState(appointment) ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleConfirmAppointment(appointment.id);
                                        }}
                                        className="rounded-2xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white"
                                      >
                                        Потвърди
                                      </button>
                                    ) : (
                                      <div className="rounded-2xl border border-transparent px-3 py-3" />
                                    )}
                                    {!isCancelledCalendarItem(appointment) ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          setMoveTarget(appointment);
                                        }}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700"
                                      >
                                        Премести
                                      </button>
                                    ) : (
                                      <div className="rounded-2xl border border-transparent px-3 py-3" />
                                    )}
                                    {!isCancelledCalendarItem(appointment) ? (
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          handleCancelAppointment(appointment.id);
                                        }}
                                        className="rounded-2xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-700"
                                      >
                                        Откажи
                                      </button>
                                    ) : (
                                      <div className="rounded-2xl border border-transparent px-3 py-3" />
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-4 rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                            Няма записи за деня.
                          </div>
                        )}

                        {exceptionsForStaff.length ? (
                          <div className="mt-4 space-y-2">
                            {exceptionsForStaff.map((exception) => (
                              <div key={exception.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                                Блокирано: {formatAppointmentDay(exception.start_at)} - {formatTimeLabel(exception.end_at)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  weekRows.map((row) => (
                    <div key={row.day.toISOString()} className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-black text-slate-900">
                          {format(row.day, "EEEE, d MMMM", { locale: bg })}
                        </h3>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                          {row.appointments.length}
                        </span>
                      </div>
                      {row.appointments.length ? (
                        <div className="mt-4 space-y-3">
                          {row.appointments.map((appointment) => {
                            const tone = getStatusTone(appointment);
                            return (
                              <button
                                key={appointment.id}
                                type="button"
                                onClick={() => setDetail({ type: 'appointment', id: appointment.id })}
                                className="w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-black text-slate-900">{appointment.client_name}</p>
                                    <p className="mt-1 text-sm text-slate-600">{appointment.service_name}</p>
                                  </div>
                                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}>
                                    {formatTimeLabel(appointment.start_at)}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-500">{appointment.staff_name}</p>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="mt-4 rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                          Няма записи.
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            {pendingPanel}
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
            {leftColumn}

            <section className="rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      {view === 'day' ? 'Day View' : 'Week View'}
                    </p>
                    <h2 className="mt-1 text-xl font-black text-slate-900">{calendarTitle}</h2>
                  </div>
                  {previewLabel ? (
                    <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">
                      {previewLabel}
                    </div>
                  ) : (
                    <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500">
                      {view === 'day'
                        ? 'Плъзнете само от дръжката на картата. Кликът върху картата отваря детайли.'
                        : 'Week view е за бързо сканиране. Преместването е в Day view.'}
                    </div>
                  )}
                </div>
              </div>

              {isLoading ? (
                <div className="flex min-h-[620px] items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
                </div>
              ) : view === 'day' ? (
                <div className="flex h-[calc(100vh-190px)] min-h-[680px] overflow-hidden">
                  <div className="sticky left-0 z-20 w-[82px] shrink-0 border-r border-slate-200 bg-white">
                    <div className="sticky top-0 border-b border-slate-200 bg-white px-3 py-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Час
                    </div>
                    <div className="relative" style={{ height: gridMetrics.height }}>
                      {gridMetrics.hourSlots.slice(0, -1).map((hour) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 -translate-y-2 px-3 text-xs font-semibold text-slate-400"
                          style={{ top: `${(hour - calendarRange.startHour) * pixelsPerHour}px` }}
                        >
                          {String(hour).padStart(2, '0')}:00
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 flex-1 overflow-auto">
                    <div className="grid min-w-[880px]" style={{ gridTemplateColumns: `repeat(${Math.max(dayColumns.length, 1)}, minmax(280px, 1fr))` }}>
                      {dayColumns.map(({ staff, appointments: staffAppointments, exceptions }) => {
                        const layouts = buildAppointmentLanes(staffAppointments);
                        const overlays = buildExceptionBlocks(
                          staff.working_hours?.[getWorkingDayKey(currentDate)],
                          exceptions,
                          currentDate,
                          gridMetrics.height,
                          calendarRange.startHour,
                          pixelsPerHour,
                        );

                        return (
                          <div key={staff.id} className="border-r border-slate-200 last:border-r-0">
                            <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <span
                                    className="h-3 w-3 rounded-full"
                                    style={{ backgroundColor: staff.color || '#0f172a' }}
                                  />
                                  <div>
                                    <p className="text-sm font-black text-slate-900">{staff.name}</p>
                                    <p className="text-xs text-slate-500">
                                      {staffAppointments.length} записа
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openBookingAtSlot(currentDate, staff.id)}
                                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                                >
                                  Нов час
                                </button>
                              </div>
                            </div>

                            <div
                              ref={registerColumn(`day-${staff.id}`, staff.id, currentDate)}
                              className="relative"
                              style={{ height: gridMetrics.height }}
                            >
                              {gridMetrics.hourSlots.slice(0, -1).map((hour) => (
                                <div
                                  key={`${staff.id}-${hour}`}
                                  className="absolute inset-x-0 border-t border-slate-100"
                                  style={{ top: `${(hour - calendarRange.startHour) * pixelsPerHour}px` }}
                                />
                              ))}
                              {gridMetrics.dropSlots.map((slot) => {
                                return (
                                  <button
                                    key={`${staff.id}-${slot.key}`}
                                    type="button"
                                    onClick={() => {
                                      const [hour, minute] = slot.key.split('-').map(Number);
                                      const nextStart = new Date(currentDate);
                                      nextStart.setHours(hour, minute, 0, 0);
                                      openBookingAtSlot(currentDate, staff.id, format(nextStart, 'HH:mm'));
                                    }}
                                    className="absolute inset-x-0 z-[1] border-t border-transparent hover:bg-[rgba(15,23,42,0.03)]"
                                    style={{ top: `${slot.top}px`, height: `${gridMetrics.slotHeight}px` }}
                                  >
                                    <span className="sr-only">{slot.label}</span>
                                  </button>
                                );
                              })}

                              {overlays.map((overlay, index) => (
                                <div
                                  key={`${staff.id}-${index}-${overlay.label}`}
                                  className={`absolute inset-x-2 z-[2] rounded-2xl border px-3 py-2 text-xs font-semibold ${
                                    overlay.tone === 'blocked'
                                      ? 'border-slate-300 bg-[repeating-linear-gradient(-45deg,rgba(148,163,184,0.22),rgba(148,163,184,0.22)_8px,rgba(241,245,249,0.95)_8px,rgba(241,245,249,0.95)_16px)] text-slate-700'
                                      : 'border-slate-200 bg-slate-50/90 text-slate-500'
                                  }`}
                                  style={{ top: `${overlay.top}px`, minHeight: `${overlay.height}px` }}
                                >
                                  {overlay.label}
                                </div>
                              ))}

                              {dropPreview?.staffId === staff.id && (
                                <div
                                  className="absolute left-2 right-2 z-[6] rounded-[24px] border-2 border-dashed border-emerald-500 bg-emerald-100/70"
                                  style={{
                                    top: `${getEventLayoutMetrics(
                                      dropPreview.startAt,
                                      new Date(new Date(dropPreview.startAt).getTime() + 60 * 60 * 1000).toISOString(),
                                      calendarRange.startHour,
                                      pixelsPerHour,
                                      52,
                                    ).top}px`,
                                    height: `${Math.max(
                                      ((dragStateRef.current?.kind === 'appointment'
                                        ? getEventDurationMinutes(
                                            dragStateRef.current.appointment.start_at,
                                            dragStateRef.current.appointment.end_at,
                                          )
                                        : dragStateRef.current?.kind === 'request'
                                          ? serviceMap.get(dragStateRef.current.request.service_id)?.duration_minutes ?? 60
                                          : 60) /
                                        60) *
                                        pixelsPerHour,
                                      52,
                                    )}px`,
                                  }}
                                />
                              )}

                              {staffAppointments.map((appointment) => {
                                const metrics = getEventLayoutMetrics(
                                  appointment.start_at,
                                  appointment.end_at,
                                  calendarRange.startHour,
                                  pixelsPerHour,
                                  68,
                                );
                                const lane = layouts.get(appointment.id);
                                const laneCount = lane?.laneCount ?? 1;
                                const laneWidth = `calc((100% - ${(laneCount + 1) * 8}px) / ${laneCount})`;
                                const left = `calc(8px + ${(lane?.lane ?? 0)} * (${laneWidth} + 8px))`;
                                const tone = getStatusTone(appointment);
                                const accent = isRequestOwnerState(appointment)
                                  ? tone.accent
                                  : appointment.service_color || appointment.staff_color || '#0f172a';

                                return (
                                  <article
                                    key={appointment.id}
                                    className="absolute z-[5] overflow-hidden rounded-[24px] border shadow-[0_12px_28px_rgba(15,23,42,0.10)]"
                                    style={{
                                      top: `${metrics.top}px`,
                                      left,
                                      width: laneWidth,
                                      height: `${metrics.height}px`,
                                      borderColor: colorWithAlpha(accent, '66', '#cbd5e1'),
                                      background: isRequestOwnerState(appointment)
                                        ? 'linear-gradient(180deg, rgba(255,251,235,0.98) 0%, rgba(255,247,237,0.98) 100%)'
                                        : 'rgba(255,255,255,0.96)',
                                    }}
                                  >
                                    <div className="h-full px-3 py-3">
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                            {formatTimeLabel(appointment.start_at)} - {formatTimeLabel(appointment.end_at)}
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => setDetail({ type: 'appointment', id: appointment.id })}
                                            className="mt-1 text-left text-sm font-black text-slate-900"
                                          >
                                            {appointment.client_name}
                                          </button>
                                          <p className="mt-1 text-xs text-slate-600">{appointment.service_name}</p>
                                        </div>
                                        <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.chip}`}>
                                          {appointment.owner_view_label || tone.label}
                                        </span>
                                      </div>

                                      <div className="mt-3 flex items-center gap-2">
                                        <button
                                          type="button"
                                          onPointerDown={(event) => startAppointmentDrag(event, appointment)}
                                          className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500"
                                        >
                                          <GripVertical className="h-4 w-4" />
                                        </button>
                                        {isRequestOwnerState(appointment) && (
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleConfirmAppointment(appointment.id);
                                            }}
                                            className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 text-white"
                                          >
                                            <Check className="h-4 w-4" />
                                          </button>
                                        )}
                                        {!isCancelledCalendarItem(appointment) && (
                                          <button
                                            type="button"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              handleCancelAppointment(appointment.id);
                                            }}
                                            className="flex h-9 w-9 items-center justify-center rounded-2xl border border-rose-200 bg-white text-rose-700"
                                          >
                                            <X className="h-4 w-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </article>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-[calc(100vh-190px)] min-h-[680px] overflow-auto px-5 py-5">
                  <div className="grid min-w-[980px] gap-4 xl:grid-cols-7">
                    {weekRows.map((row) => (
                      <div key={row.day.toISOString()} className="rounded-[28px] border border-slate-200 bg-slate-50">
                        <div className="sticky top-0 rounded-t-[28px] border-b border-slate-200 bg-slate-50 px-4 py-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {format(row.day, 'EEE', { locale: bg })}
                          </p>
                          <h3 className="mt-1 text-lg font-black text-slate-900">{format(row.day, 'd', { locale: bg })}</h3>
                        </div>
                        <div className="space-y-3 p-4">
                          {row.appointments.length ? (
                            row.appointments.map((appointment) => {
                              const tone = getStatusTone(appointment);
                              return (
                                <button
                                  key={appointment.id}
                                  type="button"
                                  onClick={() => setDetail({ type: 'appointment', id: appointment.id })}
                                  className="w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-black text-slate-900">{appointment.client_name}</p>
                                      <p className="mt-1 text-sm text-slate-600">{appointment.service_name}</p>
                                      <p className="mt-2 text-xs text-slate-500">{appointment.staff_name}</p>
                                    </div>
                                    <div className="text-right">
                                      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone.chip}`}>
                                        {formatTimeLabel(appointment.start_at)}
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              );
                            })
                          ) : (
                            <div className="rounded-[24px] border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                              Няма записи
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {pendingPanel}
          </div>
        )}
      </div>

      <DetailDrawer
        detail={detail}
        appointment={selectedAppointment}
        appointmentContext={selectedContext}
        request={selectedRequest}
        requestDuration={selectedRequestDuration}
        onClose={() => setDetail(null)}
        onConfirm={handleConfirmAppointment}
        onCancel={handleCancelAppointment}
        onMove={(appointment) => setMoveTarget(appointment)}
        onCall={handleCall}
        onFirstAvailable={handleFirstAvailable}
        onArchiveRequest={(request) => archiveRequestMutation.mutate({ id: request.id, status: 'cancelled' })}
        firstAvailableLoading={Boolean(selectedRequest && firstAvailableId === selectedRequest.id)}
      />

      <AdminBookingModal
        open={showBookingModal}
        defaultDate={bookingPrefill?.date || format(currentDate, 'yyyy-MM-dd')}
        defaultStaffId={bookingPrefill?.staffId || (staffFilter === 'all' ? staffList[0]?.id || '' : staffFilter)}
        preferredSlot={bookingPrefill?.preferredSlot || ''}
        onClose={() => {
          setShowBookingModal(false);
          setBookingPrefill(null);
        }}
        onCreated={(startAt) => {
          setShowBookingModal(false);
          setBookingPrefill(null);
          setCurrentDate(new Date(startAt));
          void invalidateCalendar();
        }}
      />

      <AppointmentMoveModal
        open={Boolean(moveTarget)}
        appointment={moveTarget}
        onClose={() => setMoveTarget(null)}
        onMoved={(startAt) => {
          setMoveTarget(null);
          setCurrentDate(new Date(startAt));
          void invalidateCalendar();
        }}
      />
    </div>
  );
}
