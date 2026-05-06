'use client';

import { useMemo, useState } from 'react';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useAdminCalendarBoardData } from '../../use-admin-calendar-board-data';
import { NativeSchedulerV2Spike } from '../native-scheduler-spike/NativeSchedulerV2Spike';
import type { NativeSchedulerNotice } from '../native-scheduler-spike/NativeSchedulerGrid';
import { buildCalendarV2RealDataProjection } from './calendar-v2-real-data-mappers';
import { CALENDAR_V2_READONLY_NOTICE } from './calendar-v2-readonly-actions';

export function CalendarV2RealDataAdapter() {
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));

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
  });

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

  if (error) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700 shadow-sm">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase text-slate-500">Calendar V2 Preview · Read-only</p>
          <h2 className="mt-2 text-xl font-black text-slate-950">Calendar data is unavailable.</h2>
          <p className="mt-2 max-w-2xl font-semibold leading-6 text-slate-600">
            The current admin calendar read did not complete. Fixture data is not shown on this production
            preview route.
          </p>
          <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
            {getErrorMessage(error)}
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
            <span className="text-xs font-bold text-slate-500">
              The current /admin calendar remains the default calendar.
            </span>
          </div>
        </div>
      </section>
    );
  }

  const hasSampleStaffNames = !isInitialLoading && hasSampleLikeStaffLabels(projection);
  const visibleAppointmentCount = projection.calendarBlocks.filter(
    (block) => block.kind === 'appointment',
  ).length;
  const schedulerNotice = getSchedulerNotice({
    isInitialLoading,
    resourceCount: projection.resources.length,
    appointmentCount: visibleAppointmentCount,
  });
  const toolbarStatusNote = isInitialLoading
    ? 'Reading from the current admin calendar.'
    : isFetching
      ? 'Refreshing current calendar reads.'
      : 'The current /admin calendar remains default.';
  const toolbarNote = hasSampleStaffNames
    ? `Sample staff names · ${toolbarStatusNote}`
    : toolbarStatusNote;

  return (
    <NativeSchedulerV2Spike
      date={currentDate}
      resources={projection.resources}
      calendarBlocks={projection.calendarBlocks}
      demandItems={projection.demandItems}
      actionItems={projection.actionItems}
      readOnly
      readOnlyNotice={CALENDAR_V2_READONLY_NOTICE}
      schedulerNotice={schedulerNotice}
      toolbarEyebrow="Calendar V2 Preview"
      toolbarNote={toolbarNote}
      toolbarControls={headerControls}
    />
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'The existing calendar read endpoint returned an unknown error.';
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
      title: 'Loading calendar data',
      message: 'Reading the current admin calendar.',
    };
  }

  if (resourceCount === 0) {
    return {
      tone: 'warning',
      title: 'No staff available for this date',
      message: 'Calendar V2 needs staff resources from the current calendar read before it can draw the day grid.',
    };
  }

  if (appointmentCount === 0) {
    return {
      tone: 'empty',
      title: 'No bookings scheduled for this date',
      message: 'The staff day grid stays visible for layout review.',
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
