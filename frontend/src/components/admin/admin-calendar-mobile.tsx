'use client';

import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type {
  Appointment,
  CalendarBoardStaff,
  CalendarDropPreview,
  CalendarViewMode,
  StaffException,
} from './calendar-model';
import {
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
} | null;

type WeekRow = {
  day: Date;
  appointments: Appointment[];
};

type AdminCalendarMobileProps = {
  currentDate: Date;
  calendarTitle: string;
  view: CalendarViewMode;
  selectedStaffId: string;
  staffList: CalendarBoardStaff[];
  dayColumn: DayColumn;
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
  isDragging: boolean;
  requestsCount: number;
  requestsContent: ReactNode;
  feedbackMessage: string | null;
  onShiftDate: (direction: 'prev' | 'next') => void;
  onJumpToToday: () => void;
  onPickDate: (value: string) => void;
  onChangeView: (view: CalendarViewMode) => void;
  onChangeStaff: (staffId: string) => void;
  onCreateAppointment: () => void;
  onOpenBookingAtSlot: (day: Date, staffId: string, preferredSlot?: string) => void;
  onOpenDetails: (appointmentId: string) => void;
  onConfirmAppointment: (appointmentId: string) => void;
  onMoveAppointment: (appointment: Appointment) => void;
  registerColumn: (key: string, staffId: string, day: Date) => (node: HTMLDivElement | null) => void;
};

