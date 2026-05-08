'use client';

import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CalendarV2CalendarBlock } from '..';
import {
  NATIVE_SCHEDULER_GEOMETRY,
  appointmentToRect,
  calendarBlockToColumnRect,
  detectLocalOverlap,
  formatMinutesAsTime,
  getGridHeight,
  getTimeSlots,
  minutesToPixels,
  timeToY,
  type NativeSchedulerResource,
} from './native-scheduler-geometry';
import { NativeSchedulerEventCard } from './NativeSchedulerEventCard';
import styles from './native-scheduler.module.css';

export type NativeSchedulerNotice = {
  title: string;
  message?: string;
  tone?: 'empty' | 'loading' | 'warning';
  action?: {
    label: string;
    onClick: () => void;
  };
};

export type NativeSchedulerGridDropPreview = {
  kind: 'appointment' | 'demand_item';
  staffId: string;
  staffName: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  hasConflict: boolean;
};

type NativeSchedulerGridProps = {
  resources: NativeSchedulerResource[];
  blocks: CalendarV2CalendarBlock[];
  selectedBlockId: string | null;
  draggingBlockId: string | null;
  dropPreview: NativeSchedulerGridDropPreview | null;
  gridRef: RefObject<HTMLDivElement>;
  onSelectBlock: (blockId: string) => void;
  onStartAppointmentDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    block: CalendarV2CalendarBlock,
  ) => void;
  readOnly?: boolean;
  schedulerNotice?: NativeSchedulerNotice | null;
  placementModeActive?: boolean;
  onPlacementPointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPlacementPointerLeave?: () => void;
  onPlacementSlotClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
};

const HEADER_HEIGHT = 56;
const GUTTER_WIDTH = 74;
const MOCK_CURRENT_TIME_MINUTES = 14 * 60 + 10;
const MIN_READ_ONLY_RESOURCE_COLUMN_WIDTH = 208;
const SCROLLBAR_GUTTER_WIDTH = 16;

