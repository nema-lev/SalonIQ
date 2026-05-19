'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, CheckCircle2, GripVertical, MessageCircle } from 'lucide-react';
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
  readOnly?: boolean;
};

export function NativeSchedulerEventCard({
  block,
  rect,
  isSelected,
  isDragging,
  onSelect,
  onStartDrag,
  readOnly = false,
}: NativeSchedulerEventCardProps) {
  const appointment = block.appointment;
  const summary = block.cardSummary;
  const isShort = rect.height <= 38;
  const isRoomy = rect.height >= 72;
  const accent = block.color ?? appointment?.service.color ?? appointment?.staff.color ?? '#64748b';
  const title = summary?.title ?? block.title;
  const subtitle = summary?.subtitle ?? block.subtitle;
  const timeLabel = summary?.timeLabel ?? formatRange(block);
  const statusCue = getStatusCue(block);
  const hasAttention = appointment?.actionState === 'requires_action';
  const hasMessage = appointment?.communicationState !== undefined && appointment.communicationState !== 'none';
  const isTerminal = appointment?.schedulingState === 'completed' || appointment?.schedulingState === 'no_show';

  return (
    <div
      className={[
        styles.eventCard,
        isShort ? styles.eventCardShort : '',
        isSelected ? styles.eventCardSelected : '',
        isDragging ? styles.eventCardDragging : '',
        readOnly ? styles.eventCardReadOnly : '',
        hasAttention ? styles.eventCardNeedsAction : '',
        appointment?.schedulingState === 'completed' ? styles.eventCardCompleted : '',
        appointment?.schedulingState === 'no_show' ? styles.eventCardNoShow : '',
      ].filter(Boolean).join(' ')}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        ['--event-accent' as string]: accent,
        ['--event-border' as string]: colorWithAlpha(accent, '55'),
        ['--event-soft' as string]: colorWithAlpha(accent, '0f'),
        ['--event-ring' as string]: colorWithAlpha(accent, '24'),
      }}
      data-native-scheduler-card={isShort ? 'short' : 'normal'}
      data-native-scheduler-card-tone={summary?.tone ?? 'default'}
      data-native-scheduler-action-needed={hasAttention ? 'true' : 'false'}
      data-native-scheduler-terminal={isTerminal ? appointment?.schedulingState : 'false'}
    >
      {/* Regression contract: only this grip owns pointer drag; the card body stays select-only. */}
      {!readOnly && (
        <button
          type="button"
          className={styles.eventGrip}
          aria-label={`Move ${summary?.title ?? block.title}`}
          onPointerDown={(event) => onStartDrag(event, block)}
          data-native-scheduler-role="drag-grip"
        >
          <GripVertical size={15} strokeWidth={2.6} />
        </button>
      )}

      <button
        type="button"
        className={styles.eventBody}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(block.id);
        }}
        data-native-scheduler-role="event-body"
      >
        {isShort ? (
          <>
            <span className={styles.shortBlockText}>
              <span className={styles.shortTitle}>{title}</span>
              <span className={styles.shortTime}>{timeLabel}</span>
            </span>
            {statusCue ? (
              <span className={styles.shortStatusCue}>
                {statusCue.icon}
                <span className={styles.shortStatusText}>{statusCue.shortLabel}</span>
              </span>
            ) : hasMessage ? (
              <span className={styles.shortStatusCue} aria-label="Има съобщение">
                <MessageCircle size={11} strokeWidth={2.5} />
              </span>
            ) : (
              <span className={styles.cueDot} style={{ color: accent }} />
            )}
          </>
        ) : (
          <>
            <span className={styles.eventHeader}>
              <span className={styles.eventTitleGroup}>
                <span className={styles.eventTitle}>{title}</span>
                {subtitle && <span className={styles.eventSubtitle}>{subtitle}</span>}
              </span>
              <span className={styles.eventTime}>{timeLabel}</span>
            </span>
            {(statusCue || hasMessage) && (
              <span className={styles.eventCueRow}>
                {statusCue && (
                  <span className={styles.eventStatusCue}>
                    {statusCue.icon}
                    {statusCue.label}
                  </span>
                )}
                {hasMessage && (
                  <span className={styles.eventIconCue} aria-label="Има съобщение">
                    <MessageCircle size={12} strokeWidth={2.4} />
                  </span>
                )}
              </span>
            )}
            {isRoomy && !statusCue && <span className={styles.eventBlockFill} aria-hidden="true" />}
          </>
        )}
      </button>
    </div>
  );
}

function getStatusCue(block: CalendarV2CalendarBlock) {
  const appointment = block.appointment;
  if (!appointment) return null;

  if (appointment.actionState === 'requires_action') {
    return {
      label: getActionNeededLabel(appointment.rawOwnerState ?? appointment.rawStatus ?? appointment.requestState),
      shortLabel: 'Чака',
      icon: <AlertCircle size={12} strokeWidth={2.4} />,
    };
  }

  if (appointment.schedulingState === 'completed') {
    return {
      label: 'Приключен',
      shortLabel: 'Готов',
      icon: <CheckCircle2 size={12} strokeWidth={2.4} />,
    };
  }

  if (appointment.schedulingState === 'no_show') {
    return {
      label: 'Неявил се',
      shortLabel: 'Неяв.',
      icon: <AlertCircle size={12} strokeWidth={2.4} />,
    };
  }

  return null;
}

function formatRange(block: CalendarV2CalendarBlock) {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);

  return `${formatTime(start)}-${formatTime(end)}`;
}

function getActionNeededLabel(status: string) {
  if (status === 'proposal_pending' || status === 'proposed') return 'Чака избор';
  if (status === 'pending' || status === 'requested') return 'Чака потвърждение';
  return 'Чака действие';
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function colorWithAlpha(color: string, alpha: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return `${color}${alpha}`;
  }

  return '#cbd5e1';
}
