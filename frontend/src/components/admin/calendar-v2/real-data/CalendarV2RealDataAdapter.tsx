'use client';

import { useMemo, useState } from 'react';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { bg } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { useAdminCalendarBoardData } from '../../use-admin-calendar-board-data';
import { NativeSchedulerV2Spike } from '../native-scheduler-spike/NativeSchedulerV2Spike';
import {
  buildCalendarV2RealDataProjection,
  getCalendarV2RealDataStatusLabel,
} from './calendar-v2-real-data-mappers';
import { CALENDAR_V2_READONLY_NOTICE } from './calendar-v2-readonly-actions';

export function CalendarV2RealDataAdapter() {
  const [currentDate, setCurrentDate] = useState(() => startOfDay(new Date()));
  const [showFixtureDemo, setShowFixtureDemo] = useState(false);

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
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700"
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
        className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
      />
      <button
        type="button"
        onClick={() => setCurrentDate((date) => addDays(date, 1))}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700"
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setCurrentDate(startOfDay(new Date()))}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Today
      </button>
    </div>
  );

  if (showFixtureDemo) {
    return (
      <NativeSchedulerV2Spike
        toolbarEyebrow="Calendar V2 fixture demo"
        readOnlyNotice="Fixture demo · local-only commands"
      />
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-rose-200 bg-white p-5 text-sm text-slate-700">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">
            Calendar V2 real-data adapter
          </p>
          <h2 className="mt-2 text-lg font-black text-slate-900">Could not load current admin calendar data.</h2>
          <p className="mt-2 font-semibold text-slate-600">{getErrorMessage(error)}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                void refetchCalendarBoard();
                void refetchWaitlist();
                void refetchServices();
              }}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white"
            >
              Retry read
            </button>
            <button
              type="button"
              onClick={() => setShowFixtureDemo(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
            >
              Show fixture demo
            </button>
          </div>
        </div>
      </section>
    );
  }

  const schedulerNotice = isInitialLoading
    ? 'Loading real admin calendar data...'
    : projection.resources.length === 0
      ? 'No staff resources were returned by the current calendar board.'
      : null;

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
      toolbarEyebrow="Calendar V2 real-data adapter"
      toolbarPills={[
        'Real data',
        getCalendarV2RealDataStatusLabel(projection),
        isFetching ? 'Refreshing' : 'Read-only',
      ]}
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
