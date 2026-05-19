'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, RotateCcw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { AdminBookingModal } from '../../admin-booking-modal';
import { useAdminCalendarBoardData } from '../../use-admin-calendar-board-data';
import {
  NativeSchedulerV2Spike,
  type NativeSchedulerCancelBookingResult,
  type NativeSchedulerConfirmBookingResult,
  type NativeSchedulerPlacementSaveResult,
  type NativeSchedulerRescheduleBookingResult,
} from '../native-scheduler-spike/NativeSchedulerV2Spike';
import type { NativeSchedulerManualBookingIntent } from '../native-scheduler-spike/native-scheduler-manual-booking';
import type { NativeSchedulerNotice } from '../native-scheduler-spike/NativeSchedulerGrid';
import type { WaitlistPlacementSaveRequest } from '../native-scheduler-spike/native-scheduler-drag';
import type { AppointmentRescheduleSaveRequest } from '../native-scheduler-spike/native-scheduler-reschedule-booking';
import { getCalendarV2ActionErrorMessage } from '../native-scheduler-spike/native-scheduler-action-errors';
import {
  attemptNativeSchedulerPostWriteSync,
  CALENDAR_V2_POST_WRITE_REFRESH_WARNING,
  runNativeSchedulerPostWriteMutation,
} from '../native-scheduler-spike/native-scheduler-post-write-sync';
import {
  buildCalendarV2RealDataProjection,
  doesCalendarV2BookingExistAfterRefresh,
  shouldKeepCalendarV2SelectedBookingAfterRefresh,
} from './calendar-v2-real-data-mappers';
import { buildCalendarV2SampleDayProjection } from './calendar-v2-sample-day';

const ENABLE_CALENDAR_V2_PLACEMENT_SAVE =
  process.env.NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === 'true';
const CALENDAR_V2_SAMPLE_NOTICE = 'Примерен ден · само преглед';
const CALENDAR_V2_MANUAL_BOOKING_NOTICE = 'Ръчно записване';
const CALENDAR_V2_OPERATIONS_NOTICE = 'Поставяне на заявки';

type PlaceWaitlistEntryResponse = {
  id?: string;
  appointment?: {
    id?: string;
  };
};

type CreatedManualBooking = {
  id: string;
  startAt: string;
};

