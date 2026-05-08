'use client';

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
};

export function NativeSchedulerPlacementPreview({
  preview,
  onClose,
}: NativeSchedulerPlacementPreviewProps) {
  const demand = preview.demandItem;
  const dateLabel = formatPlacementDate(preview.command.target.startAt);
  const durationLabel = `${preview.durationMinutes} мин${
    preview.usesFallbackDuration ? ' · резервна продължителност' : ''
  }`;

  return (
    <aside className={styles.placementPanel}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>Преглед на поставяне · не е записано</p>
          <p className={styles.panelSubtitle}>Само преглед</p>
        </div>
        <span className={preview.hasConflict ? styles.panelCountWarning : styles.panelCount}>
          {preview.hasConflict ? 'Конфликт' : 'Само преглед'}
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
        <p className={styles.previewReadOnlyNote}>
          Това е само преглед. Часът няма да бъде записан.
        </p>
      </div>
      <div className={styles.placementActions}>
        <button type="button" className={styles.ghostButton} onClick={onClose}>
          Отказ
        </button>
        <button type="button" className={styles.disabledButton} disabled>
          Записването ще добавим в следващата стъпка
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
  icon: React.ReactNode;
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
