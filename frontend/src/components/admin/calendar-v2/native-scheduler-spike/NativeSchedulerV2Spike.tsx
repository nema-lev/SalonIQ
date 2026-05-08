'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import { CalendarDays, RotateCcw } from 'lucide-react';
import type {
  ActionInboxItem,
  CalendarV2CalendarBlock,
  CalendarV2Command,
  CalendarV2DemandItem,
  CalendarV2TimeTarget,
} from '..';
import { NativeSchedulerActionInboxMock } from './NativeSchedulerActionInboxMock';
import {
  NativeSchedulerGrid,
  type NativeSchedulerGridDropPreview,
  type NativeSchedulerNotice,
} from './NativeSchedulerGrid';
import {
  NativeSchedulerPlacementPreview,
  type NativeSchedulerPlacementPreviewState,
} from './NativeSchedulerPlacementPreview';
import {
  NativeSchedulerPreviewPanel,
  type NativeSchedulerPlacementPanelContext,
} from './NativeSchedulerPreviewPanel';
import {
  nativeSchedulerActionInboxItems,
  nativeSchedulerCalendarBlocks,
  nativeSchedulerDate,
  nativeSchedulerDemandItems,
  nativeSchedulerStaff,
} from './native-scheduler-fixtures';
import {
  NATIVE_SCHEDULER_GEOMETRY,
  getDurationMinutes,
  slotFromPointer,
  type NativeSchedulerResource,
} from './native-scheduler-geometry';
import {
  createPlaceRequestCommandPreview,
  detectLocalPlacementConflict,
  createMoveAppointmentCommand,
  createPlaceRequestCommand,
  getPlacementDurationMinutes,
  hasPassedDragThreshold,
  usesFallbackPlacementDuration,
  type NativeSchedulerDragOverlay,
} from './native-scheduler-drag';
import styles from './native-scheduler.module.css';

type ActiveDragOperation =
  | {
      kind: 'demand_item';
      pointerId: number;
      startX: number;
      startY: number;
      clientX: number;
      clientY: number;
      moved: boolean;
      durationMinutes: number;
      target: NativeSchedulerGridDropPreview | null;
      demandItem: CalendarV2DemandItem;
    }
  | {
      kind: 'appointment';
      pointerId: number;
      startX: number;
      startY: number;
      clientX: number;
      clientY: number;
      moved: boolean;
      durationMinutes: number;
      target: NativeSchedulerGridDropPreview | null;
      block: CalendarV2CalendarBlock;
    };

type NativeSchedulerV2SpikeProps = {
  date?: Date;
  resources?: NativeSchedulerResource[];
  calendarBlocks?: CalendarV2CalendarBlock[];
  demandItems?: CalendarV2DemandItem[];
  actionItems?: ActionInboxItem[];
  readOnly?: boolean;
  readOnlyNotice?: string;
  schedulerNotice?: NativeSchedulerNotice | null;
  toolbarEyebrow?: string;
  toolbarPills?: string[];
  toolbarNote?: ReactNode;
  toolbarControls?: ReactNode;
  enableLocalPlacementPreview?: boolean;
};

