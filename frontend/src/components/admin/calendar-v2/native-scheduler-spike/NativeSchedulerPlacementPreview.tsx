'use client';

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
};

export function NativeSchedulerPlacementPreview({
  preview,
  onClose,
}: NativeSchedulerPlacementPreviewProps) {
  const demand = preview.demandItem;
  const dateLabel = formatPlacementDate(preview.command.target.startAt);

  return (
    <aside className={styles.placementPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>Преглед на поставяне</p>
          <p className={styles.panelSubtitle}>Само локален преглед</p>
        </div>
        <span className={preview.hasConflict ? styles.panelCountWarning : styles.panelCount}>
          {preview.hasConflict ? 'Конфликт' : 'Preview'}
        </span>
      </div>
      <div className={styles.placementContent}>
        <div className={styles.placementFacts}>
          <PreviewRow label="Клиент" value={demand.client.name} />
          <PreviewRow label="Услуга" value={demand.service.name} />
          <PreviewRow
            label="Продължителност"
            value={`${preview.durationMinutes} мин${preview.usesFallbackDuration ? ' · резервна стойност' : ''}`}
          />
          <PreviewRow label="Специалист" value={preview.staffName} />
          <PreviewRow label="Дата и час" value={`${dateLabel}, ${preview.timeLabel}`} />
        </div>
        {preview.hasConflict && (
          <p className={styles.previewConflictNote}>
            Конфликт: избраният слот се застъпва с друг час или блокирано време. Това е само локална проверка.
          </p>
        )}
        <p className={styles.previewReadOnlyNote}>
          Това е само преглед. Часът няма да бъде записан.
        </p>
        <div className={styles.commandLine}>{preview.command.idempotencyKey}</div>
      </div>
      <div className={styles.placementActions}>
        <button type="button" className={styles.ghostButton} onClick={onClose}>
          Отказ
        </button>
        <button type="button" className={styles.disabledButton} disabled>
          Записването ще бъде добавено следващо
        </button>
      </div>
    </aside>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.placementFactRow}>
      <span className={styles.placementFactLabel}>{label}</span>
      <span className={styles.placementFactValue}>{value}</span>
    </div>
  );
}

function formatPlacementDate(value: string) {
  const date = new Date(value);

  return date.toLocaleDateString('bg-BG', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}
