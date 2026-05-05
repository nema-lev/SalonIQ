'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, CircleDot, GripVertical, MessageCircle } from 'lucide-react';
import type { CalendarV2CalendarBlock } from '..';
import type { NativeSchedulerRect } from './native-scheduler-geometry';
import styles from './native-scheduler.module.css';

type NativeSchedulerEventCardProps = {
  block: CalendarV2CalendarBlock;
  rect: NativeSchedulerRect;
  isSelected: boolean;
  isDragging: boolean;
  onSelect: (blockId: string) => void;
  onStartDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    block: CalendarV2CalendarBlock,
  ) => void;
};

export function NativeSchedulerEventCard({
  block,
  rect,
  isSelected,
  isDragging,
  onSelect,
  onStartDrag,
}: NativeSchedulerEventCardProps) {
  const appointment = block.appointment;
  const summary = block.cardSummary;
  const isShort = rect.height <= 38;
  const accent = block.color ?? appointment?.service.color ?? appointment?.staff.color ?? '#64748b';
  const cues = getCardCues(block);

  return (
    <div
      className={[
        styles.eventCard,
        isShort ? styles.eventCardShort : '',
        isSelected ? styles.eventCardSelected : '',
        isDragging ? styles.eventCardDragging : '',
      ].filter(Boolean).join(' ')}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        ['--event-accent' as string]: accent,
        ['--event-border' as string]: colorWithAlpha(accent, '55'),
      }}
      data-native-scheduler-card={isShort ? 'short' : 'normal'}
    >
      {/* Regression contract: only this grip owns pointer drag; the card body stays select-only. */}
      <button
        type="button"
        className={styles.eventGrip}
        aria-label={`Move ${summary?.title ?? block.title}`}
        onPointerDown={(event) => onStartDrag(event, block)}
        data-native-scheduler-role="drag-grip"
      >
        <GripVertical size={15} strokeWidth={2.6} />
      </button>

      <button
        type="button"
        className={styles.eventBody}
        onClick={() => onSelect(block.id)}
        data-native-scheduler-role="event-body"
      >
        {isShort ? (
          <>
            <span className={styles.shortInitials}>{getInitials(summary?.title ?? block.title)}</span>
            <span className={styles.shortCue}>{summary?.timeLabel ?? block.subtitle ?? block.title}</span>
            {cues[0] ? cues[0].icon : <span className={styles.cueDot} style={{ color: accent }} />}
          </>
        ) : (
          <>
            <span className={styles.eventTopline}>
              <span className={styles.eventTitle}>{summary?.title ?? block.title}</span>
              {summary?.timeLabel && <span className={styles.eventTime}>{summary.timeLabel}</span>}
            </span>
            <span className={styles.eventSubline}>
              <span className={styles.eventSubtitle}>{summary?.subtitle ?? block.subtitle}</span>
            </span>
            {cues.length > 0 && (
              <span className={styles.cueRow}>
                {cues.map((cue) => (
                  <span key={cue.label} className={styles.cuePill}>
                    {cue.icon}
                    {cue.label}
                  </span>
                ))}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}

function getCardCues(block: CalendarV2CalendarBlock) {
  const appointment = block.appointment;
  if (!appointment) return [];

  const cues: Array<{ label: string; icon: React.ReactNode }> = [];

  if (appointment.communicationState !== 'none') {
    cues.push({
      label: 'Ново',
      icon: <MessageCircle size={12} strokeWidth={2.4} />,
    });
  }

  if (appointment.visitProgress === 'checked_in' || appointment.visitProgress === 'in_service') {
    cues.push({
      label: appointment.visitProgress === 'in_service' ? 'В услуга' : 'Пристигнал',
      icon: <CircleDot size={12} strokeWidth={2.4} />,
    });
  }

  if (appointment.actionState === 'requires_action') {
    cues.push({
      label: 'Чака',
      icon: <AlertCircle size={12} strokeWidth={2.4} />,
    });
  }

  return cues;
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function colorWithAlpha(color: string, alpha: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${alpha}`;
  }

  return '#cbd5e1';
}