export function CalendarV2RealDataAdapter() {
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [bookingPrefill, setBookingPrefill] = useState<{
    date: string;
    staffId: string;
    preferredSlot: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSampleMode = searchParams.get('sample') === '1';
  const backToRealData = () => router.push(pathname);

  const rangeStart = useMemo(() => startOfDay(currentDate), [currentDate]);
  const rangeEndExclusive = useMemo(() => addDays(endOfDay(currentDate), 1), [currentDate]);
  const {
    calendarBoard,
    waitlistEntries,
    services,
    isInitialLoading,
    isFetching,
    error,
    refetchCalendarBoard,
    refetchWaitlist,
    refetchServices,
  } = useAdminCalendarBoardData({
    rangeStart,
    rangeEndExclusive,
    enabled: !isSampleMode,
  });
  const canSavePlacement = ENABLE_CALENDAR_V2_PLACEMENT_SAVE && !isSampleMode;
  const canCreateManualBooking = !isSampleMode;
  const placementSaveDisabledReason =
    ENABLE_CALENDAR_V2_PLACEMENT_SAVE && isSampleMode
      ? 'Примерният режим не записва часове.'
      : 'Поставянето на заявки не е активно.';
  const modeNotice = isSampleMode
    ? CALENDAR_V2_SAMPLE_NOTICE
    : canSavePlacement
      ? CALENDAR_V2_OPERATIONS_NOTICE
      : CALENDAR_V2_MANUAL_BOOKING_NOTICE;
  const actionInboxSubtitle = canSavePlacement
    ? 'Поставяне на заявки'
    : isSampleMode
      ? 'Само преглед'
      : 'Поставянето не е активно';

  const projection = useMemo(
    () =>
      buildCalendarV2RealDataProjection({
        calendarBoard,
        waitlistEntries,
        services,
        selectedDate: currentDate,
      }),
    [calendarBoard, currentDate, services, waitlistEntries],
  );
  const sampleProjection = useMemo(
    () => buildCalendarV2SampleDayProjection(currentDate),
    [currentDate],
  );
  const activeProjection = isSampleMode ? sampleProjection : projection;
  const defaultStaffId = activeProjection.resources[0]?.id ?? '';

  const handleSavePlacement = useCallback(
    async (request: WaitlistPlacementSaveRequest): Promise<NativeSchedulerPlacementSaveResult> => {
      if (!canSavePlacement) {
        throw new Error(placementSaveDisabledReason);
      }

      try {
        const mutationResult = await apiClient.post<PlaceWaitlistEntryResponse>(request.path, request.payload);
        const appointmentId = mutationResultToAppointmentId(mutationResult);
        const syncResult = await attemptNativeSchedulerPostWriteSync({
          refresh: async () => {
            const [refreshedBoard, refreshedWaitlist] = await Promise.all([
              refetchCalendarBoard(),
              refetchWaitlist(),
              queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] }),
              queryClient.invalidateQueries({ queryKey: ['appointments-waitlist'] }),
              queryClient.invalidateQueries({ queryKey: ['appointment-context'] }),
            ]);

            return { refreshedBoard, refreshedWaitlist };
          },
          isRefreshResultUsable: ({ refreshedBoard, refreshedWaitlist }) => {
            return (
              isCalendarBoardRefreshUsable(refreshedBoard) &&
              isWaitlistRefreshUsable(refreshedWaitlist) &&
              appointmentId !== null &&
              doesCalendarV2BookingExistAfterRefresh(refreshedBoard.data?.appointments, appointmentId)
            );
          },
        });

        if (syncResult.status === 'refresh_warning') {
          toast.warning(CALENDAR_V2_POST_WRITE_REFRESH_WARNING);
        } else {
          toast.success('Часът е записан.');
        }

        return {
          appointmentId,
          syncStatus: syncResult.status,
        };
      } catch (error) {
        const message = getCalendarV2ActionErrorMessage(error, 'request_placement');
        toast.error(message);
        throw new Error(message);
      }
    },
    [
      canSavePlacement,
      placementSaveDisabledReason,
      queryClient,
      refetchCalendarBoard,
      refetchWaitlist,
    ],
  );

  const handleOpenManualBooking = useCallback((intent: NativeSchedulerManualBookingIntent) => {
    setBookingPrefill({
      date: format(new Date(intent.startAt), 'yyyy-MM-dd'),
      staffId: intent.staffId,
      preferredSlot: intent.preferredSlot,
    });
  }, []);

  const handleManualBookingCreated = useCallback(async (createdBooking: CreatedManualBooking) => {
    setBookingPrefill(null);

    const syncResult = await attemptNativeSchedulerPostWriteSync({
      refresh: async () => {
        const [refreshedBoard] = await Promise.all([
          refetchCalendarBoard(),
          queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] }),
          queryClient.invalidateQueries({ queryKey: ['appointment-context'] }),
        ]);

        return refreshedBoard;
      },
      isRefreshResultUsable: (refreshedBoard) =>
        isCalendarBoardRefreshUsable(refreshedBoard) &&
        doesCalendarV2BookingExistAfterRefresh(refreshedBoard.data?.appointments, createdBooking.id),
    });

    if (syncResult.status === 'refresh_warning') {
      toast.warning(CALENDAR_V2_POST_WRITE_REFRESH_WARNING);
    }
  }, [queryClient, refetchCalendarBoard]);

  const handleCancelBooking = useCallback(
    async (appointmentId: string): Promise<NativeSchedulerCancelBookingResult> => {
      try {
        const { syncResult } = await runNativeSchedulerPostWriteMutation({
          mutate: () => apiClient.patch(`/appointments/${appointmentId}/status`, { status: 'cancelled' }),
          refresh: async () => {
            const [refreshedBoard] = await Promise.all([
              refetchCalendarBoard(),
              queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] }),
              queryClient.invalidateQueries({ queryKey: ['appointment-context'] }),
            ]);

            return refreshedBoard;
          },
          isRefreshResultUsable: (refreshedBoard) =>
            isCalendarBoardRefreshUsable(refreshedBoard) &&
            !shouldKeepCalendarV2SelectedBookingAfterRefresh(refreshedBoard.data?.appointments, appointmentId),
        });

        if (syncResult.status === 'refresh_warning') {
          toast.warning(CALENDAR_V2_POST_WRITE_REFRESH_WARNING);
        } else {
          toast.success('Часът е отказан.');
        }

        return {
          appointmentVisibleAfterRefresh:
            syncResult.status === 'synced'
              ? shouldKeepCalendarV2SelectedBookingAfterRefresh(
                  syncResult.refreshResult.data?.appointments,
                  appointmentId,
                )
              : undefined,
          syncStatus: syncResult.status,
        };
      } catch (error) {
        const message = getCalendarV2ActionErrorMessage(error, 'cancel_booking');
        toast.error(message);
        throw new Error(message);
      }
    },
    [queryClient, refetchCalendarBoard],
  );

  const handleConfirmBooking = useCallback(
    async (appointmentId: string): Promise<NativeSchedulerConfirmBookingResult> => {
      try {
        const { syncResult } = await runNativeSchedulerPostWriteMutation({
          mutate: () => apiClient.patch(`/appointments/${appointmentId}/status`, { status: 'confirmed' }),
          refresh: async () => {
            const [refreshedBoard] = await Promise.all([
              refetchCalendarBoard(),
              queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] }),
              queryClient.invalidateQueries({ queryKey: ['appointment-context'] }),
            ]);

            return refreshedBoard;
          },
          isRefreshResultUsable: (refreshedBoard) =>
            isCalendarBoardRefreshUsable(refreshedBoard) &&
            doesCalendarV2BookingHaveStatusAfterRefresh(
              refreshedBoard.data?.appointments,
              appointmentId,
              'confirmed',
            ),
        });

        if (syncResult.status === 'refresh_warning') {
          toast.warning(CALENDAR_V2_POST_WRITE_REFRESH_WARNING);
        } else {
          toast.success('Часът е потвърден.');
        }

        return {
          appointmentVisibleAfterRefresh:
            syncResult.status === 'synced'
              ? doesCalendarV2BookingExistAfterRefresh(syncResult.refreshResult.data?.appointments, appointmentId)
              : undefined,
          syncStatus: syncResult.status,
        };
      } catch (error) {
        const message = getCalendarV2ActionErrorMessage(error, 'confirm_booking');
        toast.error(message);
        throw new Error(message);
      }
    },
    [queryClient, refetchCalendarBoard],
  );

  const handleRescheduleBooking = useCallback(
    async (request: AppointmentRescheduleSaveRequest): Promise<NativeSchedulerRescheduleBookingResult> => {
      if (isSampleMode) {
        throw new Error('Примерният режим не записва часове.');
      }

      try {
        const appointmentId = getAppointmentIdFromReschedulePath(request.path);
        const { syncResult } = await runNativeSchedulerPostWriteMutation({
          mutate: () => apiClient.patch(request.path, request.payload),
          refresh: async () => {
            const [refreshedBoard] = await Promise.all([
              refetchCalendarBoard(),
              queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] }),
              queryClient.invalidateQueries({ queryKey: ['appointment-context'] }),
            ]);

            return refreshedBoard;
          },
          isRefreshResultUsable: (refreshedBoard) =>
            isCalendarBoardRefreshUsable(refreshedBoard) &&
            isCalendarV2RescheduleRefreshSynchronized(
              refreshedBoard.data?.appointments,
              appointmentId,
              request,
            ),
        });

        if (syncResult.status === 'refresh_warning') {
          toast.warning(CALENDAR_V2_POST_WRITE_REFRESH_WARNING);
        } else {
          toast.success('Часът е преместен.');
        }

        return {
          appointmentVisibleAfterRefresh:
            syncResult.status === 'synced'
              ? shouldKeepCalendarV2SelectedBookingAfterRefresh(
                  syncResult.refreshResult.data?.appointments,
                  appointmentId,
                )
              : undefined,
          syncStatus: syncResult.status,
        };
      } catch (error) {
        const message = getCalendarV2ActionErrorMessage(error, 'reschedule_booking');
        toast.error(message);
        throw new Error(message);
      }
    },
    [isSampleMode, queryClient, refetchCalendarBoard],
  );

  const headerControls = (
    <div className="inline-flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => setCurrentDate((date) => addDays(date, -1))}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        aria-label="Предишен ден"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={format(currentDate, 'yyyy-MM-dd')}
        onChange={(event) => {
          if (!event.target.value) return;
          setCurrentDate(startOfDay(new Date(`${event.target.value}T12:00:00`)));
        }}
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-slate-500"
      />
      <button
        type="button"
        onClick={() => setCurrentDate((date) => addDays(date, 1))}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        aria-label="Следващ ден"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setCurrentDate(startOfDay(new Date()))}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Днес
      </button>
      {!isSampleMode && (
        <button
          type="button"
          onClick={() =>
            setBookingPrefill({
              date: format(currentDate, 'yyyy-MM-dd'),
              staffId: defaultStaffId,
              preferredSlot: '',
            })
          }
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-black text-white shadow-sm transition hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Нов час
        </button>
      )}
    </div>
  );

  if (error && !isSampleMode) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-slate-500">{modeNotice}</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Не успяхме да заредим календара.</h2>
          <p className="mt-2 max-w-2xl font-semibold leading-6 text-slate-600">
            Опитайте отново.
          </p>
          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {getCalendarV2ActionErrorMessage(error, 'board_load')}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void refetchCalendarBoard();
                void refetchWaitlist();
                void refetchServices();
              }}
              className="rounded-lg bg-slate-950 px-4 py-2.5 text-xs font-black text-white shadow-sm"
            >
              Опитайте отново
            </button>
          </div>
        </div>
      </section>
    );
  }

  const visibleAppointmentCount = activeProjection.calendarBlocks.filter(
    (block) => block.kind === 'appointment',
  ).length;
  const schedulerNotice = getSchedulerNotice({
    isInitialLoading: !isSampleMode && isInitialLoading,
    resourceCount: activeProjection.resources.length,
    appointmentCount: visibleAppointmentCount,
  });
  const toolbarStatusNote = isInitialLoading
    ? 'Зареждане на календара…'
    : isFetching
      ? 'Обновяване на календара…'
      : 'Календарът е готов.';
  const toolbarNote = isSampleMode ? (
    <>
      <span>Примерен ден · само преглед</span>
      <button
        type="button"
        onClick={backToRealData}
        className="ml-2 border-b border-slate-400 pb-0.5 text-[11px] font-black text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
      >
        Назад към реалните данни
      </button>
    </>
  ) : (
    toolbarStatusNote
  );

  return (
    <>
      <NativeSchedulerV2Spike
        date={currentDate}
        resources={activeProjection.resources}
        calendarBlocks={activeProjection.calendarBlocks}
        demandItems={activeProjection.demandItems}
        actionItems={activeProjection.actionItems}
        readOnly
        enableLocalPlacementPreview
        readOnlyNotice={modeNotice}
        schedulerNotice={schedulerNotice}
        toolbarEyebrow="Calendar V2"
        toolbarNote={toolbarNote}
        toolbarControls={headerControls}
        actionInboxSubtitle={actionInboxSubtitle}
        placementSave={{
          enabled: canSavePlacement,
          disabledReason: placementSaveDisabledReason,
          onSave: handleSavePlacement,
        }}
        manualBooking={{
          enabled: canCreateManualBooking,
          onOpen: handleOpenManualBooking,
          onBlockedPast: () => toast.error('Изберете бъдещ час.'),
          onUnavailable: () => toast.error('Този час не е наличен.'),
        }}
        confirmBooking={
          isSampleMode
            ? undefined
            : {
                enabled: true,
                onConfirm: handleConfirmBooking,
              }
        }
        cancelBooking={
          isSampleMode
            ? undefined
            : {
                enabled: true,
                onCancel: handleCancelBooking,
              }
        }
        rescheduleBooking={
          isSampleMode
            ? undefined
            : {
                enabled: true,
                onSave: handleRescheduleBooking,
              }
        }
      />

      <AdminBookingModal
        open={Boolean(bookingPrefill)}
        defaultDate={bookingPrefill?.date ?? format(currentDate, 'yyyy-MM-dd')}
        defaultStaffId={bookingPrefill?.staffId ?? defaultStaffId}
        preferredSlot={bookingPrefill?.preferredSlot ?? ''}
        onClose={() => setBookingPrefill(null)}
        onCreated={(_startAt, createdBooking) => {
          if (createdBooking) {
            void handleManualBookingCreated(createdBooking);
          }
        }}
      />
    </>
  );
}

