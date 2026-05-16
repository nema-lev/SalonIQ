'use client';

import type { ReactNode } from 'react';
import { CalendarClock, Clock3, Scissors, UserRound } from 'lucide-react';
import type { CalendarV2CalendarBlock } from '..';
import type { NativeSchedulerGridDropPreview } from './NativeSchedulerGrid';
import styles from './native-scheduler.module.css';

export type NativeSchedulerReschedulePreviewState = {
  sourceBlock: CalendarV2CalendarBlock;
  target: NativeSchedulerGridDropPreview;
};

type NativeSchedulerReschedulePreviewProps = {
  preview: NativeSchedulerReschedulePreviewState;
  onClose: () => void;
  onSave?: () => void;
  canSave?: boolean;
  isSaving?: boolean;
  saveFeedback?: {
    tone: 'success' | 'error';
    message: string;
  } | null;
};

export function NativeSchedulerReschedulePreview({
  preview,
  onClose,
  onSave,
  canSave = false,
  isSaving = false,
  saveFeedback = null,
}: NativeSchedulerReschedulePreviewProps) {
  const appointment = preview.sourceBlock.appointment;
  const clientName = appointment?.client.name ?? preview.sourceBlock.title;
  const serviceName = appointment?.service.name ?? preview.sourceBlock.subtitle ?? 'Услугата липсва';
  const targetDateLabel = formatPlacementDate(preview.target.startAt);
  const saveEnabled = canSave && Boolean(onSave) && !isSaving && saveFeedback?.tone !== 'success';

  return (
    <aside className={styles.placementPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>Преглед на преместване</p>
          <p className={styles.panelSubtitle}>Само преглед</p>
        </div>
        <span className={preview.target.hasConflict || preview.target.isPast ? styles.panelCountWarning : styles.panelCount}>
          {preview.target.isPast ? 'Минал час' : preview.target.hasConflict ? 'Конфликт' : 'Избран слот'}
        </span>
      </div>

      <div className={styles.placementContent}>
        <div className={styles.placementHero}>
          <span className={styles.previewAvatar}>{getInitials(clientName)}</span>
          <span className={styles.placementHeroText}>
            <span className={styles.placementClient}>{clientName} · {serviceName}</span>
            <span className={styles.placementService}>Часът още не е преместен</span>
          </span>
        </div>

        <div className={styles.placementDetailGrid}>
          <PreviewDetail
            icon={<UserRound size={14} strokeWidth={2.5} />}
            label="Нов специалист"
            value={preview.target.staffName}
          />
          <PreviewDetail
            icon={<CalendarClock size={14} strokeWidth={2.5} />}
            label="Нова дата и час"
            value={`${targetDateLabel}, ${formatRange(preview.target.startAt, preview.target.endAt)}`}
          />
          <PreviewDetail
            icon={<Clock3 size={14} strokeWidth={2.5} />}
            label="Текущ час"
            value={`${formatPlacementDate(preview.sourceBlock.startAt)}, ${formatRange(preview.sourceBlock.startAt, preview.sourceBlock.endAt)}`}
          />
          <PreviewDetail
            icon={<Scissors size={14} strokeWidth={2.5} />}
            label="Услуга"
            value={serviceName}
          />
        </div>

        {preview.target.hasConflict && (
          <p className={styles.previewConflictNote}>
            Този час вече е зает.
          </p>
        )}
        {preview.target.isPast && (
          <p className={styles.previewConflictNote}>
            Не може да преместите час в миналото.
          </p>
        )}
        <p className={styles.previewReadOnlyNote}>
          Часът ще се премести само след натискане на „Запази промяната“.
        </p>
        {saveFeedback && (
          <p className={saveFeedback.tone === 'success' ? styles.previewSuccessNote : styles.previewConflictNote}>
            {saveFeedback.message}
          </p>
        )}
      </div>

      <div className={styles.placementActions}>
        <button type="button" className={styles.ghostButton} onClick={onClose}>
          Отказ
        </button>
        <button
          type="button"
          className={saveEnabled ? styles.primaryButton : styles.disabledButton}
          disabled={!saveEnabled}
          onClick={saveEnabled ? onSave : undefined}
        >
          {getSaveButtonCopy({
            isSaving,
            success: saveFeedback?.tone === 'success',
            canSave,
          })}
        </button>
      </div>
    </aside>
  );
}

function PreviewDetail({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.placementDetailItem}>
      <span className={styles.placementDetailIcon}>{icon}</span>
      <span className={styles.placementDetailText}>
        <span className={styles.placementDetailLabel}>{label}</span>
        <span className={styles.placementDetailValue}>{value}</span>
      </span>
    </div>
  );
}

function getSaveButtonCopy({
  isSaving,
  success,
  canSave,
}: {
  isSaving: boolean;
  success: boolean;
  canSave: boolean;
}) {
  if (isSaving) return 'Запазване…';
  if (success) return 'Часът е преместен.';
  if (canSave) return 'Запази промяната';
  return 'Изберете валиден час';
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

function formatPlacementDate(value: string) {
  const date = new Date(value);

  return date.toLocaleDateString('bg-BG', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function formatRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);

  return `${formatTime(start)}-${formatTime(end)}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
