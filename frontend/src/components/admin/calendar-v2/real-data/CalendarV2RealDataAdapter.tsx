'use client';

import { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { useAdminCalendarBoardData } from '../../use-admin-calendar-board-data';
import {
  NativeSchedulerV2Spike,
  type NativeSchedulerPlacementSaveResult,
} from '../native-scheduler-spike/NativeSchedulerV2Spike';
import type { NativeSchedulerNotice } from '../native-scheduler-spike/NativeSchedulerGrid';
import type { WaitlistPlacementSaveRequest } from '../native-scheduler-spike/native-scheduler-drag';
import { buildCalendarV2RealDataProjection } from './calendar-v2-real-data-mappers';
import { buildCalendarV2SampleDayProjection } from './calendar-v2-sample-day';

const ENABLE_CALENDAR_V2_PLACEMENT_SAVE =
  process.env.NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === 'true';
const CALENDAR_V2_READONLY_NOTICE = 'Calendar V2 · Read-only';
const CALENDAR_V2_PLACEMENT_SAVE_NOTICE = 'Calendar V2 · Request placement enabled';

type PlaceWaitlistEntryResponse = {
  id?: string;
  appointment?: {
    id?: string;
  };
};

export function CalendarV2RealDataAdapter() {
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isSampleMode = searchParams.get('sample') === '1';
  const showSampleDay = () => router.push(`${pathname}?sample=1`);
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
  const placementSaveDisabledReason =
    ENABLE_CALENDAR_V2_PLACEMENT_SAVE && isSampleMode
      ? 'Sample режимът не записва часове.'
      : 'Записването ще добавим в следващата стъпка';
  const modeNotice = canSavePlacement
    ? CALENDAR_V2_PLACEMENT_SAVE_NOTICE
    : CALENDAR_V2_READONLY_NOTICE;
  const actionInboxSubtitle = canSavePlacement
    ? 'Поставяне на заявки в графика'
    : isSampleMode
      ? 'Само преглед'
      : 'Само локален преглед';

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

  const handleSavePlacement = useCallback(
    async (request: WaitlistPlacementSaveRequest): Promise<NativeSchedulerPlacementSaveResult> => {
      if (!canSavePlacement) {
        throw new Error(placementSaveDisabledReason);
      }

      try {
        const result = await apiClient.post<PlaceWaitlistEntryResponse>(request.path, request.payload);

        await Promise.all([
          refetchCalendarBoard(),
          refetchWaitlist(),
          queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] }),
          queryClient.invalidateQueries({ queryKey: ['appointments-waitlist'] }),
          queryClient.invalidateQueries({ queryKey: ['appointment-context'] }),
        ]);

        toast.success('Часът е записан.');

        return {
          appointmentId: result.appointment?.id ?? result.id ?? null,
        };
      } catch (error) {
        const message = getPlacementSaveErrorMessage(error);
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

  const headerControls = (
    <div className="inline-flex min-w-0 items-center gap-2">
      <button
        type="button"
        onClick={() => setCurrentDate((date) => addDays(date, -1))}
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
        aria-label="Previous day"
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
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setCurrentDate(startOfDay(new Date()))}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Today
      </button>
    </div>
  );

  if (error && !isSampleMode) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-slate-500">{modeNotice}</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Calendar data is unavailable.</h2>
          <p className="mt-2 max-w-2xl font-semibold leading-6 text-slate-600">
            The current admin calendar read did not complete. Fixture data is not shown on the Calendar V2 route.
          </p>
          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {getApiErrorMessage(error, 'The existing calendar read endpoint returned an unknown error.')}
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
              Retry read
            </button>
            <button
              type="button"
              onClick={showSampleDay}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-950"
            >
              Show sample day
            </button>
            <span className="text-xs font-bold text-slate-500">
              Calendar V2 is the primary admin calendar.
            </span>
          </div>
        </div>
      </section>
    );
  }

  const hasSampleStaffNames = !isSampleMode && !isInitialLoading && hasSampleLikeStaffLabels(projection);
  const visibleAppointmentCount = activeProjection.calendarBlocks.filter(
    (block) => block.kind === 'appointment',
  ).length;
  const schedulerNotice = getSchedulerNotice({
    isInitialLoading: !isSampleMode && isInitialLoading,
    resourceCount: activeProjection.resources.length,
    appointmentCount: visibleAppointmentCount,
    showSampleDay: isSampleMode ? undefined : showSampleDay,
  });
  const toolbarStatusNote = isInitialLoading
    ? 'Reading from the current admin calendar.'
    : isFetching
      ? 'Refreshing current calendar reads.'
      : 'Calendar V2 is the primary admin calendar.';
  const toolbarNote = isSampleMode ? (
    <>
      <span>Sample day · Read-only</span>
      <button
        type="button"
        onClick={backToRealData}
        className="ml-2 border-b border-slate-400 pb-0.5 text-[11px] font-black text-slate-700 transition hover:border-slate-900 hover:text-slate-950"
      >
        Back to real data
      </button>
    </>
  ) : hasSampleStaffNames ? (
    `Sample staff names · ${toolbarStatusNote}`
  ) : (
    toolbarStatusNote
  );

  return (
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
    />
  );
}