function getAppointmentIdFromReschedulePath(path: string) {
  return path.split('/')[2] ?? '';
}

function mutationResultToAppointmentId(result: PlaceWaitlistEntryResponse) {
  return result.appointment?.id ?? result.id ?? null;
}

function isCalendarBoardRefreshUsable(
  result: {
    data?: {
      appointments?: unknown;
    };
    error?: unknown;
  },
) {
  return !result.error && Array.isArray(result.data?.appointments);
}

function isWaitlistRefreshUsable(
  result: {
    data?: unknown;
    error?: unknown;
  },
) {
  return !result.error && Array.isArray(result.data);
}

function doesCalendarV2BookingHaveStatusAfterRefresh(
  appointments: Array<{ id: string; status: string }> | undefined,
  appointmentId: string,
  status: string,
) {
  return appointments?.some((appointment) => appointment.id === appointmentId && appointment.status === status) ?? false;
}

function isCalendarV2RescheduleRefreshSynchronized(
  appointments: Array<{ id: string; start_at: string; staff_id: string | null }> | undefined,
  appointmentId: string,
  request: AppointmentRescheduleSaveRequest,
) {
  if (!appointments) return false;

  const refreshedAppointment = appointments.find((appointment) => appointment.id === appointmentId);
  if (!refreshedAppointment) return true;

  return (
    refreshedAppointment.start_at === request.payload.startAt &&
    refreshedAppointment.staff_id === request.payload.staffId
  );
}

function getSchedulerNotice({
  isInitialLoading,
  resourceCount,
  appointmentCount,
}: {
  isInitialLoading: boolean;
  resourceCount: number;
  appointmentCount: number;
}): NativeSchedulerNotice | null {
  if (isInitialLoading) {
    return {
      tone: 'loading',
      title: 'Зареждане на календара',
      message: 'Подготвяме данните за избрания ден.',
    };
  }

  if (resourceCount === 0) {
    return {
      tone: 'warning',
      title: 'Няма наличен персонал за тази дата',
      message: 'Добавете персонал, за да се покаже дневният график.',
    };
  }

  if (appointmentCount === 0) {
    return {
      tone: 'empty',
      title: 'Няма записани часове за тази дата.',
      message: 'Дневният график остава видим.',
    };
  }

  return null;
}
