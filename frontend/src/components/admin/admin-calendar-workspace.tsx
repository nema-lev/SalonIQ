'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { bg } from 'date-fns/locale';
import { Clock3, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { normalizeBulgarianPhone } from '@/lib/phone';
import { AdminBookingModal } from './admin-booking-modal';
import { AdminCalendarDesktop } from './admin-calendar-desktop';
import { AdminCalendarMobile } from './admin-calendar-mobile';
import { AppointmentMoveModal } from './appointment-move-modal';
import { CalendarDetailDrawer, type CalendarDetailState } from './calendar-detail-drawer';
import { CalendarRequestSections } from './calendar-request-sections';
import {
  CALENDAR_SLOT_MINUTES,
  type Appointment,
  type AppointmentContextResponse,
  type CalendarBoardResponse,
  type CalendarBoardStaff,
  type CalendarDropPreview,
  type CalendarViewMode,
  type Service,
  type Slot,
  type StaffException,
  type WaitlistEntry,
  buildCalendarGridMetrics,
  buildCalendarRange,
  getEventDurationMinutes,
  isCancelledCalendarItem,
  isRequestOwnerState,
  overlapsRange,
  sortByStartAt,
} from './calendar-model';

type ColumnRegistryEntry = {
  element: HTMLDivElement | null;
  staffId: string;
  day: Date;
  rangeStartHour: number;
  pixelsPerHour: number;
};

type ActivePointerDrag =
  | {
      kind: 'appointment';
      appointment: Appointment;
      durationMinutes: number;
      pointerId: number;
      moved: boolean;
      startX: number;
      startY: number;
    }
  | {
      kind: 'request';
      request: WaitlistEntry;
      durationMinutes: number;
      pointerId: number;
      moved: boolean;
      startX: number;
      startY: number;
    };

type DragOverlayState = {
  kind: 'appointment' | 'request';
  clientName: string;
  serviceName: string;
  durationMinutes: number;
  point: { x: number; y: number };
  moved: boolean;
  reason: string | null;
  candidateStartAt: string | null;
  candidateStaffId: string | null;
};

type PlacementResolution = {
  preview: CalendarDropPreview;
  reason: string | null;
  candidateStartAt: string | null;
  candidateStaffId: string | null;
};

type DayColumn = {
  staff: CalendarBoardStaff;
  appointments: Appointment[];
  exceptions: StaffException[];
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

function buildHeaderLabel(currentDate: Date, view: CalendarViewMode) {
  if (view === 'day') {
    return format(currentDate, "d MMMM yyyy 'г.'", { locale: bg });
  }

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  return `${format(weekStart, 'd MMM', { locale: bg })} - ${format(weekEnd, 'd MMM yyyy', { locale: bg })}`;
}

function getSlotPreviewLabel(preview: CalendarDropPreview, staffList: CalendarBoardStaff[]) {
  if (!preview) return null;

  const staffName = staffList.find((staff) => staff.id === preview.staffId)?.name || 'Специалист';
  return `${format(new Date(preview.startAt), "EEE d MMM '·' HH:mm", { locale: bg })} · ${staffName}`;
}

export function AdminCalendarWorkspace() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarViewMode>('day');
  const [desktopStaffFilter, setDesktopStaffFilter] = useState('all');
  const [mobileStaffId, setMobileStaffId] = useState('');
  const [detail, setDetail] = useState<CalendarDetailState>(null);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingPrefill, setBookingPrefill] = useState<{ date: string; staffId: string; preferredSlot: string } | null>(null);
  const [moveTarget, setMoveTarget] = useState<Appointment | null>(null);
  const [dropPreview, setDropPreview] = useState<CalendarDropPreview>(null);
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState | null>(null);
  const [firstAvailableId, setFirstAvailableId] = useState<string | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [placementNotice, setPlacementNotice] = useState<string | null>(null);
  const dragStateRef = useRef<ActivePointerDrag | null>(null);
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
  const activeWaitlist = useMemo(
    () => waitlistEntries.filter((entry) => entry.status === 'waiting' || entry.status === 'notified'),
    [waitlistEntries],
  );
  const pendingTimedAppointments = useMemo(
    () =>
      sortByStartAt(
        appointments.filter((appointment) => {
          if (!isRequestOwnerState(appointment)) return false;
          if (view === 'week') return true;
          return isSameDay(new Date(appointment.start_at), currentDate);
        }),
      ),
    [appointments, currentDate, view],
  );
  const filteredAppointments = useMemo(
    () =>
      appointments.filter((appointment) => {
        if (desktopStaffFilter !== 'all' && appointment.staff_id !== desktopStaffFilter) return false;
        if (view === 'day') return isSameDay(new Date(appointment.start_at), currentDate);
        return true;
      }),
    [appointments, currentDate, desktopStaffFilter, view],
  );
  const filteredExceptions = useMemo(
    () =>
      (calendarBoard?.exceptions ?? []).filter((exception) => {
        if (desktopStaffFilter !== 'all' && exception.staff_id !== desktopStaffFilter) return false;
        if (view === 'day') return isSameDay(new Date(exception.start_at), currentDate);
        return true;
      }),
    [calendarBoard?.exceptions, currentDate, desktopStaffFilter, view],
  );
  const desktopVisibleStaff = useMemo(
    () => (desktopStaffFilter === 'all' ? staffList : staffList.filter((staff) => staff.id === desktopStaffFilter)),
    [desktopStaffFilter, staffList],
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

  const desktopCalendarRange = useMemo(
    () =>
      buildCalendarRange({
        appointments: filteredAppointments,
        staffMembers: desktopVisibleStaff,
        exceptions: filteredExceptions,
        days: daysInView,
      }),
    [daysInView, desktopVisibleStaff, filteredAppointments, filteredExceptions],
  );
  const desktopPixelsPerHour = 84;
  const desktopGridMetrics = useMemo(
    () => buildCalendarGridMetrics(desktopCalendarRange, desktopPixelsPerHour),
    [desktopCalendarRange],
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
    if (desktopStaffFilter !== 'all' && !staffList.some((staff) => staff.id === desktopStaffFilter)) {
      setDesktopStaffFilter('all');
    }
  }, [desktopStaffFilter, staffList]);

  useEffect(() => {
    if (!staffList.length) return;

    setMobileStaffId((current) => {
      if (current && staffList.some((staff) => staff.id === current)) {
        return current;
      }
      if (desktopStaffFilter !== 'all' && staffList.some((staff) => staff.id === desktopStaffFilter)) {
        return desktopStaffFilter;
      }
      return staffList[0]?.id || '';
    });
  }, [desktopStaffFilter, staffList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 1024);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const previousUserSelect = document.body.style.userSelect;
    if (dragOverlay) {
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.body.style.userSelect = previousUserSelect;
    };
  }, [dragOverlay]);

  useEffect(() => {
    if (!placementNotice || typeof window === 'undefined') return;

    const timeoutId = window.setTimeout(() => {
      setPlacementNotice(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [placementNotice]);

  const invalidateCalendar = useCallback(async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
    queryClient.invalidateQueries({ queryKey: ['appointments-waitlist'] });
    queryClient.invalidateQueries({ queryKey: ['appointment-context'] });
  }, [queryClient, refetch]);

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
    onSuccess: async (created, variables) => {
      await invalidateCalendar();
      setCurrentDate(new Date(created.startAt));
      setDetail(null);
      setPlacementNotice(
        `Заявката е поставена за ${format(new Date(created.startAt), "d MMM '·' HH:mm", { locale: bg })} · ${
          staffList.find((staff) => staff.id === variables.staffId)?.name || 'специалист'
        }.`,
      );
      toast.success('Заявката е поставена в календара.');
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
        return { preview: null as CalendarDropPreview, reason: 'Специалистът не е намерен.' };
      }

      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][nextStart.getDay()] || 'mon';
      const schedule = staff.working_hours?.[dayKey];
      if (!schedule?.isOpen) {
        return { preview: null as CalendarDropPreview, reason: 'Този ден е извън работното време на специалиста.' };
      }

      const [openHour, openMinute] = schedule.open.split(':').map(Number);
      const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
      const workStart = new Date(nextStart);
      workStart.setHours(openHour, openMinute, 0, 0);
      const workEnd = new Date(nextStart);
      workEnd.setHours(closeHour, closeMinute, 0, 0);

      if (nextStart.getTime() < workStart.getTime() || nextEnd.getTime() > workEnd.getTime()) {
        return { preview: null as CalendarDropPreview, reason: 'Изберете слот в работното време на специалиста.' };
      }

      const blocked = (calendarBoard?.exceptions ?? []).some(
        (exception) =>
          exception.staff_id === staffId &&
          overlapsRange(nextStart, nextEnd, exception.start_at, exception.end_at),
      );
      if (blocked) {
        return { preview: null as CalendarDropPreview, reason: 'Този интервал е блокиран.' };
      }

      const occupied = appointments.some((appointment) => {
        if (appointment.id === ignoreAppointmentId) return false;
        if (appointment.staff_id !== staffId) return false;
        if (isCancelledCalendarItem(appointment)) return false;
        return overlapsRange(nextStart, nextEnd, appointment.start_at, appointment.end_at);
      });
      if (occupied) {
        return { preview: null as CalendarDropPreview, reason: 'Този час вече е зает.' };
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

  const registerDesktopColumn = useCallback(
    (key: string, staffId: string, day: Date) => (node: HTMLDivElement | null) => {
      if (!node) {
        delete columnRegistryRef.current[key];
        return;
      }

      columnRegistryRef.current[key] = {
        element: node,
        staffId,
        day,
        rangeStartHour: desktopCalendarRange.startHour,
        pixelsPerHour: desktopPixelsPerHour,
      };
    },
    [desktopCalendarRange.startHour],
  );

  const mobileDayColumn = useMemo<DayColumn | null>(() => {
    const selectedStaff = staffList.find((staff) => staff.id === mobileStaffId) || null;
    if (!selectedStaff) return null;

    return {
      staff: selectedStaff,
      appointments: sortByStartAt(
        appointments.filter(
          (appointment) =>
            appointment.staff_id === selectedStaff.id && isSameDay(new Date(appointment.start_at), currentDate),
        ),
      ),
      exceptions: (calendarBoard?.exceptions ?? []).filter(
        (exception) =>
          exception.staff_id === selectedStaff.id && isSameDay(new Date(exception.start_at), currentDate),
      ),
    };
  }, [appointments, calendarBoard?.exceptions, currentDate, mobileStaffId, staffList]);

  const mobileCalendarRange = useMemo(
    () =>
      buildCalendarRange({
        appointments: mobileDayColumn?.appointments ?? [],
        staffMembers: mobileDayColumn ? [mobileDayColumn.staff] : [],
        exceptions: mobileDayColumn?.exceptions ?? [],
        days: [currentDate],
      }),
    [currentDate, mobileDayColumn],
  );
  const mobilePixelsPerHour = 82;
  const mobileGridMetrics = useMemo(
    () => buildCalendarGridMetrics(mobileCalendarRange, mobilePixelsPerHour),
    [mobileCalendarRange],
  );

  const registerMobileColumn = useCallback(
    (key: string, staffId: string, day: Date) => (node: HTMLDivElement | null) => {
      if (!node) {
        delete columnRegistryRef.current[key];
        return;
      }

      columnRegistryRef.current[key] = {
        element: node,
        staffId,
        day,
        rangeStartHour: mobileCalendarRange.startHour,
        pixelsPerHour: mobilePixelsPerHour,
      };
    },
    [mobileCalendarRange.startHour],
  );

  const resolvePreviewFromPoint = useCallback(
    (dragState: ActivePointerDrag, clientX: number, clientY: number): PlacementResolution => {
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

        const result = resolvePlacement({
          startAt: nextStart.toISOString(),
          staffId: entry.staffId,
          durationMinutes: dragState.durationMinutes,
          ignoreAppointmentId: dragState.kind === 'appointment' ? dragState.appointment.id : undefined,
        });

        return {
          preview: result.preview,
          reason: result.reason,
          candidateStartAt: nextStart.toISOString(),
          candidateStaffId: entry.staffId,
        };
      }

      return {
        preview: null,
        reason: 'Пуснете върху свободен 15-минутен слот.',
        candidateStartAt: null,
        candidateStaffId: null,
      };
    },
    [resolvePlacement],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      if (!dragState.moved) {
        const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
        if (distance < 6) {
          setDragOverlay((current) =>
            current
              ? {
                  ...current,
                  point: { x: event.clientX, y: event.clientY },
                }
              : current,
          );
          return;
        }
        dragState.moved = true;
      }

      const resolution = resolvePreviewFromPoint(dragState, event.clientX, event.clientY);
      setDropPreview(resolution.preview);
      setDragOverlay((current) =>
        current
          ? {
              ...current,
              moved: true,
              point: { x: event.clientX, y: event.clientY },
              reason: resolution.reason,
              candidateStartAt: resolution.candidateStartAt,
              candidateStaffId: resolution.candidateStaffId,
            }
          : current,
      );
    };

    const handlePointerEnd = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState || event.pointerId !== dragState.pointerId) return;

      const preview = dropPreview;
      dragStateRef.current = null;
      setDropPreview(null);
      setDragOverlay(null);

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
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [createAppointmentFromRequestMutation, dropPreview, resolvePreviewFromPoint, rescheduleMutation]);

  const beginDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLButtonElement>,
      payload:
        | { kind: 'appointment'; appointment: Appointment; durationMinutes: number }
        | { kind: 'request'; request: WaitlistEntry; durationMinutes: number },
    ) => {
      if (view !== 'day') return;

      if (event.pointerType !== 'touch' && event.button !== 0) return;

      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);

      dragStateRef.current =
        payload.kind === 'appointment'
          ? {
              kind: 'appointment',
              appointment: payload.appointment,
              durationMinutes: payload.durationMinutes,
              pointerId: event.pointerId,
              moved: false,
              startX: event.clientX,
              startY: event.clientY,
            }
          : {
              kind: 'request',
              request: payload.request,
              durationMinutes: payload.durationMinutes,
              pointerId: event.pointerId,
              moved: false,
              startX: event.clientX,
              startY: event.clientY,
            };

      setDragOverlay({
        kind: payload.kind,
        clientName: payload.kind === 'appointment' ? payload.appointment.client_name : payload.request.client_name,
        serviceName: payload.kind === 'appointment' ? payload.appointment.service_name : payload.request.service_name,
        durationMinutes: payload.durationMinutes,
        point: { x: event.clientX, y: event.clientY },
        moved: false,
        reason: null,
        candidateStartAt: null,
        candidateStaffId: null,
      });
      setDropPreview(null);
    },
    [view],
  );

  const startAppointmentDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, appointment: Appointment) => {
      if (isCancelledCalendarItem(appointment)) return;

      beginDrag(event, {
        kind: 'appointment',
        appointment,
        durationMinutes: getEventDurationMinutes(appointment.start_at, appointment.end_at),
      });
    },
    [beginDrag],
  );

  const startRequestDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, request: WaitlistEntry) => {
      beginDrag(event, {
        kind: 'request',
        request,
        durationMinutes: serviceMap.get(request.service_id)?.duration_minutes ?? 60,
      });
    },
    [beginDrag, serviceMap],
  );

  const openBookingAtSlot = useCallback((day: Date, staffId: string, preferredSlot = '') => {
    setBookingPrefill({
      date: format(day, 'yyyy-MM-dd'),
      staffId,
      preferredSlot,
    });
    setShowBookingModal(true);
  }, []);

  const handleConfirmAppointment = useCallback((appointmentId: string) => {
    statusMutation.mutate({ id: appointmentId, status: 'confirmed' });
  }, [statusMutation]);

  const handleCancelAppointment = useCallback((appointmentId: string) => {
    statusMutation.mutate({ id: appointmentId, status: 'cancelled' });
  }, [statusMutation]);

  const handleCall = useCallback((phone: string) => {
    if (typeof window === 'undefined') return;
    window.location.href = `tel:${phone}`;
  }, []);

  const handleFirstAvailable = useCallback(
    async (request: WaitlistEntry) => {
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
    },
    [createAppointmentFromRequestMutation, staffList],
  );

  const desktopDayColumns = useMemo<DayColumn[]>(
    () =>
      desktopVisibleStaff.map((staff) => ({
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
    [currentDate, desktopVisibleStaff, filteredAppointments, filteredExceptions],
  );

  const desktopWeekRows = useMemo(
    () =>
      daysInView.map((day) => ({
        day,
        appointments: sortByStartAt(
          filteredAppointments.filter((appointment) => isSameDay(new Date(appointment.start_at), day)),
        ),
      })),
    [daysInView, filteredAppointments],
  );

  const mobileWeekRows = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      }).map((day) => ({
        day,
        appointments: sortByStartAt(
          appointments.filter(
            (appointment) =>
              appointment.staff_id === mobileStaffId && isSameDay(new Date(appointment.start_at), day),
          ),
        ),
      })),
    [appointments, currentDate, mobileStaffId],
  );

  const activeDragDurationMinutes = dragOverlay?.durationMinutes ?? null;
  const previewLabel = getSlotPreviewLabel(dropPreview, staffList);
  const calendarTitle = buildHeaderLabel(currentDate, view);
  const requestsCount = activeWaitlist.length + pendingTimedAppointments.length;
  const hasActionableRequests = requestsCount > 0;
  const candidateStaffName =
    dragOverlay?.candidateStaffId != null
      ? staffList.find((staff) => staff.id === dragOverlay.candidateStaffId)?.name || 'Специалист'
      : null;
  const candidateLabel =
    dragOverlay?.candidateStartAt != null
      ? `${format(new Date(dragOverlay.candidateStartAt), "EEE d MMM '·' HH:mm", { locale: bg })}${
          candidateStaffName ? ` · ${candidateStaffName}` : ''
        }`
      : null;

  const requestSectionsDesktop = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-200 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Чакащи действия</p>
        <h2 className="mt-2 text-xl font-black text-slate-900">Заявки</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <CalendarRequestSections
          waitlist={activeWaitlist}
          pendingAppointments={pendingTimedAppointments}
          serviceMap={serviceMap}
          firstAvailableId={firstAvailableId}
          onOpenRequest={(requestId) => setDetail({ type: 'request', id: requestId })}
          onFirstAvailable={handleFirstAvailable}
          onStartRequestDrag={startRequestDrag}
          onOpenAppointment={(appointmentId) => setDetail({ type: 'appointment', id: appointmentId })}
          onConfirmAppointment={handleConfirmAppointment}
        />
      </div>
    </div>
  );

  const requestSectionsMobile = (
    <CalendarRequestSections
      waitlist={activeWaitlist}
      pendingAppointments={pendingTimedAppointments}
      serviceMap={serviceMap}
      firstAvailableId={firstAvailableId}
      onOpenRequest={(requestId) => setDetail({ type: 'request', id: requestId })}
      onFirstAvailable={handleFirstAvailable}
      onStartRequestDrag={startRequestDrag}
      onOpenAppointment={(appointmentId) => setDetail({ type: 'appointment', id: appointmentId })}
      onConfirmAppointment={handleConfirmAppointment}
      compact
    />
  );

  const defaultStaffForCreate =
    isMobileViewport
      ? mobileStaffId || staffList[0]?.id || ''
      : desktopStaffFilter === 'all'
        ? staffList[0]?.id || ''
        : desktopStaffFilter;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,#f6f7fb_0%,#eef2f7_100%)] text-slate-900">
      <div className="mx-auto flex min-h-0 w-full max-w-[1660px] flex-1 flex-col">
        {isMobileViewport ? (
          <AdminCalendarMobile
            currentDate={currentDate}
            calendarTitle={calendarTitle}
            view={view}
            selectedStaffId={mobileStaffId}
            staffList={staffList}
            dayColumn={mobileDayColumn}
            weekRows={mobileWeekRows}
            calendarRange={mobileCalendarRange}
            gridMetrics={mobileGridMetrics}
            pixelsPerHour={mobilePixelsPerHour}
            isLoading={isLoading}
            previewLabel={previewLabel}
            dropPreview={dropPreview}
            activeDragDurationMinutes={activeDragDurationMinutes}
            isDragging={Boolean(dragOverlay)}
            requestsCount={requestsCount}
            requestsContent={requestSectionsMobile}
            feedbackMessage={placementNotice}
            onShiftDate={(direction) =>
              setCurrentDate((current) => (view === 'week' ? addDays(current, direction === 'next' ? 7 : -7) : addDays(current, direction === 'next' ? 1 : -1)))
            }
            onJumpToToday={() => setCurrentDate(new Date())}
            onPickDate={(value) => setCurrentDate(new Date(`${value}T12:00:00`))}
            onChangeView={setView}
            onChangeStaff={setMobileStaffId}
            onCreateAppointment={() => {
              if (!mobileStaffId) return;
              openBookingAtSlot(currentDate, mobileStaffId);
            }}
            onOpenBookingAtSlot={openBookingAtSlot}
            onOpenDetails={(appointmentId) => setDetail({ type: 'appointment', id: appointmentId })}
            onConfirmAppointment={handleConfirmAppointment}
            onMoveAppointment={setMoveTarget}
            registerColumn={registerMobileColumn}
          />
        ) : (
          <AdminCalendarDesktop
            currentDate={currentDate}
            calendarTitle={calendarTitle}
            view={view}
            staffFilter={desktopStaffFilter}
            staffList={staffList}
            dayColumns={desktopDayColumns}
            weekRows={desktopWeekRows}
            calendarRange={desktopCalendarRange}
            gridMetrics={desktopGridMetrics}
            pixelsPerHour={desktopPixelsPerHour}
            isLoading={isLoading}
            previewLabel={previewLabel}
            dropPreview={dropPreview}
            activeDragDurationMinutes={activeDragDurationMinutes}
            requestsPanel={requestSectionsDesktop}
            feedbackMessage={placementNotice}
            showRequestsPanel={hasActionableRequests}
            onShiftDate={(direction) =>
              setCurrentDate((current) => (view === 'week' ? addDays(current, direction === 'next' ? 7 : -7) : addDays(current, direction === 'next' ? 1 : -1)))
            }
            onJumpToToday={() => setCurrentDate(new Date())}
            onPickDate={(value) => setCurrentDate(new Date(`${value}T12:00:00`))}
            onChangeView={setView}
            onChangeStaffFilter={setDesktopStaffFilter}
            onCreateAppointment={() => {
              if (!defaultStaffForCreate) return;
              openBookingAtSlot(currentDate, defaultStaffForCreate);
            }}
            onOpenBookingAtSlot={openBookingAtSlot}
            onOpenDetails={(appointmentId) => setDetail({ type: 'appointment', id: appointmentId })}
            onConfirmAppointment={handleConfirmAppointment}
            onStartAppointmentDrag={startAppointmentDrag}
            registerColumn={registerDesktopColumn}
          />
        )}
      </div>

      <CalendarDetailDrawer
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
        defaultStaffId={bookingPrefill?.staffId || defaultStaffForCreate}
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

      {dragOverlay?.moved && (
        <>
          <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+16px)] z-[72] -translate-x-1/2">
            <div
              className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-lg backdrop-blur ${
                dropPreview
                  ? 'border-emerald-200 bg-white/96 text-emerald-700'
                  : 'border-rose-200 bg-white/96 text-rose-700'
              }`}
            >
              {previewLabel || candidateLabel || dragOverlay.reason || 'Пуснете върху свободен слот'}
            </div>
          </div>

          <div
            className="pointer-events-none fixed z-[72] w-[min(270px,calc(100vw-32px))] -translate-x-1/2 -translate-y-[22%]"
            style={{
              left: `clamp(136px, ${dragOverlay.point.x}px, calc(100vw - 136px))`,
              top: `clamp(calc(env(safe-area-inset-top,0px) + 110px), ${dragOverlay.point.y}px, calc(100dvh - 110px))`,
            }}
          >
            <div
              className={`rounded-[26px] border px-4 py-3 shadow-2xl backdrop-blur ${
                dropPreview
                  ? 'border-[var(--color-primary)]/35 bg-white/96 text-gray-900'
                  : 'border-rose-300/80 bg-white/96 text-rose-900'
              }`}
            >
              <p className="truncate text-sm font-black">{dragOverlay.clientName}</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-600">{dragOverlay.serviceName}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Цел</p>
                  <p className="mt-1 text-sm font-bold">{candidateLabel || 'Свободен слот'}</p>
                </div>
                <div
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    dropPreview ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {dropPreview ? 'OK' : 'Невалидно'}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                {dragOverlay.kind === 'request' ? <GripVertical className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {dragOverlay.durationMinutes} мин
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
