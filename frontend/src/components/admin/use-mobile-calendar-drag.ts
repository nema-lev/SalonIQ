'use client';

import { addDays } from 'date-fns';
import type { MutableRefObject, RefObject } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

const CALENDAR_SLOT_MINUTES = 15;
const MOBILE_DRAG_TUNING_MODE = 'conservative' as const;

const DRAG_TUNING = {
  conservative: {
    autoScrollEdgePx: 92,
    autoScrollMaxStep: 18,
    daySwitchEdgePx: 44,
    daySwitchThresholdPx: 30,
    daySwitchCooldownMs: 520,
  },
  aggressive: {
    autoScrollEdgePx: 120,
    autoScrollMaxStep: 26,
    daySwitchEdgePx: 60,
    daySwitchThresholdPx: 22,
    daySwitchCooldownMs: 380,
  },
}[MOBILE_DRAG_TUNING_MODE];

export type MobilePlacementPreview = {
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

type ResolveMovePlacement = (
  target: MoveTarget,
  startAt: string,
  staffId: string,
  options?: { allowCrossDay?: boolean },
) => {
  preview: MobilePlacementPreview;
  reason: string | null;
};

type ColumnRegistryEntry = {
  element: HTMLDivElement | null;
  staffId: string;
};

type UseMobileCalendarDragOptions = {
  currentDate: Date;
  touchMoveTarget: MoveTarget | null;
  touchMoveMode: 'gesture' | 'confirm' | null;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  surfaceRef: RefObject<HTMLDivElement | null>;
  columnRegistryRef: MutableRefObject<Record<string, ColumnRegistryEntry>>;
  gridSlotHeight: number;
  gridSlotCount: number;
  rangeStartHour: number;
  resolveMovePlacement: ResolveMovePlacement;
  onPreviewChange: (preview: MobilePlacementPreview) => void;
  onCommitMove: (target: MoveTarget, preview: NonNullable<MobilePlacementPreview>) => Promise<void> | void;
  onCancelMove: () => void;
  onChangeDay: (nextDate: Date) => void;
};

type GestureSeed = {
  touchId: number;
  startX: number;
  startY: number;
};

type MobileDragPoint = {
  clientX: number;
  clientY: number;
};

type PlacementResolution = {
  preview: MobilePlacementPreview;
  reason: string | null;
  candidateStartAt: string | null;
  candidateStaffId: string | null;
};

type ActiveGesture = GestureSeed & {
  lastDaySwitchAt: number;
};

function buildCandidateStartAt(baseDate: Date, rangeStartHour: number, slotIndex: number) {
  const totalMinutes = rangeStartHour * 60 + slotIndex * CALENDAR_SLOT_MINUTES;
  const candidate = new Date(baseDate);
  candidate.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
  return candidate;
}

export function useMobileCalendarDrag({
  currentDate,
  touchMoveTarget,
  touchMoveMode,
  scrollRootRef,
  surfaceRef,
  columnRegistryRef,
  gridSlotHeight,
  gridSlotCount,
  rangeStartHour,
  resolveMovePlacement,
  onPreviewChange,
  onCommitMove,
  onCancelMove,
  onChangeDay,
}: UseMobileCalendarDragOptions) {
  const activeGestureRef = useRef<ActiveGesture | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollVelocityRef = useRef(0);
  const lastTouchPointRef = useRef<MobileDragPoint | null>(null);
  const latestCandidateRef = useRef<{
    candidateStartAt: string | null;
    candidateStaffId: string | null;
  }>({
    candidateStartAt: null,
    candidateStaffId: null,
  });
  const [dragPoint, setDragPoint] = useState<MobileDragPoint | null>(null);
  const [candidateStartAt, setCandidateStartAt] = useState<string | null>(null);
  const [candidateStaffId, setCandidateStaffId] = useState<string | null>(null);
  const [invalidReason, setInvalidReason] = useState<string | null>(null);

  const isDraggingAppointment = Boolean(
    touchMoveTarget && touchMoveTarget.source === 'appointment' && touchMoveMode === 'gesture',
  );

  const stopAutoScroll = useCallback(() => {
    autoScrollVelocityRef.current = 0;
    if (autoScrollFrameRef.current) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const syncResolution = useCallback(
    (resolution: PlacementResolution, point?: MobileDragPoint) => {
      latestCandidateRef.current = {
        candidateStartAt: resolution.candidateStartAt,
        candidateStaffId: resolution.candidateStaffId,
      };
      if (point) {
        setDragPoint(point);
      }
      setCandidateStartAt(resolution.candidateStartAt);
      setCandidateStaffId(resolution.candidateStaffId);
      setInvalidReason(resolution.reason);
      onPreviewChange(resolution.preview);
      return resolution.preview;
    },
    [onPreviewChange],
  );

  const resolvePlacementFromClientPoint = useCallback(
    (target: MoveTarget, clientX: number, clientY: number): PlacementResolution => {
      for (const entry of Object.values(columnRegistryRef.current)) {
        const rect = entry.element?.getBoundingClientRect();
        if (!rect || rect.width === 0 || rect.height === 0) {
          continue;
        }

        if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
          continue;
        }

        const relativeY = Math.min(Math.max(clientY - rect.top, 0), Math.max(rect.height - 1, 0));
        const slotIndex = Math.min(Math.floor(relativeY / gridSlotHeight), gridSlotCount - 1);
        const candidateStart = buildCandidateStartAt(currentDate, rangeStartHour, slotIndex);
        const candidate = resolveMovePlacement(
          target,
          candidateStart.toISOString(),
          entry.staffId,
          { allowCrossDay: true },
        );

        return {
          preview: candidate.preview,
          reason: candidate.reason,
          candidateStartAt: candidateStart.toISOString(),
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
    [columnRegistryRef, currentDate, gridSlotCount, gridSlotHeight, rangeStartHour, resolveMovePlacement],
  );

  const resolvePreviewForPoint = useCallback(
    (point: MobileDragPoint, target: MoveTarget) =>
      syncResolution(resolvePlacementFromClientPoint(target, point.clientX, point.clientY), point),
    [resolvePlacementFromClientPoint, syncResolution],
  );

  const maybeSwitchDay = useCallback(
    (touch: Touch) => {
      const gesture = activeGestureRef.current;
      const surface = surfaceRef.current;

      if (!gesture || !surface) {
        return false;
      }

      const now = Date.now();
      if (now - gesture.lastDaySwitchAt < DRAG_TUNING.daySwitchCooldownMs) {
        return false;
      }

      const rect = surface.getBoundingClientRect();
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      const isHorizontalIntent = Math.abs(deltaX) >= Math.max(Math.abs(deltaY) * 0.8, DRAG_TUNING.daySwitchThresholdPx);

      if (!isHorizontalIntent) {
        return false;
      }

      let direction = 0;

      if (touch.clientX <= rect.left + DRAG_TUNING.daySwitchEdgePx && deltaX < 0) {
        direction = -1;
      } else if (touch.clientX >= rect.right - DRAG_TUNING.daySwitchEdgePx && deltaX > 0) {
        direction = 1;
      }

      if (!direction) {
        return false;
      }

      gesture.lastDaySwitchAt = now;
      gesture.startX = touch.clientX;
      gesture.startY = touch.clientY;
      stopAutoScroll();

      const nextDate = addDays(currentDate, direction);
      const provisionalBase =
        latestCandidateRef.current.candidateStartAt
          ? new Date(latestCandidateRef.current.candidateStartAt)
          : touchMoveTarget
            ? new Date(touchMoveTarget.start_at)
            : currentDate;
      const provisionalStart = new Date(nextDate);
      provisionalStart.setHours(provisionalBase.getHours(), provisionalBase.getMinutes(), 0, 0);
      latestCandidateRef.current = {
        candidateStartAt: provisionalStart.toISOString(),
        candidateStaffId: latestCandidateRef.current.candidateStaffId || touchMoveTarget?.staff_id || null,
      };
      setCandidateStartAt(latestCandidateRef.current.candidateStartAt);
      setCandidateStaffId(latestCandidateRef.current.candidateStaffId);
      setInvalidReason(null);
      onPreviewChange(null);
      onChangeDay(nextDate);
      return true;
    },
    [currentDate, onChangeDay, onPreviewChange, stopAutoScroll, surfaceRef, touchMoveTarget],
  );

  const syncAutoScroll = useCallback(() => {
    const scrollRoot = scrollRootRef.current;
    const point = lastTouchPointRef.current;

    if (!scrollRoot || !point) {
      stopAutoScroll();
      return;
    }

    const rect = scrollRoot.getBoundingClientRect();
    let nextVelocity = 0;

    if (point.clientY < rect.top + DRAG_TUNING.autoScrollEdgePx) {
      const ratio = (rect.top + DRAG_TUNING.autoScrollEdgePx - point.clientY) / DRAG_TUNING.autoScrollEdgePx;
      nextVelocity = -Math.max(6, Math.round(ratio * DRAG_TUNING.autoScrollMaxStep));
    } else if (point.clientY > rect.bottom - DRAG_TUNING.autoScrollEdgePx) {
      const ratio = (point.clientY - (rect.bottom - DRAG_TUNING.autoScrollEdgePx)) / DRAG_TUNING.autoScrollEdgePx;
      nextVelocity = Math.max(6, Math.round(ratio * DRAG_TUNING.autoScrollMaxStep));
    }

    autoScrollVelocityRef.current = nextVelocity;

    if (!nextVelocity) {
      if (autoScrollFrameRef.current) {
        window.cancelAnimationFrame(autoScrollFrameRef.current);
        autoScrollFrameRef.current = null;
      }
      return;
    }

    if (autoScrollFrameRef.current) {
      return;
    }

    const tick = () => {
      const activeTarget = touchMoveTarget;
      const activePoint = lastTouchPointRef.current;
      const activeScrollRoot = scrollRootRef.current;

      if (!activeTarget || !activePoint || !activeScrollRoot || !autoScrollVelocityRef.current) {
        autoScrollFrameRef.current = null;
        return;
      }

      const previousScrollTop = activeScrollRoot.scrollTop;
      const maxScrollTop = Math.max(activeScrollRoot.scrollHeight - activeScrollRoot.clientHeight, 0);
      activeScrollRoot.scrollTop = Math.min(
        Math.max(previousScrollTop + autoScrollVelocityRef.current, 0),
        maxScrollTop,
      );

      if (activeScrollRoot.scrollTop !== previousScrollTop) {
        resolvePreviewForPoint(activePoint, activeTarget);
      }

      if (activeScrollRoot.scrollTop === previousScrollTop) {
        autoScrollFrameRef.current = null;
        return;
      }

      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }, [resolvePreviewForPoint, scrollRootRef, stopAutoScroll, touchMoveTarget]);

  useEffect(() => {
    if (!isDraggingAppointment || !touchMoveTarget) {
      stopAutoScroll();
      activeGestureRef.current = null;
      lastTouchPointRef.current = null;
      latestCandidateRef.current = { candidateStartAt: null, candidateStaffId: null };
      setDragPoint(null);
      setCandidateStartAt(null);
      setCandidateStaffId(null);
      setInvalidReason(null);
      return;
    }

    const trackedGesture = activeGestureRef.current;
    if (!trackedGesture) {
      return;
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = Array.from(event.touches).find((entry) => entry.identifier === trackedGesture.touchId);
      if (!touch) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      const point = { clientX: touch.clientX, clientY: touch.clientY };
      lastTouchPointRef.current = point;
      setDragPoint(point);

      if (maybeSwitchDay(touch)) {
        return;
      }

      syncAutoScroll();
      resolvePreviewForPoint(point, touchMoveTarget);
    };

    const finishGesture = async (touch: Touch | undefined, cancelled: boolean) => {
      stopAutoScroll();
      lastTouchPointRef.current = null;
      activeGestureRef.current = null;

      if (!touch || cancelled) {
        onCancelMove();
        return;
      }

      const point = { clientX: touch.clientX, clientY: touch.clientY };
      const preview = resolvePreviewForPoint(point, touchMoveTarget);

      if (!preview) {
        toast.error(invalidReason || 'Пуснете върху свободен 15-минутен слот.');
        onCancelMove();
        return;
      }

      await onCommitMove(touchMoveTarget, preview);
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === trackedGesture.touchId);
      if (!touch) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      void finishGesture(touch, false);
    };

    const handleTouchCancel = (event: TouchEvent) => {
      const touch = Array.from(event.changedTouches).find((entry) => entry.identifier === trackedGesture.touchId);
      if (!touch) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }

      void finishGesture(touch, true);
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
    invalidReason,
    isDraggingAppointment,
    maybeSwitchDay,
    onCancelMove,
    onCommitMove,
    resolvePreviewForPoint,
    stopAutoScroll,
    syncAutoScroll,
    touchMoveTarget,
  ]);

  const beginGestureDrag = useCallback((seed: GestureSeed) => {
    activeGestureRef.current = {
      ...seed,
      lastDaySwitchAt: 0,
    };
    lastTouchPointRef.current = {
      clientX: seed.startX,
      clientY: seed.startY,
    };
    setDragPoint({
      clientX: seed.startX,
      clientY: seed.startY,
    });
  }, []);

  return useMemo(
    () => ({
      beginGestureDrag,
      dragPoint,
      candidateStartAt,
      candidateStaffId,
      invalidReason,
      isDraggingAppointment,
      tuningMode: MOBILE_DRAG_TUNING_MODE,
    }),
    [
      beginGestureDrag,
      candidateStaffId,
      candidateStartAt,
      dragPoint,
      invalidReason,
      isDraggingAppointment,
    ],
  );
}
