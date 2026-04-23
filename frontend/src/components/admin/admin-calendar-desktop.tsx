'use client';

import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { Check, ChevronLeft, ChevronRight, GripVertical, Loader2, Plus } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type {
  Appointment,
  CalendarBoardStaff,
  CalendarDropPreview,
  CalendarViewMode,
  StaffException,
} from './calendar-model';
import {
  buildAppointmentLanes,
  buildExceptionBlocks,
  colorWithAlpha,
  formatTimeLabel,
  getEventLayoutMetrics,
  getStatusTone,
  getWorkingDayKey,
  isCancelledCalendarItem,
  isRequestOwnerState,
  sortByStartAt,
} from './calendar-model';

type DayColumn = {
  staff: CalendarBoardStaff;
  appointments: Appointment[];
  exceptions: StaffException[];
};

type WeekRow = {
  day: Date;
  appointments: Appointment[];
};

type AdminCalendarDesktopProps = {
  currentDate: Date;
  calendarTitle: string;
  view: CalendarViewMode;
  staffFilter: string;
  staffList: CalendarBoardStaff[];
  dayColumns: DayColumn[];
  weekRows: WeekRow[];
  calendarRange: { startHour: number; endHour: number };
  gridMetrics: {
    height: number;
    slotHeight: number;
    hourSlots: number[];
    dropSlots: Array<{ key: string; top: number; label: string }>;
  };
  pixelsPerHour: number;
  isLoading: boolean;
  previewLabel: string | null;
  dropPreview: CalendarDropPreview;
  activeDragDurationMinutes: number | null;
  requestsPanel: ReactNode;
  onShiftDate: (direction: 'prev' | 'next') => void;
  onJumpToToday: () => void;
  onPickDate: (value: string) => void;
  onChangeView: (view: CalendarViewMode) => void;
  onChangeStaffFilter: (staffId: string) => void;
  onCreateAppointment: () => void;
  onOpenBookingAtSlot: (day: Date, staffId: string, preferredSlot?: string) => void;
  onOpenDetails: (appointmentId: string) => void;
  onConfirmAppointment: (appointmentId: string) => void;
  onStartAppointmentDrag: (event: ReactPointerEvent<HTMLButtonElement>, appointment: Appointment) => void;
  registerColumn: (key: string, staffId: string, day: Date) => (node: HTMLDivElement | null) => void;
};

