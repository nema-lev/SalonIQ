'use client';

import type { ReactNode } from 'react';
import { CalendarClock, Clock3, Scissors, UserRound } from 'lucide-react';
import type { CalendarV2DemandItem, PlaceRequestCommand } from '..';
import styles from './native-scheduler.module.css';

export type NativeSchedulerPlacementPreviewState = {
  demandItem: CalendarV2DemandItem;
  command: PlaceRequestCommand;
  staffName: string;
  timeLabel: string;
  durationMinutes: number;
  usesFallbackDuration: boolean;
  hasConflict: boolean;
};

type NativeSchedulerPlacementPreviewProps = {
  preview: NativeSchedulerPlacementPreviewState;
  onClose: () => void;
  onSave?: () => void;
  canSave?: boolean;
  isPast?: boolean;
  isSaving?: boolean;
  saveDisabledReason?: string;
  saveFeedback?: {
    tone: 'success' | 'error' | 'info';
    message: string;
  } | null;
};

export function NativeSchedulerPlacementPreview({
  preview,
  onClose,
  onSave,
  canSave = false,
  isPast = false,
  isSaving = false,
  saveDisabledReason = 'Записването ще добавим в следващата стъпка',
  saveFeedback = null,
}: NativeSchedulerPlacementPreviewProps) {
  const demand = preview.demandItem;
  const dateLabel = formatPlacementDate(preview.command.target.startAt);
  const durationLabel = `${preview.durationMinutes} мин${
    preview.usesFallbackDuration ? ' · резервна продължителност' : ''
  }`;
  const saveEnabled = canSave && Boolean(onSave) && !isSaving && saveFeedback?.tone !== 'success';

  return (
    <aside className={styles.placementPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>Преглед на поставяне · не е записано</p>
          <p className={styles.panelSubtitle}>Само преглед</p>
        </div>
        <span className={preview.hasConflict || isPast ? styles.panelCountWarning : styles.panelCount}>
          {isPast ? 'Минал час' : preview.hasConflict ? 'Конфликт' : 'Само преглед'}
        </span>
      </div>
      <div className={styles.placementContent}>
        <div className={styles.placementHero}>
          <span className={styles.previewAvatar}>{getInitials(demand.client.name)}</span>
          <span className={styles.placementHeroText}>
            <span className={styles.placementClient}>{demand.client.name} · {demand.service.name}</span>
            <span className={styles.placementService}>Часът още не е записан</span>
          </span>
        </div>

        <div className={styles.placementDetailGrid}>
          <PreviewDetail
            icon={<UserRound size={14} strokeWidth={2.5} />}
            label="Специалист"
            value={preview.staffName}
          />
          <PreviewDetail
            icon={<CalendarClock size={14} strokeWidth={2.5} />}
            label="Дата и час"
            value={`${dateLabel}, ${preview.timeLabel}`}
          />
          <PreviewDetail
            icon={<Clock3 size={14} strokeWidth={2.5} />}
            label="Продължителност"
            value={durationLabel}
          />
          <PreviewDetail
            icon={<Scissors size={14} strokeWidth={2.5} />}
            label="Услуга"
            value={demand.service.name}
          />
        </div>

        {preview.hasConflict && (
          <p className={styles.previewConflictNote}>
            Избраният слот се застъпва с друг час или блокирано време. Това е само локална проверка.
          </p>
        )}
        {isPast && (
          <p className={styles.previewConflictNote}>
            Не може да запишете час в миналото.
          </p>
        )}
        <p className={styles.previewReadOnlyNote}>
          {canSave
            ? 'Часът ще се запише само след натискане на „Запази час“.'
            : 'Това е само преглед. Часът няма да бъде записан.'}
        </p>
        {saveFeedback && (
          <p className={getSaveFeedbackClassName(saveFeedback.tone)}>
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
            disabledReason: saveDisabledReason,
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

function getSaveFeedbackClassName(tone: 'success' | 'error' | 'info') {
  if (tone === 'success') return styles.previewSuccessNote;
  if (tone === 'error') return styles.previewConflictNote;
  return styles.previewReadOnlyNote;
}

function getSaveButtonCopy({
  isSaving,
  success,
  canSave,
  disabledReason,
}: {
  isSaving: boolean;
  success: boolean;
  canSave: boolean;
  disabledReason: string;
}) {
  if (isSaving) return 'Записване…';
  if (success) return 'Часът е записан.';
  if (canSave) return 'Запази час';
  return disabledReason;
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