export function AdminCalendarMobile({
  currentDate,
  calendarTitle,
  view,
  selectedStaffId,
  staffList,
  dayColumn,
  weekRows,
  calendarRange,
  gridMetrics,
  pixelsPerHour,
  isLoading,
  previewLabel,
  dropPreview,
  activeDragDurationMinutes,
  isDragging,
  requestsCount,
  requestsContent,
  feedbackMessage,
  onShiftDate,
  onJumpToToday,
  onPickDate,
  onChangeView,
  onChangeStaff,
  onCreateAppointment,
  onOpenBookingAtSlot,
  onOpenDetails,
  onConfirmAppointment,
  onMoveAppointment,
  registerColumn,
}: AdminCalendarMobileProps) {
  const [sheetExpanded, setSheetExpanded] = useState(false);

  useEffect(() => {
    if (isDragging) {
      setSheetExpanded(false);
    }
  }, [isDragging]);

  const sheetVisible = requestsCount > 0;
  const selectedStaff = staffList.find((staff) => staff.id === selectedStaffId) || dayColumn?.staff || null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 lg:hidden">
      <section className="rounded-[28px] border border-white/70 bg-white/94 px-4 py-4 shadow-[0_20px_54px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onShiftDate('prev')}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600"
            aria-label="Предишен ден"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <label className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
            <input
              type="date"
              value={format(currentDate, 'yyyy-MM-dd')}
              onChange={(event) => onPickDate(event.target.value)}
              className="w-full bg-transparent outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => onShiftDate('next')}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600"
            aria-label="Следващ ден"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onJumpToToday}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Днес
          </button>
          <div className="min-w-0 flex-1 rounded-full bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
            <span className="truncate">{calendarTitle}</span>
          </div>
          <button
            type="button"
            onClick={onCreateAppointment}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-white"
            aria-label="Нова резервация"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <select
            value={selectedStaffId}
            onChange={(event) => onChangeStaff(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 outline-none"
          >
            {staffList.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {(['day', 'week'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onChangeView(option)}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold ${
                  view === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                {option === 'day' ? 'Ден' : 'Седмица'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] border border-white/70 bg-white/96 shadow-[0_26px_70px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {selectedStaff?.name || 'График'}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {previewLabel ||
              feedbackMessage ||
              (view === 'day' ? 'Календарът остава основният фокус.' : 'Седмицата е само вторичен преглед.')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex min-h-[560px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : view === 'day' ? (
          dayColumn ? (
            <div
              className="min-h-0 flex-1 overflow-y-auto"
              style={{
                paddingBottom: sheetVisible ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)' : '24px',
                overscrollBehaviorY: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div className="grid grid-cols-[62px_minmax(0,1fr)]">
                <div className="sticky left-0 z-10 border-r border-slate-200 bg-white">
                  <div className="relative" style={{ height: gridMetrics.height }}>
                    {gridMetrics.hourSlots.slice(0, -1).map((hour) => (
                      <div
                        key={hour}
                        className="absolute inset-x-0 -translate-y-2 px-3 text-[11px] font-semibold text-slate-400"
                        style={{ top: `${(hour - calendarRange.startHour) * pixelsPerHour}px` }}
                      >
                        {String(hour).padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  ref={registerColumn(`mobile-${dayColumn.staff.id}`, dayColumn.staff.id, currentDate)}
                  className="relative"
                  style={{ height: gridMetrics.height }}
                >
                  {gridMetrics.hourSlots.slice(0, -1).map((hour) => (
                    <div
                      key={`${dayColumn.staff.id}-${hour}`}
                      className="absolute inset-x-0 border-t border-slate-100"
                      style={{ top: `${(hour - calendarRange.startHour) * pixelsPerHour}px` }}
                    />
                  ))}

                  {gridMetrics.dropSlots.map((slot) => (
                    <button
                      key={`${dayColumn.staff.id}-${slot.key}`}
                      type="button"
                      onClick={() => {
                        const [hour, minute] = slot.key.split('-').map(Number);
                        const nextStart = new Date(currentDate);
                        nextStart.setHours(hour, minute, 0, 0);
                        onOpenBookingAtSlot(currentDate, dayColumn.staff.id, format(nextStart, 'HH:mm'));
                      }}
                      className="absolute inset-x-0 z-[1] border-t border-transparent"
                      style={{ top: `${slot.top}px`, height: `${gridMetrics.slotHeight}px` }}
                    >
                      <span className="sr-only">{slot.label}</span>
                    </button>
                  ))}

                  {buildExceptionBlocks(
                    dayColumn.staff.working_hours?.[getWorkingDayKey(currentDate)],
                    dayColumn.exceptions,
                    currentDate,
                    gridMetrics.height,
                    calendarRange.startHour,
                    pixelsPerHour,
                  ).map((overlay) => (
                    <div
                      key={overlay.id || `${dayColumn.staff.id}-${overlay.label}-${overlay.top}`}
                      className={`absolute inset-x-2 z-[2] rounded-2xl border px-3 py-2 text-xs font-semibold ${
                        overlay.tone === 'blocked'
                          ? 'border-slate-300 bg-[repeating-linear-gradient(-45deg,rgba(148,163,184,0.2),rgba(148,163,184,0.2)_8px,rgba(241,245,249,0.95)_8px,rgba(241,245,249,0.95)_16px)] text-slate-700'
                          : 'border-slate-200 bg-slate-50/90 text-slate-500'
                      }`}
                      style={{ top: `${overlay.top}px`, minHeight: `${overlay.height}px` }}
                    >
                      {overlay.label}
                    </div>
                  ))}

                  {dropPreview?.staffId === dayColumn.staff.id && activeDragDurationMinutes != null && (
                    <div
                      className="absolute left-2 right-2 z-[6] rounded-[22px] border-2 border-dashed border-emerald-500 bg-emerald-100/70"
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

                  {sortByStartAt(dayColumn.appointments).map((appointment) => {
                    const metrics = getEventLayoutMetrics(
                      appointment.start_at,
                      appointment.end_at,
                      calendarRange.startHour,
                      pixelsPerHour,
                      78,
                    );
                    const tone = getStatusTone(appointment);
                    const accent = isRequestOwnerState(appointment)
                      ? tone.accent
                      : appointment.service_color || appointment.staff_color || '#0f172a';
                    const isSecondary = appointment.status === 'completed' || isCancelledCalendarItem(appointment);
                    const isCompact = metrics.height < 90;
                    const showService = metrics.height >= 68;

                    return (
                      <article
                        key={appointment.id}
                        className="absolute left-2 right-2 z-[5] overflow-hidden rounded-[24px] border shadow-[0_12px_28px_rgba(15,23,42,0.10)]"
                        style={{
                          top: `${metrics.top}px`,
                          height: `${metrics.height}px`,
                          borderColor: colorWithAlpha(accent, isSecondary ? '33' : '50', '#cbd5e1'),
                          background: isSecondary
                            ? 'rgba(248,250,252,0.92)'
                            : isRequestOwnerState(appointment)
                              ? 'linear-gradient(180deg, rgba(255,251,235,0.98) 0%, rgba(255,247,237,0.98) 100%)'
                              : colorWithAlpha(accent, '12', 'rgba(255,255,255,0.96)'),
                          opacity: isSecondary ? 0.72 : 1,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenDetails(appointment.id)}
                          className="absolute inset-0 rounded-[24px]"
                          aria-label={`Отвори детайли за часа на ${appointment.client_name}`}
                        />

                        <div className="relative z-[1] flex h-full flex-col px-3 py-3 pointer-events-none">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {formatTimeLabel(appointment.start_at)} - {formatTimeLabel(appointment.end_at)}
                              </p>
                              <p
                                className={`truncate font-black text-slate-900 ${
                                  isCompact ? 'mt-0.5 text-[13px] leading-4' : 'mt-1 text-sm'
                                }`}
                              >
                                {appointment.client_name}
                              </p>
                              {showService && (
                                <p className={`truncate text-slate-600 ${isCompact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'}`}>
                                  {appointment.service_name}
                                </p>
                              )}
                            </div>
                            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                              {!isCancelledCalendarItem(appointment) && (
                                <button
                                  type="button"
                                  onClick={() => onMoveAppointment(appointment)}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700"
                                >
                                  Премести
                                </button>
                              )}
                              {isRequestOwnerState(appointment) && (
                                <button
                                  type="button"
                                  onClick={() => onConfirmAppointment(appointment.id)}
                                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white"
                                  aria-label={`Потвърди часа на ${appointment.client_name}`}
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="px-4 py-12 text-center text-sm text-slate-500">Няма активен специалист за деня.</div>
          )
        ) : (
          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
            style={{
              paddingBottom: sheetVisible ? 'calc(env(safe-area-inset-bottom, 0px) + 96px)' : '24px',
              overscrollBehaviorY: 'contain',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div className="space-y-3">
              {weekRows.map((row) => (
                <div key={row.day.toISOString()} className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900">
                      {format(row.day, "EEEE, d MMMM", { locale: bg })}
                    </h3>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                      {row.appointments.length}
                    </span>
                  </div>
                  {row.appointments.length ? (
                    <div className="mt-3 space-y-2">
                      {sortByStartAt(row.appointments).slice(0, 4).map((appointment) => (
                        <button
                          key={appointment.id}
                          type="button"
                          onClick={() => onOpenDetails(appointment.id)}
                          className="w-full rounded-[18px] border border-slate-200 bg-white px-3 py-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-900">{appointment.client_name}</p>
                              <p className="mt-1 truncate text-sm text-slate-600">{appointment.service_name}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                              {formatTimeLabel(appointment.start_at)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-[18px] border border-dashed border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-500">
                      Няма записи
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {sheetVisible && (
        <div
          className={`fixed inset-x-0 bottom-0 z-30 rounded-t-[28px] border border-slate-200 bg-white/98 shadow-[0_-16px_48px_rgba(15,23,42,0.18)] backdrop-blur transition-transform duration-200 ${
            sheetExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-78px)]'
          }`}
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          <button
            type="button"
            onClick={() => setSheetExpanded((current) => !current)}
            className="flex w-full items-center justify-between px-5 py-4"
          >
            <div className="flex min-w-0 items-center gap-3 text-left">
              <div className="h-1.5 w-10 rounded-full bg-slate-300" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Заявки</p>
                <p className="mt-1 text-sm font-black text-slate-900">
                  {requestsCount} чакащи за поставяне или потвърждение
                </p>
              </div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
              <ChevronDown className={`h-4 w-4 transition-transform ${sheetExpanded ? 'rotate-180' : ''}`} />
            </div>
          </button>

          <div className="max-h-[56dvh] overflow-y-auto px-4 pb-4" style={{ overscrollBehaviorY: 'contain' }}>
            {requestsContent}
          </div>
        </div>
      )}
    </div>
  );
}
