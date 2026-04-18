'use client';

import { format, isToday } from 'date-fns';
import { bg } from 'date-fns/locale';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { MobileDragHud } from './mobile-drag-hud';
import { useMobileCalendarDrag, type MobilePlacementPreview } from './use-mobile-calendar-drag';

const CALENDAR_SLOT_MINUTES = 15;
const LONG_PRESS_DELAY_MS = 420;
const LONG_PRESS_MOVE_TOLERANCE_PX = 14;

type MoveTarget = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  staff_id: string;
  service_id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  staff_name: string;
  source: 'appointment' | 'request';
};

type WorkingHours = Record<string, { open: string; close: string; isOpen: boolean }>;

type StaffException = {
  id: string;
  staff_id: string;
  type: string;
  start_at: string;
  end_at: string;
  note: string | null;
};

type Appointment = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  owner_view_state?: string;
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
};

type StaffBoard = {
  id: string;
  name: string;
  color: string;
  working_hours: WorkingHours;
  dayAppointments: Appointment[];
  dayExceptions: StaffException[];
};

type CalendarZoom = 'compact' | 'comfortable' | 'precise';

type ResolveMovePlacement = (
  target: MoveTarget,
  startAt: string,
  staffId: string,
  options?: { allowCrossDay?: boolean },
) => {
  preview: MobilePlacementPreview;
  reason: string | null;
};

type MobileDayBoardProps = {
  currentDate: Date;
  staffMembers: StaffBoard[];
  calendarZoom: CalendarZoom;
  showUnavailable: boolean;
  selectedRecordId: string | null;
  touchMoveTarget: MoveTarget | null;
  touchMoveMode: 'gesture' | 'confirm' | null;
  dropPreview: MobilePlacementPreview;
  onPreviewChange: (preview: MobilePlacementPreview) => void;
  onStartGestureMove: (target: MoveTarget) => void;
  onCancelMove: () => void;
  onCommitMove: (target: MoveTarget, preview: NonNullable<MobilePlacementPreview>) => Promise<void> | void;
  onOpenBooking: (staffId: string, slotDate: Date) => void;
  onOpenDetails: (id: string, startAt: string) => void;
  onEditBlock: (block: StaffException) => void;
  onChangeDay: (nextDate: Date) => void;
  resolveMovePlacement: ResolveMovePlacement;
  renderAppointmentCardBody: (appointment: Appointment, height: number) => ReactNode;
  isSecondaryAppointment: (appointment: Appointment) => boolean;
  getAppointmentAccent: (appointment: Appointment) => string;
};

type ColumnRegistryEntry = {
  element: HTMLDivElement | null;
  staffId: string;
};

function getWorkingDayKey(value: Date) {
  const keys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return keys[value.getDay()] || 'mon';
}

function getMinuteOffset(value: string, startHour: number) {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes() - startHour * 60;
}

