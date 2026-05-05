'use client';

import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useMemo } from 'react';
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
};

const HEADER_HEIGHT = 56;
const GUTTER_WIDTH = 74;
const MOCK_CURRENT_TIME_MINUTES = 14 * 60 + 10;

export function NativeSchedulerGrid({
  resources,
  blocks,
  selectedBlockId,
  draggingBlockId,
  dropPreview,
  gridRef,
  onSelectBlock,
  onStartAppointmentDrag,
}: NativeSchedulerGridProps) {
  const gridHeight = getGridHeight();
  const columnsWidth = resources.length * NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth;
  const slots = useMemo(() => getTimeSlots(), []);
  const laneMap = useMemo(() => detectLocalOverlap(blocks), [blocks]);
  const appointmentBlocks = blocks.filter((block) => block.kind === 'appointment');
  const blockedBlocks = blocks.filter((block) => block.kind === 'blocked_time');
  const previewRect = dropPreview
    ? calendarBlockToColumnRect(dropPreview, resources, NATIVE_SCHEDULER_GEOMETRY, 8)
    : null;

  return (
    <section className={styles.schedulerPanel}>
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
              gridTemplateColumns: `repeat(${resources.length}, ${NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth}px)`,
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
            className={styles.gridLayer}
            style={{
              width: columnsWidth,
              height: gridHeight,
            }}
          >
            {resources.map((resource, index) => (
              <div
                key={resource.id}
                className={styles.resourceColumn}
                style={{
                  left: index * NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth,
                  width: NATIVE_SCHEDULER_GEOMETRY.resourceColumnWidth,
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
              style={{ top: timeToY(MOCK_CURRENT_TIME_MINUTES) }}
              aria-hidden="true"
            />

            {blockedBlocks.map((block) => {
              const rect = calendarBlockToColumnRect(block, resources);
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
              const rect = appointmentToRect(block, resources, laneMap.get(block.id));
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
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function formatDropPreview(preview: NativeSchedulerGridDropPreview) {
  const start = new Date(preview.startAt);
  const end = new Date(preview.endAt);
  const label = `${formatMinutesAsTime(start.getHours() * 60 + start.getMinutes())}-${formatMinutesAsTime(
    end.getHours() * 60 + end.getMinutes(),
  )}`;

  return preview.hasConflict ? `${label} conflict` : `${label} ${preview.staffName}`;
}
