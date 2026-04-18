'use client';

import { format, isToday } from 'date-fns';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';

const CALENDAR_SLOT_MINUTES = 15;
const LONG_PRESS_DELAY_MS = 420;
const LONG_PRESS_MOVE_TOLERANCE_PX = 14;
const AUTO_SCROLL_EDGE_PX = 84;
const AUTO_SCROLL_MAX_STEP = 18;

type PlacementPreview = {
  staffId: string;
  startAt: string;
} | null;

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
) => {
  preview: PlacementPreview;
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
  dropPreview: PlacementPreview;
  onPreviewChange: (preview: PlacementPreview) => void;
  onStartGestureMove: (target: MoveTarget) => void;
  onCancelMove: () => void;
  onCommitMove: (target: MoveTarget, preview: NonNullable<PlacementPreview>) => Promise<void> | void;
  onOpenBooking: (staffId: string, slotDate: Date) => void;
  onOpenDetails: (id: string, startAt: string) => void;
  onEditBlock: (block: StaffException) => void;
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

  const rawStart = Math.floor(Math.min(...minutes) / 60) - 1;
  const rawEnd = Math.ceil(Math.max(...minutes) / 60) + 1;
  const startHour = Math.max(6, rawStart);
  const endHour = Math.min(23, Math.max(rawEnd, startHour + 10));

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
  resolveMovePlacement,
  renderAppointmentCardBody,
  isSecondaryAppointment,
  getAppointmentAccent,
}: MobileDayBoardProps) {
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
  const activeTouchGestureRef = useRef<{ touchId: number } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollVelocityRef = useRef(0);
  const lastTouchPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const suppressTapUntilRef = useRef(0);
  const invalidDropHintRef = useRef('Пуснете върху свободен 15-минутен слот.');
  const lastScrollSignatureRef = useRef<string | null>(null);

  const range = useMemo(
    () => buildMobileDayRange(staffMembers, currentDate),
    [currentDate, staffMembers],
  );
  const pixelsPerHour = calendarZoom === 'compact' ? 68 : calendarZoom === 'precise' ? 96 : 80;
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

  const stopAutoScroll = () => {
    autoScrollVelocityRef.current = 0;
    if (autoScrollFrameRef.current) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
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
  ): PlacementPreview => {
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

      const candidate = resolveMovePlacement(target, nextStart.toISOString(), entry.staffId);
      invalidDropHintRef.current = candidate.reason || 'Пуснете върху свободен 15-минутен слот.';
      return candidate.preview;
    }

    invalidDropHintRef.current = 'Пуснете върху свободен 15-минутен слот.';
    return null;
  };

  useEffect(() => {
    return () => {
      resetLongPressGesture();
      stopAutoScroll();
    };
  }, []);

  useEffect(() => {
    const scrollRoot = scrollRootRef.current;
    if (!scrollRoot || touchMoveMode === 'gesture') {
      return;
    }

    const signature = [
      format(currentDate, 'yyyy-MM-dd'),
      range.startHour,
      range.endHour,
      staffMembers.map((staffMember) => `${staffMember.id}:${staffMember.dayAppointments.length}`).join('|'),
    ].join('::');

    if (lastScrollSignatureRef.current === signature) {
      return;
    }

    lastScrollSignatureRef.current = signature;

    const firstAppointment = staffMembers
      .flatMap((staffMember) => staffMember.dayAppointments)
      .sort((left, right) => new Date(left.start_at).getTime() - new Date(right.start_at).getTime())[0];
    const focusDate = isToday(currentDate) ? new Date() : firstAppointment ? new Date(firstAppointment.start_at) : null;
    const focusMinutes = focusDate
      ? focusDate.getHours() * 60 + focusDate.getMinutes()
      : range.startHour * 60 + 120;
    const focusOffset = Math.max(((focusMinutes - range.startHour * 60) / 60) * pixelsPerHour, 0);
    const scrollTop = Math.max(focusOffset - scrollRoot.clientHeight * 0.28, 0);

    scrollRoot.scrollTop = Math.min(scrollTop, Math.max(scrollRoot.scrollHeight - scrollRoot.clientHeight, 0));
  }, [currentDate, pixelsPerHour, range.endHour, range.startHour, staffMembers, touchMoveMode]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !touchMoveTarget ||
      touchMoveTarget.source !== 'appointment' ||
      touchMoveMode !== 'gesture'
    ) {
      stopAutoScroll();
      lastTouchPointRef.current = null;
      return;
    }

    const trackedTouch = activeTouchGestureRef.current;
    if (!trackedTouch) {
      return;
    }

    const resolvePreviewForTouch = (touch: Touch) => {
      const preview = resolvePlacementFromClientPoint(touchMoveTarget, touch.clientX, touch.clientY);
      onPreviewChange(preview);
      return preview;
    };

    const tickAutoScroll = () => {
      const scrollRoot = scrollRootRef.current;
      const velocity = autoScrollVelocityRef.current;
      const lastTouchPoint = lastTouchPointRef.current;

      if (!scrollRoot || !velocity || !lastTouchPoint) {
        autoScrollFrameRef.current = null;
        return;
      }

      const previousScrollTop = scrollRoot.scrollTop;
      const maxScrollTop = Math.max(scrollRoot.scrollHeight - scrollRoot.clientHeight, 0);
      scrollRoot.scrollTop = Math.min(Math.max(previousScrollTop + velocity, 0), maxScrollTop);

      if (scrollRoot.scrollTop !== previousScrollTop) {
        const preview = resolvePlacementFromClientPoint(
          touchMoveTarget,
          lastTouchPoint.clientX,
          lastTouchPoint.clientY,
        );
        onPreviewChange(preview);
      }

      if (scrollRoot.scrollTop === previousScrollTop) {
        autoScrollFrameRef.current = null;
        return;
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(tickAutoScroll);
    };

    const syncAutoScroll = (clientY: number) => {
      const scrollRoot = scrollRootRef.current;
      if (!scrollRoot) {
        stopAutoScroll();
        return;
      }

      const rect = scrollRoot.getBoundingClientRect();
      let nextVelocity = 0;

      if (clientY < rect.top + AUTO_SCROLL_EDGE_PX) {
        const ratio = (rect.top + AUTO_SCROLL_EDGE_PX - clientY) / AUTO_SCROLL_EDGE_PX;
        nextVelocity = -Math.max(6, Math.round(ratio * AUTO_SCROLL_MAX_STEP));
      } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE_PX) {
        const ratio = (clientY - (rect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX;
        nextVelocity = Math.max(6, Math.round(ratio * AUTO_SCROLL_MAX_STEP));
      }

      autoScrollVelocityRef.current = nextVelocity;

      if (!nextVelocity) {
        if (autoScrollFrameRef.current) {
          window.cancelAnimationFrame(autoScrollFrameRef.current);
          autoScrollFrameRef.current = null;
        }
        return;
      }

      if (!autoScrollFrameRef.current) {
        autoScrollFrameRef.current = window.requestAnimationFrame(tickAutoScroll);
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = Array.from(event.touches).find((entry) => entry.identifier === trackedTouch.touchId);
      if (!touch) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      lastTouchPointRef.current = { clientX: touch.clientX, clientY: touch.clientY };
      syncAutoScroll(touch.clientY);
      resolvePreviewForTouch(touch);
    };

    const finishTouchGesture = async (touch: Touch | undefined, cancelled: boolean) => {
      stopAutoScroll();
      lastTouchPointRef.current = null;
      activeTouchGestureRef.current = null;

      if (!touch || cancelled) {
        onCancelMove();
        return;
      }

      suppressTapUntilRef.current = Date.now() + 450;
      const preview = resolvePreviewForTouch(touch);

      if (!preview) {
        toast.error(invalidDropHintRef.current);
        onCancelMove();
        return;
      }

      await onCommitMove(touchMoveTarget, preview);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === trackedTouch.touchId);
      if (!touch) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      void finishTouchGesture(touch, false);
    };

    const handleTouchCancel = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === trackedTouch.touchId);
      if (!touch) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      void finishTouchGesture(touch, true);
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchCancel, { passive: false });

    return () => {
      stopAutoScroll();
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [
    currentDate,
    grid.dropSlots.length,
    grid.slotHeight,
    onCancelMove,
    onCommitMove,
    onPreviewChange,
    pixelsPerHour,
    range.startHour,
    resolveMovePlacement,
    staffMembers,
    touchMoveMode,
    touchMoveTarget,
  ]);

  return (
    <div
      ref={scrollRootRef}
      className="space-y-4 overflow-y-auto pb-3"
      style={{
        maxHeight: 'min(72vh, calc(100dvh - 280px))',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
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
          <div key={staffMember.id} className="rounded-[24px] border border-white/70 bg-white/95 p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-black text-white"
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
                  touchAction: touchMoveMode === 'gesture' ? 'none' : 'pan-y',
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
                          onEditBlock(overlay.block!);
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
                        if (touchMoveTarget) {
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
                            staff_id: staffMember.id,
                            service_id: '',
                            client_name: '',
                            client_phone: '',
                            service_name: '',
                            staff_name: '',
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

                          activeTouchGestureRef.current = { touchId: gesture.touchId };
                          suppressTapUntilRef.current = Date.now() + 450;
                          const target: MoveTarget = {
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
                          };
                          const initialPreview =
                            resolveMovePlacement(target, target.start_at, target.staff_id).preview || {
                              staffId: target.staff_id,
                              startAt: target.start_at,
                            };
                          onPreviewChange(initialPreview);
                          onStartGestureMove(target);
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
                      } ${isSecondary ? 'opacity-45 saturate-50' : ''}`}
                      style={{
                        top: `${metrics.top}px`,
                        height: `${metrics.height}px`,
                        borderColor: colorWithAlpha(
                          accent,
                          isSecondary ? '2A' : '50',
                          'rgba(148, 163, 184, 0.35)',
                        ),
                        backgroundColor: surface,
                        borderStyle: isSecondary ? 'dashed' : 'solid',
                        WebkitTouchCallout: 'none',
                        touchAction: 'manipulation',
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
  );
}