function getApiErrorMessage(error: unknown, fallback: string) {
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

function getPlacementSaveErrorMessage(error: unknown) {
  const fallback = 'Не успяхме да запишем часа. Опитайте отново.';

  if (!axios.isAxiosError(error)) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const status = error.response?.status;
  const message = extractApiMessage(error);

  if (isRequestAlreadyHandledMessage(message)) {
    return 'Заявката вече е обработена.';
  }

  if (isPastSchedulingMessage(message)) {
    return 'Не може да запишете час в миналото.';
  }

  if (status === 409 && isConflictMessage(message)) {
    return 'Този час вече е зает.';
  }

  if (status === 400 || status === 404 || status === 409) {
    return 'Този час не е наличен.';
  }

  return fallback;
}

function extractApiMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return null;

  const message = error.response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) {
    return message.find((entry): entry is string => typeof entry === 'string') ?? null;
  }

  return null;
}

function isRequestAlreadyHandledMessage(message: string | null) {
  return Boolean(message?.toLocaleLowerCase('bg-BG').includes('заявката вече е обработена'));
}

function isConflictMessage(message: string | null) {
  const normalized = message?.toLocaleLowerCase('bg-BG') ?? '';
  return normalized.includes('зает') || normalized.includes('няма свободни места');
}

function isPastSchedulingMessage(message: string | null) {
  return Boolean(message?.toLocaleLowerCase('bg-BG').includes('миналото'));
}

function getSchedulerNotice({
  isInitialLoading,
  resourceCount,
  appointmentCount,
  showSampleDay,
}: {
  isInitialLoading: boolean;
  resourceCount: number;
  appointmentCount: number;
  showSampleDay?: () => void;
}): NativeSchedulerNotice | null {
  if (isInitialLoading) {
    return {
      tone: 'loading',
      title: 'Loading calendar data',
      message: 'Reading the current admin calendar.',
    };
  }

  if (resourceCount === 0) {
    return {
      tone: 'warning',
      title: 'No staff available for this date',
      message: 'Calendar V2 needs staff resources from the current calendar read before it can draw the day grid.',
      ...(showSampleDay ? { action: { label: 'Show sample day', onClick: showSampleDay } } : {}),
    };
  }

  if (appointmentCount === 0) {
    return {
      tone: 'empty',
      title: 'No bookings scheduled for this date',
      message: 'The staff day grid stays visible for layout review.',
      ...(showSampleDay ? { action: { label: 'Show sample day', onClick: showSampleDay } } : {}),
    };
  }

  return null;
}

function hasSampleLikeStaffLabels(projection: {
  resources: Array<{ name: string }>;
  calendarBlocks: Array<{
    kind: string;
    title: string;
    subtitle?: string | null;
    appointment?: {
      client: { name: string };
      service: { name: string };
      staff: { name?: string | null };
    } | null;
  }>;
  demandItems: Array<{
    client: { name: string };
    service: { name: string };
    preferredStaff?: { name?: string | null } | null;
  }>;
}) {
  const labels = [
    ...projection.resources.map((resource) => resource.name),
    ...projection.calendarBlocks.flatMap((block) => [
      block.kind === 'blocked_time' ? block.subtitle : undefined,
      block.appointment?.staff.name,
    ]),
    ...projection.demandItems.map((item) => item.preferredStaff?.name),
  ];

  return labels.some((label) => isSampleLikeLabel(label));
}

function isSampleLikeLabel(label: string | null | undefined) {
  if (!label) return false;
  return /\b(demo|fixture|sample)\b/i.test(label);
}