function getEventLayoutMetrics(
  startAt: string,
  endAt: string,
  startHour: number,
  pixelsPerHour: number,
  minimumHeight: number,
) {
  const startOffset = getMinuteOffset(startAt, startHour);
  const endOffset = getMinuteOffset(endAt, startHour);
  const top = Math.max((startOffset / 60) * pixelsPerHour, 0);
  const height = Math.max(((endOffset - startOffset) / 60) * pixelsPerHour, minimumHeight);

  return { top, height };
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

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getEventDurationMinutes(startAt?: string, endAt?: string) {
  if (!startAt || !endAt) return CALENDAR_SLOT_MINUTES;
  const duration = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
  return Math.max(duration || CALENDAR_SLOT_MINUTES, CALENDAR_SLOT_MINUTES);
}

function buildMobileDayRange(staffMembers: StaffBoard[], currentDate: Date) {
  const minutes: number[] = [];
  const dayKey = getWorkingDayKey(currentDate);

  for (const staffMember of staffMembers) {
    const schedule = staffMember.working_hours?.[dayKey];
    if (schedule?.isOpen) {
      const [openHour, openMinute] = schedule.open.split(':').map(Number);
      const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
      minutes.push(openHour * 60 + openMinute, closeHour * 60 + closeMinute);
    }

    for (const appointment of staffMember.dayAppointments) {
      const start = new Date(appointment.start_at);
      const end = new Date(appointment.end_at);
      minutes.push(start.getHours() * 60 + start.getMinutes(), end.getHours() * 60 + end.getMinutes());
    }

    for (const exception of staffMember.dayExceptions) {
      const start = new Date(exception.start_at);
      const end = new Date(exception.end_at);
      minutes.push(start.getHours() * 60 + start.getMinutes(), end.getHours() * 60 + end.getMinutes());
    }
  }

  if (!minutes.length) {
    return { startHour: 8, endHour: 20 };
  }

  const earliestMinute = Math.min(...minutes);
  const latestMinute = Math.max(...minutes);
  const startHour = Math.max(0, Math.floor(earliestMinute / 60));
  const endHour = Math.min(24, Math.max(Math.ceil(latestMinute / 60), startHour + 8));

  return { startHour, endHour };
}

function buildGridMetrics(
  range: { startHour: number; endHour: number },
  pixelsPerHour: number,
) {
  const slotHeight = pixelsPerHour / (60 / CALENDAR_SLOT_MINUTES);
  const height = (range.endHour - range.startHour) * pixelsPerHour;
  const slotCount = Math.max(
    1,
    (range.endHour - range.startHour) * (60 / CALENDAR_SLOT_MINUTES),
  );

  return {
    height,
    slotHeight,
    hourSlots: Array.from(
      { length: range.endHour - range.startHour + 1 },
      (_, index) => range.startHour + index,
    ),
    dropSlots: Array.from({ length: slotCount }, (_, index) => {
      const totalMinutes = range.startHour * 60 + index * CALENDAR_SLOT_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;

      return {
        key: `${hour}-${minute}`,
        top: index * slotHeight,
        label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      };
    }),
  };
}

export function MobileDayBoard({
  currentDate,
  staffMembers,
  calendarZoom,
  showUnavailable,
  selectedRecordId,
  touchMoveTarget,
  touchMoveMode,
  dropPreview,
  onPreviewChange,
  onStartGestureMove,
  onCancelMove,
  onCommitMove,
  onOpenBooking,
  onOpenDetails,
  onEditBlock,
  onChangeDay,
  resolveMovePlacement,
  renderAppointmentCardBody,
  isSecondaryAppointment,
  getAppointmentAccent,
}: MobileDayBoardProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const columnRegistryRef = useRef<Record<string, ColumnRegistryEntry>>({});
  const longPressTimeoutRef = useRef<number | null>(null);
  const touchPressRef = useRef<{
    target: MoveTarget;
    touchId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const suppressTapUntilRef = useRef(0);
  const [surfaceHeight, setSurfaceHeight] = useState<number | null>(null);

  const range = useMemo(
    () => buildMobileDayRange(staffMembers, currentDate),
    [currentDate, staffMembers],
  );
  const pixelsPerHour = calendarZoom === 'compact' ? 74 : calendarZoom === 'precise' ? 104 : 88;
  const grid = useMemo(() => buildGridMetrics(range, pixelsPerHour), [pixelsPerHour, range]);
  const nowIndicatorOffset = useMemo(() => {
    if (!isToday(currentDate)) return null;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = range.startHour * 60;
    const endMinutes = range.endHour * 60;
    if (minutes < startMinutes || minutes > endMinutes) return null;
    return ((minutes - startMinutes) / 60) * pixelsPerHour;
  }, [currentDate, pixelsPerHour, range.endHour, range.startHour]);
  const gestureDurationMinutes = useMemo(
    () => getEventDurationMinutes(touchMoveTarget?.start_at, touchMoveTarget?.end_at),
    [touchMoveTarget?.end_at, touchMoveTarget?.start_at],
  );

  const clearLongPressTimer = () => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const resetLongPressGesture = () => {
    clearLongPressTimer();
    touchPressRef.current = null;
  };

  const registerCalendarColumn =
    (key: string, staffId: string) =>
    (node: HTMLDivElement | null) => {
      if (!node) {
        delete columnRegistryRef.current[key];
        return;
      }

      columnRegistryRef.current[key] = {
        element: node,
        staffId,
      };
    };

  const resolvePlacementFromClientPoint = (
    target: MoveTarget,
    clientX: number,
    clientY: number,
  ): MobilePlacementPreview => {
    for (const entry of Object.values(columnRegistryRef.current)) {
      const rect = entry.element?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) {
        continue;
      }

      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        continue;
      }

      const relativeY = Math.min(Math.max(clientY - rect.top, 0), Math.max(rect.height - 1, 0));
      const slotIndex = Math.min(Math.floor(relativeY / grid.slotHeight), grid.dropSlots.length - 1);
      const totalMinutes = range.startHour * 60 + slotIndex * CALENDAR_SLOT_MINUTES;
      const nextStart = new Date(currentDate);
      nextStart.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);

      return resolveMovePlacement(target, nextStart.toISOString(), entry.staffId).preview;
    }

    return null;
  };

  const {
    beginGestureDrag,
    dragPoint,
    candidateStartAt,
    candidateStaffId,
    invalidReason,
    isDraggingAppointment,
  } = useMobileCalendarDrag({
    currentDate,
    touchMoveTarget,
    touchMoveMode,
    scrollRootRef,
    surfaceRef: frameRef,
    columnRegistryRef,
    gridSlotHeight: grid.slotHeight,
    gridSlotCount: grid.dropSlots.length,
    rangeStartHour: range.startHour,
    resolveMovePlacement,
    onPreviewChange,
    onCommitMove,
    onCancelMove,
    onChangeDay,
  });

  useEffect(() => {
    return () => {
      resetLongPressGesture();
    };
  }, []);

  useEffect(() => {
    if (!isDraggingAppointment && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = 0;
    }
  }, [currentDate, isDraggingAppointment, range.endHour, range.startHour, staffMembers]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let frame = 0;

    const updateSurfaceHeight = () => {
      const node = frameRef.current;
      if (!node) {
        return;
      }

      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rect = node.getBoundingClientRect();
      const nextHeight = Math.max(Math.floor(viewportHeight - rect.top - 16), 440);
      setSurfaceHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    const scheduleUpdate = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(updateSurfaceHeight);
    };

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('resize', scheduleUpdate);
    window.visualViewport?.addEventListener('scroll', scheduleUpdate);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('resize', scheduleUpdate);
      window.visualViewport?.removeEventListener('scroll', scheduleUpdate);
    };
  }, [currentDate, showUnavailable, staffMembers.length, touchMoveMode]);

  const activeDragStaffName = useMemo(
    () =>
      (candidateStaffId
        ? staffMembers.find((staffMember) => staffMember.id === candidateStaffId)?.name
        : null) || touchMoveTarget?.staff_name || null,
    [candidateStaffId, staffMembers, touchMoveTarget?.staff_name],
  );

  return (
    <div
      ref={frameRef}
      className="relative flex min-h-[440px] flex-col overflow-hidden rounded-[30px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.98)_100%)] shadow-[0_24px_60px_rgba(15,23,42,0.08)]"
      style={surfaceHeight ? { height: `${surfaceHeight}px` } : undefined}
    >
      <div className="border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              {format(currentDate, 'EEEE, d MMMM', { locale: bg })}
            </p>
            <p className="mt-1 text-sm font-black text-gray-900">
              {isDraggingAppointment
                ? 'Плъзнете нагоре/надолу, а към ръба сменяте деня.'
                : 'Задръжте запис, за да започнете преместване.'}
            </p>
          </div>
          <div
            className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] ${
              isDraggingAppointment
                ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {isDraggingAppointment ? 'Плъзгане' : 'Докосване'}
          </div>
        </div>
      </div>

      <div
        ref={scrollRootRef}
        className="flex-1 space-y-4 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom,0px)+28px)] pt-3"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
          touchAction: isDraggingAppointment ? 'none' : 'pan-y',
        }}
      >
        {staffMembers.map((staffMember) => {
          const dayKey = getWorkingDayKey(currentDate);
          const schedule = staffMember.working_hours?.[dayKey];
          const overlays: Array<{
            id?: string;
            top: number;
            height: number;
            label: string;
            block?: StaffException;
            kind: 'closed' | 'exception';
          }> = [];

          if (showUnavailable) {
            if (!schedule?.isOpen) {
              overlays.push({
                top: 0,
                height: grid.height,
                label: 'Почивен ден',
                kind: 'closed',
              });
            } else {
              const [openHour, openMinute] = schedule.open.split(':').map(Number);
              const [closeHour, closeMinute] = schedule.close.split(':').map(Number);
              const openOffset = ((openHour * 60 + openMinute - range.startHour * 60) / 60) * pixelsPerHour;
              const closeOffset = ((closeHour * 60 + closeMinute - range.startHour * 60) / 60) * pixelsPerHour;

              if (openOffset > 0) {
                overlays.push({
                  top: 0,
                  height: openOffset,
                  label: 'Извън работно време',
                  kind: 'closed',
                });
              }

              if (closeOffset < grid.height) {
                overlays.push({
                  top: Math.max(closeOffset, 0),
                  height: Math.max(grid.height - closeOffset, 0),
                  label: 'Извън работно време',
                  kind: 'closed',
                });
              }
            }

            for (const exception of staffMember.dayExceptions) {
              const top = Math.max((getMinuteOffset(exception.start_at, range.startHour) / 60) * pixelsPerHour, 0);
              const bottom = Math.min((getMinuteOffset(exception.end_at, range.startHour) / 60) * pixelsPerHour, grid.height);
              overlays.push({
                id: exception.id,
                top,
                height: Math.max(bottom - top, 36),
                label: exception.note || 'Блокиран интервал',
                block: exception,
                kind: 'exception',
              });
            }
          }

          return (
            <div key={staffMember.id} className="rounded-[26px] border border-white/80 bg-white/95 p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-full text-xs font-black text-white shadow-sm"
                  style={{ backgroundColor: staffMember.color || 'var(--color-primary)' }}
                >
                  {getInitials(staffMember.name)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-900">{staffMember.name}</p>
                  <p className="text-xs text-gray-500">{staffMember.dayAppointments.length} записа за деня</p>
                </div>
              </div>

              <div className="grid grid-cols-[52px_minmax(0,1fr)]">
                <div className="relative border-r border-gray-100 bg-gray-50/60" style={{ height: `${grid.height}px` }}>
                  {grid.hourSlots.slice(0, -1).map((hour) => {
                    const top = (hour - range.startHour) * pixelsPerHour;
                    return (
                      <div key={`${staffMember.id}-hour-${hour}`}>
                        <div className="absolute left-0 right-0 border-t border-dashed border-gray-200" style={{ top: `${top}px` }} />
                        <div className="absolute left-0 top-0 -translate-y-1/2 px-2 text-[11px] font-semibold text-gray-400" style={{ top: `${top}px` }}>
                          {String(hour).padStart(2, '0')}:00
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  data-calendar-column={`mobile-${staffMember.id}`}
                  ref={registerCalendarColumn(`mobile-${staffMember.id}`, staffMember.id)}
                  className="relative select-none bg-white/80"
                  style={{
                    height: `${grid.height}px`,
                    touchAction: isDraggingAppointment ? 'none' : 'pan-y',
                  }}
                  onClick={(event) => {
                    if (Date.now() < suppressTapUntilRef.current) return;

                    if (touchMoveTarget && touchMoveMode === 'confirm') {
                      const preview = resolvePlacementFromClientPoint(
                        touchMoveTarget,
                        event.clientX,
                        event.clientY,
                      );
                      onPreviewChange(preview);
                      return;
                    }

                    if (touchMoveTarget) {
                      return;
                    }

                    const rect = event.currentTarget.getBoundingClientRect();
                    const relativeY = Math.min(Math.max(event.clientY - rect.top, 0), Math.max(rect.height - 1, 0));
                    const slotIndex = Math.min(Math.floor(relativeY / grid.slotHeight), grid.dropSlots.length - 1);
                    const totalMinutes = range.startHour * 60 + slotIndex * CALENDAR_SLOT_MINUTES;
                    const slotDate = new Date(currentDate);
                    slotDate.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
                    onOpenBooking(staffMember.id, slotDate);
                  }}
                >
                  {overlays.map((overlay, index) => (
                    <div
                      key={overlay.id || `${staffMember.id}-overlay-${index}`}
                      className={`absolute left-0 right-0 z-0 border-y ${
                        overlay.kind === 'exception' ? 'border-slate-300/70' : 'border-gray-200/80'
                      }`}
                      style={{
                        top: `${overlay.top}px`,
                        height: `${overlay.height}px`,
                        background:
                          overlay.kind === 'exception'
                            ? 'repeating-linear-gradient(-45deg, rgba(148,163,184,0.14), rgba(148,163,184,0.14) 6px, rgba(148,163,184,0.05) 6px, rgba(148,163,184,0.05) 12px)'
                            : 'rgba(148,163,184,0.08)',
                      }}
                    >
                      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-500 shadow-sm">
                        {overlay.label}
                      </span>
                      {overlay.block && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (overlay.block) {
                              onEditBlock(overlay.block);
                            }
                          }}
                          className="absolute right-2 top-2 rounded-full border border-white/80 bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm"
                        >
                          Редактирай
                        </button>
                      )}
                    </div>
                  ))}

                  {grid.dropSlots.map((slot) => {
                    const [, minute] = slot.label.split(':').map(Number);
                    return (
                      <div
                        key={`${staffMember.id}-line-${slot.key}`}
                        className={`absolute left-0 right-0 ${minute === 0 ? 'border-t border-gray-100' : 'border-t border-dashed border-gray-100/80'}`}
                        style={{ top: `${slot.top}px` }}
                      />
                    );
                  })}

                  {touchMoveTarget &&
                  dropPreview?.staffId === staffMember.id &&
                  (() => {
                    const metrics = getEventLayoutMetrics(
                      dropPreview.startAt,
                      new Date(
                        new Date(dropPreview.startAt).getTime() +
                          (new Date(touchMoveTarget.end_at).getTime() - new Date(touchMoveTarget.start_at).getTime()),
                      ).toISOString(),
                      range.startHour,
                      pixelsPerHour,
                      10,
                    );
                    return (
                      <div
                        className="pointer-events-none absolute left-2 right-2 z-[2] rounded-2xl border-2 border-[var(--color-primary)] bg-[var(--color-primary)]/14 shadow-[0_10px_30px_rgba(79,70,229,0.18)]"
                        style={{ top: `${metrics.top}px`, height: `${metrics.height}px` }}
                      >
                        <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[10px] font-bold text-[var(--color-primary)] shadow-sm">
                          {format(new Date(dropPreview.startAt), 'HH:mm')}
                        </span>
                      </div>
                    );
                  })()}

                  {nowIndicatorOffset !== null && (
                    <div
                      className="absolute left-0 right-0 z-[1] border-t-2 border-rose-400"
                      style={{ top: `${nowIndicatorOffset}px` }}
                    >
                      <span className="absolute -left-2 -top-2 h-4 w-4 rounded-full border-2 border-white bg-rose-500 shadow" />
                    </div>
                  )}

                  {staffMember.dayAppointments.map((appointment) => {
                    const metrics = getEventLayoutMetrics(
                      appointment.start_at,
                      appointment.end_at,
                      range.startHour,
                      pixelsPerHour,
                      10,
                    );
                    const isSecondary = isSecondaryAppointment(appointment);
                    const accent = getAppointmentAccent(appointment);
                    const surface = isSecondary
                      ? 'rgba(248,250,252,0.94)'
                      : colorWithAlpha(accent, '18', 'rgba(14, 165, 233, 0.1)');
                    const isDragOrigin =
                      isDraggingAppointment &&
                      touchMoveTarget?.id === appointment.id &&
                      touchMoveTarget?.source === 'appointment';
                    const canDragAppointment = !['completed', 'cancelled', 'no_show'].includes(appointment.status);

                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        onClick={(event) => {
                          if (Date.now() < suppressTapUntilRef.current) {
                            return;
                          }
                          event.stopPropagation();
                          onOpenDetails(appointment.id, appointment.start_at);
                        }}
                        onTouchStart={(event) => {
                          if (touchMoveTarget || !canDragAppointment) {
                            return;
                          }

                          const touch = event.touches[0];
                          if (!touch) return;

                          resetLongPressGesture();
                          touchPressRef.current = {
                            target: {
                              id: appointment.id,
                              start_at: appointment.start_at,
                              end_at: appointment.end_at,
                              status: appointment.status,
                              staff_id: appointment.staff_id || staffMember.id,
                              service_id: appointment.service_id || '',
                              client_name: appointment.client_name || '',
                              client_phone: appointment.client_phone || '',
                              service_name: appointment.service_name || '',
                              staff_name: appointment.staff_name || staffMember.name,
                              source: 'appointment',
                            },
                            touchId: touch.identifier,
                            startX: touch.clientX,
                            startY: touch.clientY,
                            moved: false,
                          };

                          longPressTimeoutRef.current = window.setTimeout(() => {
                            const gesture = touchPressRef.current;
                            if (!gesture || gesture.target.id !== appointment.id || gesture.moved) {
                              return;
                            }

                            suppressTapUntilRef.current = Date.now() + 450;
                            const initialPreview =
                              resolveMovePlacement(
                                gesture.target,
                                gesture.target.start_at,
                                gesture.target.staff_id,
                                { allowCrossDay: true },
                              ).preview || {
                                staffId: gesture.target.staff_id,
                                startAt: gesture.target.start_at,
                              };
                            onPreviewChange(initialPreview);
                            beginGestureDrag({
                              touchId: gesture.touchId,
                              startX: gesture.startX,
                              startY: gesture.startY,
                            });
                            touchPressRef.current = null;
                            onStartGestureMove(gesture.target);
                            longPressTimeoutRef.current = null;
                          }, LONG_PRESS_DELAY_MS);
                        }}
                        onTouchMove={(event) => {
                          const gesture = touchPressRef.current;
                          if (!gesture) return;

                          const touch =
                            Array.from(event.touches).find((entry) => entry.identifier === gesture.touchId) ||
                            event.touches[0];
                          if (!touch) return;

                          const distance = Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY);
                          if (distance < LONG_PRESS_MOVE_TOLERANCE_PX) {
                            return;
                          }

                          gesture.moved = true;
                          resetLongPressGesture();
                        }}
                        onTouchEnd={resetLongPressGesture}
                        onTouchCancel={resetLongPressGesture}
                        className={`absolute left-2 right-2 z-[2] overflow-hidden rounded-2xl border px-3 py-2 text-left shadow-sm select-none ${
                          selectedRecordId === appointment.id ? 'ring-2 ring-[var(--color-primary)]/20' : ''
                        } ${isSecondary ? 'opacity-45 saturate-50' : ''} ${
                          isDragOrigin ? 'opacity-30 saturate-50' : ''
                        }`}
                        style={{
                          top: `${metrics.top}px`,
                          height: `${metrics.height}px`,
                          borderColor: colorWithAlpha(
                            accent,
                            isSecondary ? '2A' : isDragOrigin ? '38' : '50',
                            'rgba(148, 163, 184, 0.35)',
                          ),
                          backgroundColor: surface,
                          borderStyle: isSecondary || isDragOrigin ? 'dashed' : 'solid',
                          WebkitTouchCallout: 'none',
                          touchAction: touchMoveTarget ? 'none' : 'manipulation',
                        }}
                      >
                        {renderAppointmentCardBody(appointment, metrics.height)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <MobileDragHud
        visible={isDraggingAppointment}
        target={touchMoveTarget}
        dragPoint={dragPoint}
        preview={dropPreview}
        candidateStartAt={candidateStartAt}
        candidateStaffName={activeDragStaffName}
        invalidReason={invalidReason}
      />

      {isDraggingAppointment && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-[24px] border border-white/80 bg-white/92 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Ден и таймлайн</p>
              <p className="mt-1 text-sm font-bold text-gray-900">
                Плъзнете нагоре/надолу за час, към левия или десния ръб за ден.
              </p>
            </div>
            <div className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1.5 text-[10px] font-bold text-[var(--color-primary)]">
              {gestureDurationMinutes} мин
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