export function NativeSchedulerV2Spike({
  date,
  resources: inputResources,
  calendarBlocks,
  demandItems: inputDemandItems,
  actionItems: inputActionItems,
  readOnly = false,
  readOnlyNotice,
  schedulerNotice,
  toolbarEyebrow = 'Calendar V2 native preview',
  toolbarPills,
  toolbarNote,
  toolbarControls,
  enableLocalPlacementPreview = true,
}: NativeSchedulerV2SpikeProps = {}) {
  const sourceBlocks = calendarBlocks ?? nativeSchedulerCalendarBlocks;
  const schedulerDate = date ?? nativeSchedulerDate;
  const demandItems = inputDemandItems ?? nativeSchedulerDemandItems;
  const actionItems = inputActionItems ?? nativeSchedulerActionInboxItems;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const activeDragRef = useRef<ActiveDragOperation | null>(null);
  const [blocks, setBlocks] = useState(sourceBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(sourceBlocks[0]?.id ?? null);
  const [dragActive, setDragActive] = useState(false);
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<NativeSchedulerGridDropPreview | null>(null);
  const [dragOverlay, setDragOverlay] = useState<NativeSchedulerDragOverlay | null>(null);
  const [placementPreview, setPlacementPreview] = useState<NativeSchedulerPlacementPreviewState | null>(null);
  const [placementDemandItem, setPlacementDemandItem] = useState<CalendarV2DemandItem | null>(null);
  const [placementTarget, setPlacementTarget] = useState<NativeSchedulerGridDropPreview | null>(null);
  const [placementMessage, setPlacementMessage] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<CalendarV2Command | null>(null);

  const resources = useMemo<NativeSchedulerResource[]>(
    () =>
      inputResources ??
      nativeSchedulerStaff.map((staff) => ({
        id: staff.id,
        name: staff.name,
        color: staff.color,
      })),
    [inputResources],
  );
  const selectedBlock = useMemo(
    () => blocks.find((block) => block.id === selectedBlockId) ?? null,
    [blocks, selectedBlockId],
  );
  const dateLabel = format(schedulerDate, "EEEE, d MMMM yyyy 'г.'", { locale: bg });
  const visibleToolbarPills = toolbarPills ?? [];

  const clearPlacementMode = useCallback(() => {
    setPlacementDemandItem(null);
    setPlacementTarget(null);
    setPlacementPreview(null);
    setPlacementMessage(null);
    setDropPreview(null);
    setLastCommand(null);
  }, []);
  const placementModeActive = enableLocalPlacementPreview && Boolean(placementDemandItem);
  const placementContextDemandItem = placementDemandItem ?? placementPreview?.demandItem ?? null;
  const placementPanelContext = useMemo<NativeSchedulerPlacementPanelContext | null>(() => {
    if (!placementContextDemandItem) return null;

    const target = placementPreview
      ? {
          staffName: placementPreview.staffName,
          timeLabel: placementPreview.timeLabel,
          startAt: placementPreview.command.target.startAt,
        }
      : placementTarget
        ? {
            staffName: placementTarget.staffName,
            timeLabel: formatTargetTime(placementTarget),
            startAt: placementTarget.startAt,
          }
        : null;

    return {
      demandItem: placementContextDemandItem,
      target,
      durationMinutes:
        placementPreview?.durationMinutes ??
        placementTarget?.durationMinutes ??
        getPlacementDurationMinutes(placementContextDemandItem),
      usesFallbackDuration: usesFallbackPlacementDuration(placementContextDemandItem),
      hasConflict: Boolean(placementPreview?.hasConflict ?? placementTarget?.hasConflict),
      onCancel: clearPlacementMode,
    };
  }, [clearPlacementMode, placementContextDemandItem, placementPreview, placementTarget]);

  useEffect(() => {
    setBlocks(sourceBlocks);
    setSelectedBlockId((current) =>
      current && sourceBlocks.some((block) => block.id === current)
        ? current
        : sourceBlocks[0]?.id ?? null,
    );
    activeDragRef.current = null;
    setDragActive(false);
    setDraggingBlockId(null);
    setDropPreview(null);
    setDragOverlay(null);
    setPlacementDemandItem(null);
    setPlacementTarget(null);
    setPlacementPreview(null);
    setPlacementMessage(null);
    setLastCommand(null);
  }, [sourceBlocks]);

  useEffect(() => {
    if (!placementDemandItem) return;
    if (demandItems.some((item) => item.id === placementDemandItem.id)) return;

    clearPlacementMode();
  }, [clearPlacementMode, demandItems, placementDemandItem]);

  const resolveDropTarget = useCallback(
    ({
      clientX,
      clientY,
      durationMinutes,
      kind,
      ignoredBlockId,
    }: {
      clientX: number;
      clientY: number;
      durationMinutes: number;
      kind: NativeSchedulerGridDropPreview['kind'];
      ignoredBlockId?: string;
    }): NativeSchedulerGridDropPreview | null => {
      const grid = gridRef.current;
      if (!grid) return null;
      const gridRect = grid.getBoundingClientRect();
      const resourceColumnWidth = resources.length
        ? gridRect.width / resources.length
        : NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth;

      const slot = slotFromPointer({
        clientX,
        clientY,
        gridRect,
        resources,
        date: schedulerDate,
        durationMinutes,
        config: {
          ...NATIVE_SCHEDULER_GEOMETRY,
          resourceColumnWidth,
        },
      });

      if (!slot) return null;

      const target = {
        kind,
        staffId: slot.resource.id,
        staffName: slot.resource.name,
        startAt: slot.startAt,
        endAt: slot.endAt,
        durationMinutes,
        hasConflict: detectLocalPlacementConflict({
          blocks,
          staffId: slot.resource.id,
          startAt: slot.startAt,
          endAt: slot.endAt,
          ignoredBlockId,
        }),
      };

      return target;
    },
    [blocks, resources, schedulerDate],
  );

  const commitDrop = useCallback(
    (drag: ActiveDragOperation, target: NativeSchedulerGridDropPreview) => {
      if (readOnly) return;

      const timezone = getClientTimezone();
      const commandTarget = {
        startAt: target.startAt,
        endAt: target.endAt,
        staffId: target.staffId,
        staffName: target.staffName,
      };

      if (drag.kind === 'demand_item') {
        const command = createPlaceRequestCommand({
          demandItem: drag.demandItem,
          target: commandTarget,
          timezone,
        });

        setPlacementPreview({
          demandItem: drag.demandItem,
          command,
          staffName: target.staffName,
          timeLabel: formatTargetTime(target),
          durationMinutes: target.durationMinutes,
          usesFallbackDuration: usesFallbackPlacementDuration(drag.demandItem),
          hasConflict: target.hasConflict,
        });
        setSelectedBlockId(null);
        setLastCommand(command);
        console.info('[Calendar V2 native scheduler preview command]', command);
        return;
      }

      if (!drag.block.appointment) return;

      const previousTarget: CalendarV2TimeTarget = {
        startAt: drag.block.startAt,
        endAt: drag.block.endAt,
        staffId: drag.block.staffId,
        timezone,
      };
      const command = createMoveAppointmentCommand({
        appointment: drag.block.appointment,
        target: commandTarget,
        previousTarget,
        timezone,
      });

      setLastCommand(command);
      console.info('[Calendar V2 native scheduler preview command]', command);

      // Production must validate this command server-side and rollback/reconcile on failure.
      setBlocks((current) => current.map((block) => moveBlockLocally(block, drag.block.id, target, resources)));
      setSelectedBlockId(drag.block.id);
    },
    [readOnly, resources],
  );

  useEffect(() => {
    if (!dragActive) return;

    const handlePointerMove = (event: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      const moved = hasPassedDragThreshold(
        { x: drag.startX, y: drag.startY },
        { x: event.clientX, y: event.clientY },
      );
      const target = resolveDropTarget({
        clientX: event.clientX,
        clientY: event.clientY,
        durationMinutes: drag.durationMinutes,
        kind: drag.kind,
        ignoredBlockId: drag.kind === 'appointment' ? drag.block.id : undefined,
      });
      const nextDrag = {
        ...drag,
        clientX: event.clientX,
        clientY: event.clientY,
        moved,
        target,
      } as ActiveDragOperation;

      activeDragRef.current = nextDrag;
      setDropPreview(moved ? target : null);
      setDragOverlay({
        kind: drag.kind,
        title: drag.kind === 'appointment' ? drag.block.title : drag.demandItem.client.name,
        subtitle: drag.kind === 'appointment' ? drag.block.subtitle ?? '' : drag.demandItem.service.name,
        clientX: event.clientX,
        clientY: event.clientY,
        moved,
        targetLabel: target ? `${formatTargetTime(target)} · ${target.staffName}` : null,
        hasConflict: Boolean(target?.hasConflict),
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const drag = activeDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;

      if (drag.moved && drag.target) {
        commitDrop(drag, drag.target);
      }

      activeDragRef.current = null;
      setDragActive(false);
      setDraggingBlockId(null);
      setDropPreview(null);
      setDragOverlay(null);
    };

    const handlePointerCancel = () => {
      activeDragRef.current = null;
      setDragActive(false);
      setDraggingBlockId(null);
      setDropPreview(null);
      setDragOverlay(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [commitDrop, dragActive, resolveDropTarget]);

  const handleStartDemandDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, demandItem: CalendarV2DemandItem) => {
      if (readOnly) return;

      startPointerDrag(event);
      const durationMinutes = Math.max(
        NATIVE_SCHEDULER_GEOMETRY.slotMinutes,
        getPlacementDurationMinutes(demandItem),
      );

      activeDragRef.current = {
        kind: 'demand_item',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        durationMinutes,
        target: null,
        demandItem,
      };
      setDragActive(true);
      setDragOverlay({
        kind: 'demand_item',
        title: demandItem.client.name,
        subtitle: demandItem.service.name,
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        targetLabel: null,
        hasConflict: false,
      });
    },
    [readOnly],
  );

  const handleSelectDemandForPlacement = useCallback(
    (demandItem: CalendarV2DemandItem) => {
      if (!enableLocalPlacementPreview) return;

      activeDragRef.current = null;
      setDragActive(false);
      setDraggingBlockId(null);
      setDragOverlay(null);
      setDropPreview(null);
      setPlacementPreview(null);
      setPlacementTarget(null);
      setLastCommand(null);
      setSelectedBlockId(null);
      setPlacementDemandItem(demandItem);
      setPlacementMessage('Изберете свободен час в календара.');
    },
    [enableLocalPlacementPreview],
  );

  const handleStartAppointmentDrag = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>, block: CalendarV2CalendarBlock) => {
      if (readOnly) return;
      if (!block.appointment) return;

      startPointerDrag(event);
      activeDragRef.current = {
        kind: 'appointment',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        durationMinutes: getDurationMinutes(block.startAt, block.endAt),
        target: null,
        block,
      };
      setDraggingBlockId(block.id);
      setDragActive(true);
      setDragOverlay({
        kind: 'appointment',
        title: block.title,
        subtitle: block.subtitle ?? '',
        clientX: event.clientX,
        clientY: event.clientY,
        moved: false,
        targetLabel: null,
        hasConflict: false,
      });
    },
    [readOnly],
  );

  const resetLocalState = () => {
    activeDragRef.current = null;
    setBlocks(sourceBlocks);
    setSelectedBlockId(sourceBlocks[0]?.id ?? null);
    setDragActive(false);
    setDraggingBlockId(null);
    setDropPreview(null);
    setDragOverlay(null);
    setPlacementDemandItem(null);
    setPlacementTarget(null);
    setPlacementPreview(null);
    setPlacementMessage(null);
    setLastCommand(null);
  };

  const handlePlacementPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!placementDemandItem || dragActive) return;

      const durationMinutes = Math.max(
        NATIVE_SCHEDULER_GEOMETRY.slotMinutes,
        getPlacementDurationMinutes(placementDemandItem),
      );
      const target = resolveDropTarget({
        clientX: event.clientX,
        clientY: event.clientY,
        durationMinutes,
        kind: 'demand_item',
      });

      setDropPreview(target);
    },
    [dragActive, placementDemandItem, resolveDropTarget],
  );

  const handlePlacementPointerLeave = useCallback(() => {
    if (!placementDemandItem || placementPreview || placementTarget) return;

    setDropPreview(null);
  }, [placementDemandItem, placementPreview, placementTarget]);

  const handlePlacementSlotClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!placementDemandItem) return;

      const durationMinutes = Math.max(
        NATIVE_SCHEDULER_GEOMETRY.slotMinutes,
        getPlacementDurationMinutes(placementDemandItem),
      );
      const target = resolveDropTarget({
        clientX: event.clientX,
        clientY: event.clientY,
        durationMinutes,
        kind: 'demand_item',
      });

      if (!target) {
        setPlacementTarget(null);
        setDropPreview(null);
        setPlacementPreview(null);
        setPlacementMessage('Изберете слот в колона на специалист.');
        return;
      }

      const timezone = getClientTimezone();
      const command = createPlaceRequestCommandPreview({
        demandItem: placementDemandItem,
        target: {
          startAt: target.startAt,
          endAt: target.endAt,
          staffId: target.staffId,
          staffName: target.staffName,
        },
        timezone,
        sourceSurface: 'action_inbox',
      });

      if (!command) return;

      const preview = {
        demandItem: placementDemandItem,
        command,
        staffName: target.staffName,
        timeLabel: formatTargetTime(target),
        durationMinutes: target.durationMinutes,
        usesFallbackDuration: usesFallbackPlacementDuration(placementDemandItem),
        hasConflict: target.hasConflict,
      };

      setPlacementTarget(target);
      setDropPreview(target);
      setPlacementPreview(preview);
      setLastCommand(command);
      setPlacementMessage(
        target.hasConflict
          ? 'Избраният слот има локален конфликт. Прегледът не записва час.'
          : 'Прегледът е готов. Часът още не е записан.',
      );
      console.info('[Calendar V2 local placement preview command]', command);
    },
    [placementDemandItem, resolveDropTarget],
  );

  return (
    <>
      <div className={styles.phoneNotice}>
        Телефонният Calendar V2 ще използва отделен дневен изглед.
      </div>

      <div className={styles.desktopSpike}>
        <div className={styles.spikeShell}>
          <header className={styles.toolbar}>
            <div className={styles.toolbarTitle}>
              <span className={styles.toolbarIcon}>
                <CalendarDays size={18} strokeWidth={2.5} />
              </span>
              <span className="min-w-0">
                <p className={styles.toolbarEyebrow}>{toolbarEyebrow}</p>
                <h2 className={styles.toolbarHeading}>{dateLabel}</h2>
              </span>
            </div>

            <div className={styles.toolbarMeta}>
              <div className={styles.toolbarControlRow}>
                {toolbarControls}
                {readOnlyNotice && (
                  <span className={readOnly ? styles.readOnlyPill : styles.toolbarPill}>{readOnlyNotice}</span>
                )}
                {visibleToolbarPills.map((pill) => (
                  <span key={pill} className={styles.toolbarPill}>
                    {pill}
                  </span>
                ))}
                {!readOnly && (
                  <button type="button" className={styles.resetButton} onClick={resetLocalState}>
                    <RotateCcw size={14} strokeWidth={2.5} />
                    Нулирай локално
                  </button>
                )}
              </div>
              {toolbarNote && <p className={styles.toolbarNote}>{toolbarNote}</p>}
            </div>
          </header>

          <div className={styles.spikeBody}>
            <div className={styles.schedulerStage}>
              <NativeSchedulerGrid
                resources={resources}
                blocks={blocks}
                selectedBlockId={selectedBlockId}
                draggingBlockId={draggingBlockId}
                dropPreview={dropPreview}
                gridRef={gridRef}
                onSelectBlock={setSelectedBlockId}
                onStartAppointmentDrag={handleStartAppointmentDrag}
                readOnly={readOnly}
                schedulerNotice={schedulerNotice}
                placementModeActive={placementModeActive}
                onPlacementPointerMove={handlePlacementPointerMove}
                onPlacementPointerLeave={handlePlacementPointerLeave}
                onPlacementSlotClick={handlePlacementSlotClick}
              />

              {placementDemandItem && (
                <div className={styles.placementModeBanner}>
                  <div className={styles.placementModeText}>
                    <p className={styles.placementModeTitle}>Изберете свободен час в календара</p>
                    <p className={styles.placementModeSubtitle}>
                      {placementDemandItem.client.name} · {placementDemandItem.service.name} ·{' '}
                      {getPlacementDurationMinutes(placementDemandItem)} мин
                      {usesFallbackPlacementDuration(placementDemandItem) ? ' · резервна продължителност' : ''}
                    </p>
                    {placementMessage && <p className={styles.placementModeMessage}>{placementMessage}</p>}
                  </div>
                  <button type="button" className={styles.placementModeCancel} onClick={clearPlacementMode}>
                    Отказ
                  </button>
                </div>
              )}

              {placementPreview && (
                <NativeSchedulerPlacementPreview
                  preview={placementPreview}
                  onClose={clearPlacementMode}
                />
              )}
            </div>

            <aside className={styles.rightRail}>
              <NativeSchedulerActionInboxMock
                demandItems={demandItems}
                actionItems={actionItems}
                onStartDemandDrag={handleStartDemandDrag}
                onSelectDemandForPlacement={handleSelectDemandForPlacement}
                activePlacementDemandId={placementDemandItem?.id ?? null}
                placementModeEnabled={enableLocalPlacementPreview}
                readOnly={readOnly}
              />
              <NativeSchedulerPreviewPanel
                selectedBlock={placementPanelContext ? null : selectedBlock}
                lastCommand={placementPanelContext ? null : lastCommand}
                placementContext={placementPanelContext}
                readOnly={readOnly}
              />
            </aside>
          </div>
        </div>

        {dragOverlay && (
          <div
            className={styles.dragOverlay}
            style={{
              left: dragOverlay.clientX,
              top: dragOverlay.clientY,
            }}
          >
            <div className={styles.dragOverlayInner}>
              <p className={styles.dragTitle}>{dragOverlay.title}</p>
              <p className={styles.dragSubtitle}>{dragOverlay.subtitle}</p>
              {dragOverlay.targetLabel && (
                <p className={`${styles.dragTarget} ${dragOverlay.hasConflict ? styles.dragConflict : ''}`}>
                  {dragOverlay.hasConflict ? 'Конфликт · ' : ''}
                  {dragOverlay.targetLabel}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function startPointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture(event.pointerId);
}

function moveBlockLocally(
  block: CalendarV2CalendarBlock,
  movingBlockId: string,
  target: NativeSchedulerGridDropPreview,
  resources: NativeSchedulerResource[],
): CalendarV2CalendarBlock {
  if (block.id !== movingBlockId) return block;

  const staff = resources.find((resource) => resource.id === target.staffId);
  const timeLabel = formatTargetTime(target);

  return {
    ...block,
    startAt: target.startAt,
    endAt: target.endAt,
    staffId: target.staffId,
    cardSummary: block.cardSummary
      ? {
          ...block.cardSummary,
          timeLabel,
          staffLabel: staff?.name ?? target.staffName,
        }
      : block.cardSummary,
    appointment: block.appointment
      ? {
          ...block.appointment,
          startAt: target.startAt,
          endAt: target.endAt,
          staff: {
            ...block.appointment.staff,
            id: target.staffId,
            name: staff?.name ?? target.staffName,
            color: staff?.color ?? block.appointment.staff.color,
          },
        }
      : block.appointment,
  };
}

function formatTargetTime(target: Pick<NativeSchedulerGridDropPreview, 'startAt' | 'endAt'>) {
  const start = new Date(target.startAt);
  const end = new Date(target.endAt);

  return `${formatClock(start)}-${formatClock(end)}`;
}

function formatClock(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getClientTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
}