export function NativeSchedulerGrid({
  resources,
  blocks,
  selectedBlockId,
  draggingBlockId,
  dropPreview,
  gridRef,
  onSelectBlock,
  onStartAppointmentDrag,
  readOnly = false,
  schedulerNotice,
  placementModeActive = false,
  onPlacementPointerMove,
  onPlacementPointerLeave,
  onPlacementSlotClick,
}: NativeSchedulerGridProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const resourceColumnWidth = useMemo(
    () =>
      readOnly && resources.length > 0 && availableWidth > GUTTER_WIDTH
        ? Math.max(
            MIN_READ_ONLY_RESOURCE_COLUMN_WIDTH,
            Math.floor((availableWidth - GUTTER_WIDTH - SCROLLBAR_GUTTER_WIDTH) / resources.length),
          )
        : NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth,
    [availableWidth, readOnly, resources.length],
  );
  const geometry = useMemo(
    () => ({
      ...NATIVE_SCHEDULER_GEOMETRY,
      resourceColumnWidth,
    }),
    [resourceColumnWidth],
  );
  const gridHeight = getGridHeight(geometry);
  const visibleColumnCount = Math.max(resources.length, 1);
  const columnsWidth = visibleColumnCount * geometry.resourceColumnWidth;
  const slots = useMemo(() => getTimeSlots(geometry), [geometry]);
  const laneMap = useMemo(() => detectLocalOverlap(blocks), [blocks]);
  const appointmentBlocks = blocks.filter((block) => block.kind === 'appointment');
  const blockedBlocks = blocks.filter((block) => block.kind === 'blocked_time');
  const previewRect = dropPreview
    ? calendarBlockToColumnRect(dropPreview, resources, geometry, 8)
    : null;

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;

    const updateWidth = () => setAvailableWidth(node.clientWidth);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  if (resources.length === 0) {
    return (
      <section ref={containerRef} className={styles.schedulerPanel}>
        <div className={styles.schedulerEmptyCanvas}>
          <SchedulerNotice notice={schedulerNotice} />
        </div>
      </section>
    );
  }

  return (
    <section ref={containerRef} className={styles.schedulerPanel}>
      <div className={styles.schedulerScroll}>
        <div
          className={styles.schedulerCanvas}
          style={{
            width: GUTTER_WIDTH + columnsWidth,
            height: HEADER_HEIGHT + gridHeight,
            gridTemplateColumns: `${GUTTER_WIDTH}px ${columnsWidth}px`,
            gridTemplateRows: `${HEADER_HEIGHT}px ${gridHeight}px`,
          }}
        >
          <div className={styles.cornerHeader}>Time</div>
          <div
            className={styles.staffHeaderRow}
            style={{
              gridTemplateColumns: `repeat(${visibleColumnCount}, ${geometry.resourceColumnWidth}px)`,
            }}
          >
            {resources.map((resource) => (
              <div key={resource.id} className={styles.staffHeader}>
                <span className={styles.staffDot} style={{ backgroundColor: resource.color ?? '#64748b' }} />
                <span className="min-w-0">
                  <span className={styles.staffName}>{resource.name}</span>
                  <span className={styles.staffSubline}>08:00-20:00</span>
                </span>
              </div>
            ))}
          </div>

          <div className={styles.timeGutter}>
            {slots.filter((slot) => slot.isHour).map((slot) => (
              <span
                key={slot.minutes}
                className={styles.timeLabel}
                style={{
                  top:
                    slot.minutes === NATIVE_SCHEDULER_GEOMETRY.businessStartMinutes
                      ? slot.top + 8
                      : slot.top,
                }}
              >
                {slot.label}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            className={`${styles.gridLayer} ${placementModeActive ? styles.gridLayerPlacementMode : ''}`}
            style={{
              width: columnsWidth,
              height: gridHeight,
              backgroundSize: `${geometry.resourceColumnWidth}px 100%, 100% 30px`,
            }}
            onPointerMove={placementModeActive ? onPlacementPointerMove : undefined}
            onPointerLeave={placementModeActive ? onPlacementPointerLeave : undefined}
            onClick={placementModeActive ? onPlacementSlotClick : undefined}
          >
            {schedulerNotice && (
              <SchedulerNotice notice={schedulerNotice} />
            )}

            {resources.map((resource, index) => (
              <div
                key={resource.id}
                className={styles.resourceColumn}
                style={{
                  left: index * geometry.resourceColumnWidth,
                  width: geometry.resourceColumnWidth,
                }}
              />
            ))}

            {slots.map((slot) => (
              <span
                key={slot.minutes}
                className={`${styles.slotLine} ${slot.isHour ? styles.hourLine : ''}`}
                style={{ top: slot.top }}
              />
            ))}

            <span
              className={styles.currentTimeLine}
              style={{ top: timeToY(MOCK_CURRENT_TIME_MINUTES, geometry) }}
              aria-hidden="true"
            />

            {blockedBlocks.map((block) => {
              const rect = calendarBlockToColumnRect(block, resources, geometry);
              if (!rect) return null;

              return (
                <div
                  key={block.id}
                  className={styles.blockedRegion}
                  style={{
                    top: rect.top,
                    left: rect.left,
                    width: rect.width,
                    height: rect.height,
                  }}
                >
                  <span className={styles.blockedTitle}>{block.title}</span>
                  <span className={styles.blockedSubtitle}>{block.subtitle}</span>
                </div>
              );
            })}

            {dropPreview && previewRect && (
              <div
                className={`${styles.dropPreview} ${dropPreview.hasConflict ? styles.dropPreviewConflict : ''}`}
                style={{
                  top: previewRect.top,
                  left: previewRect.left,
                  width: previewRect.width,
                  height: Math.max(
                    minutesToPixels(dropPreview.durationMinutes),
                    NATIVE_SCHEDULER_GEOMETRY.minimumEventHeight,
                  ),
                }}
              >
                <span className={styles.dropPreviewLabel}>
                  {formatDropPreview(dropPreview)}
                </span>
              </div>
            )}

            {appointmentBlocks.map((block) => {
              const rect = appointmentToRect(block, resources, laneMap.get(block.id), geometry);
              if (!rect) return null;

              return (
                <NativeSchedulerEventCard
                  key={block.id}
                  block={block}
                  rect={rect}
                  isSelected={selectedBlockId === block.id}
                  isDragging={draggingBlockId === block.id}
                  onSelect={onSelectBlock}
                  onStartDrag={onStartAppointmentDrag}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function SchedulerNotice({ notice }: { notice?: NativeSchedulerNotice | null }) {
  if (!notice) return null;

  return (
    <div
      className={`${styles.schedulerNotice} ${getNoticeToneClass(notice.tone)}`}
      onClick={(event) => event.stopPropagation()}
    >
      <p className={styles.schedulerNoticeTitle}>{notice.title}</p>
      {notice.message && <p className={styles.schedulerNoticeText}>{notice.message}</p>}
      {notice.action && (
        <button type="button" className={styles.schedulerNoticeAction} onClick={notice.action.onClick}>
          {notice.action.label}
        </button>
      )}
    </div>
  );
}

function getNoticeToneClass(tone: NativeSchedulerNotice['tone']) {
  if (tone === 'warning') return styles.schedulerNoticeWarning;
  if (tone === 'loading') return styles.schedulerNoticeLoading;
  return styles.schedulerNoticeEmpty;
}

function formatDropPreview(preview: NativeSchedulerGridDropPreview) {
  const start = new Date(preview.startAt);
  const end = new Date(preview.endAt);
  const label = `${formatMinutesAsTime(start.getHours() * 60 + start.getMinutes())}-${formatMinutesAsTime(
    end.getHours() * 60 + end.getMinutes(),
  )}`;

  return preview.hasConflict ? `${label} conflict` : `${label} ${preview.staffName}`;
}