export function AdminCalendarDesktop({
  currentDate,
  calendarTitle,
  view,
  staffFilter,
  staffList,
  dayColumns,
  weekRows,
  calendarRange,
  gridMetrics,
  pixelsPerHour,
  isLoading,
  previewLabel,
  dropPreview,
  activeDragDurationMinutes,
  requestsPanel,
  onShiftDate,
  onJumpToToday,
  onPickDate,
  onChangeView,
  onChangeStaffFilter,
  onCreateAppointment,
  onOpenBookingAtSlot,
  onOpenDetails,
  onConfirmAppointment,
  onStartAppointmentDrag,
  registerColumn,
}: AdminCalendarDesktopProps) {
  return (
    <div className="flex min-h-full flex-col gap-4">
      <section className="rounded-[30px] border border-white/70 bg-white/92 px-4 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => onShiftDate('prev')}
              className="rounded-full px-3 py-2 text-slate-600 transition-colors hover:bg-white"
              aria-label="Предишен период"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onJumpToToday}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
            >
              Днес
            </button>
            <button
              type="button"
              onClick={() => onShiftDate('next')}
              className="rounded-full px-3 py-2 text-slate-600 transition-colors hover:bg-white"
              aria-label="Следващ период"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <label className="inline-flex min-w-0 items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            <input
              type="date"
              value={format(currentDate, 'yyyy-MM-dd')}
              onChange={(event) => onPickDate(event.target.value)}
              className="w-[150px] bg-transparent outline-none"
            />
          </label>

          <div className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
            {calendarTitle}
          </div>

          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
            {(['day', 'week'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChangeView(option)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  view === option ? 'bg-slate-900 text-white' : 'text-slate-600'
                }`}
              >
                {option === 'day' ? 'Ден' : 'Седмица'}
              </button>
            ))}
          </div>

          <select
            value={staffFilter}
            onChange={(event) => onChangeStaffFilter(event.target.value)}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none"
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
            onClick={onCreateAppointment}
            className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Нова резервация
          </button>
        </div>
      </section>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-h-0 overflow-hidden rounded-[34px] border border-white/70 bg-white/95 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {view === 'day' ? 'Основен изглед' : 'Седмичен преглед'}
              </p>
              <h2 className="mt-1 text-lg font-black text-slate-900">{calendarTitle}</h2>
            </div>
            <div className="rounded-full border px-4 py-2 text-sm font-semibold">
              {previewLabel ? (
                <span className="text-emerald-700">{previewLabel}</span>
              ) : (
                <span className="text-slate-500">
                  {view === 'day'
                    ? 'Дръжката мести, докосването отваря.'
                    : 'Седмицата е само за бърз преглед.'}
                </span>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="flex min-h-[740px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : view === 'day' ? (
            <div className="flex h-[calc(100dvh-220px)] min-h-[720px] overflow-hidden">
              <div className="sticky left-0 z-20 w-[82px] shrink-0 border-r border-slate-200 bg-white">
                <div className="sticky top-0 border-b border-slate-200 bg-white px-3 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
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
                <div
                  className="grid min-w-[840px]"
                  style={{ gridTemplateColumns: `repeat(${Math.max(dayColumns.length, 1)}, minmax(280px, 1fr))` }}
                >
                  {dayColumns.map(({ staff, appointments, exceptions }) => {
                    const overlays = buildExceptionBlocks(
                      staff.working_hours?.[getWorkingDayKey(currentDate)],
                      exceptions,
                      currentDate,
                      gridMetrics.height,
                      calendarRange.startHour,
                      pixelsPerHour,
                    );
                    const layouts = buildAppointmentLanes(appointments);

                    return (
                      <div key={staff.id} className="border-r border-slate-200 last:border-r-0">
                        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: staff.color || '#0f172a' }}
                                />
                                <p className="truncate text-sm font-black text-slate-900">{staff.name}</p>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">{appointments.length} записа</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onOpenBookingAtSlot(currentDate, staff.id)}
                              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
                            >
                              Нов час
                            </button>
                          </div>
                        </div>

                        <div
                          ref={registerColumn(`desktop-${staff.id}`, staff.id, currentDate)}
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

                          {gridMetrics.dropSlots.map((slot) => (
                            <button
                              key={`${staff.id}-${slot.key}`}
                              type="button"
                              onClick={() => {
                                const [hour, minute] = slot.key.split('-').map(Number);
                                const nextStart = new Date(currentDate);
                                nextStart.setHours(hour, minute, 0, 0);
                                onOpenBookingAtSlot(currentDate, staff.id, format(nextStart, 'HH:mm'));
                              }}
                              className="absolute inset-x-0 z-[1] border-t border-transparent hover:bg-[rgba(15,23,42,0.03)]"
                              style={{ top: `${slot.top}px`, height: `${gridMetrics.slotHeight}px` }}
                            >
                              <span className="sr-only">{slot.label}</span>
                            </button>
                          ))}

                          {overlays.map((overlay) => (
                            <div
                              key={overlay.id || `${staff.id}-${overlay.label}-${overlay.top}`}
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

                          {dropPreview?.staffId === staff.id && activeDragDurationMinutes != null && (
                            <div
                              className="absolute left-2 right-2 z-[6] rounded-[24px] border-2 border-dashed border-emerald-500 bg-emerald-100/70"
                              style={{
                                top: `${getEventLayoutMetrics(
                                  dropPreview.startAt,
                                  new Date(
                                    new Date(dropPreview.startAt).getTime() + activeDragDurationMinutes * 60 * 1000,
                                  ).toISOString(),
                                  calendarRange.startHour,
                                  pixelsPerHour,
                                  52,
                                ).top}px`,
                                height: `${Math.max((activeDragDurationMinutes / 60) * pixelsPerHour, 52)}px`,
                              }}
                            />
                          )}

                          {sortByStartAt(appointments).map((appointment) => {
                            const metrics = getEventLayoutMetrics(
                              appointment.start_at,
                              appointment.end_at,
                              calendarRange.startHour,
                              pixelsPerHour,
                              74,
                            );
                            const lane = layouts.get(appointment.id);
                            const laneCount = lane?.laneCount ?? 1;
                            const laneWidth = `calc((100% - ${(laneCount + 1) * 10}px) / ${laneCount})`;
                            const left = `calc(10px + ${(lane?.lane ?? 0)} * (${laneWidth} + 10px))`;
                            const tone = getStatusTone(appointment);
                            const isSecondary = appointment.status === 'completed' || isCancelledCalendarItem(appointment);
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
                                  borderColor: colorWithAlpha(accent, isSecondary ? '33' : '55', '#cbd5e1'),
                                  background: isSecondary
                                    ? 'rgba(248,250,252,0.92)'
                                    : isRequestOwnerState(appointment)
                                      ? 'linear-gradient(180deg, rgba(255,251,235,0.98) 0%, rgba(255,247,237,0.98) 100%)'
                                      : colorWithAlpha(accent, '12', 'rgba(255,255,255,0.96)'),
                                  opacity: isSecondary ? 0.7 : 1,
                                }}
                              >
                                <div className="flex h-full flex-col px-3 py-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                        {formatTimeLabel(appointment.start_at)} - {formatTimeLabel(appointment.end_at)}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => onOpenDetails(appointment.id)}
                                        className="mt-1 w-full truncate text-left text-sm font-black text-slate-900"
                                      >
                                        {appointment.client_name}
                                      </button>
                                      <p className="mt-1 truncate text-xs text-slate-600">{appointment.service_name}</p>
                                    </div>
                                    {isRequestOwnerState(appointment) && (
                                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold ${tone.chip}`}>
                                        {appointment.owner_view_label || tone.label}
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-auto flex items-center gap-2 pt-3">
                                    {!isCancelledCalendarItem(appointment) && (
                                      <button
                                        type="button"
                                        onPointerDown={(event) => onStartAppointmentDrag(event, appointment)}
                                        className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white/92 text-slate-500 touch-none"
                                        aria-label={`Премести часа на ${appointment.client_name}`}
                                      >
                                        <GripVertical className="h-4 w-4" />
                                      </button>
                                    )}
                                    {isRequestOwnerState(appointment) && (
                                      <button
                                        type="button"
                                        onClick={() => onConfirmAppointment(appointment.id)}
                                        className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-600 text-white"
                                        aria-label={`Потвърди часа на ${appointment.client_name}`}
                                      >
                                        <Check className="h-4 w-4" />
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
            <div className="h-[calc(100dvh-220px)] min-h-[720px] overflow-auto px-5 py-5">
              <div className="grid min-w-[980px] gap-4 xl:grid-cols-7">
                {weekRows.map((row) => (
                  <div key={row.day.toISOString()} className="rounded-[28px] border border-slate-200 bg-slate-50/90">
                    <div className="sticky top-0 rounded-t-[28px] border-b border-slate-200 bg-slate-50/95 px-4 py-4 backdrop-blur">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {format(row.day, 'EEE', { locale: bg })}
                      </p>
                      <h3 className="mt-1 text-lg font-black text-slate-900">{format(row.day, 'd', { locale: bg })}</h3>
                    </div>
                    <div className="space-y-3 p-4">
                      {row.appointments.length ? (
                        sortByStartAt(row.appointments).map((appointment) => (
                          <button
                            key={appointment.id}
                            type="button"
                            onClick={() => onOpenDetails(appointment.id)}
                            className="w-full rounded-[24px] border border-slate-200 bg-white px-4 py-4 text-left shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900">{appointment.client_name}</p>
                                <p className="mt-1 truncate text-sm text-slate-600">{appointment.service_name}</p>
                                <p className="mt-2 text-xs text-slate-500">{appointment.staff_name}</p>
                              </div>
                              <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                                {formatTimeLabel(appointment.start_at)}
                              </span>
                            </div>
                          </button>
                        ))
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

        <aside className="min-h-0 overflow-hidden rounded-[34px] border border-white/70 bg-white/96 shadow-[0_28px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          {requestsPanel}
        </aside>
      </div>
    </div>
  );
}
