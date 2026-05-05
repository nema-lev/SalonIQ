'use client';

import type { CalendarV2DemandItem, PlaceRequestCommand } from '..';
import styles from './native-scheduler.module.css';

export type NativeSchedulerPlacementPreviewState = {
  demandItem: CalendarV2DemandItem;
  command: PlaceRequestCommand;
  staffName: string;
  timeLabel: string;
};

type NativeSchedulerPlacementPreviewProps = {
  preview: NativeSchedulerPlacementPreviewState;
  onClose: () => void;
};

export function NativeSchedulerPlacementPreview({
  preview,
  onClose,
}: NativeSchedulerPlacementPreviewProps) {
  return (
    <aside className={styles.placementPanel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>Placement preview</p>
        <span className={styles.panelCount}>{preview.command.type}</span>
      </div>
      <div className={styles.placementContent}>
        <p className={styles.previewTitle}>
          Place request for {preview.demandItem.client.name} / {preview.demandItem.service.name} at{' '}
          {preview.timeLabel} with {preview.staffName}
        </p>
        <p className={styles.previewMeta}>
          Local command only. No appointment API is called by this preview.
        </p>
        <div className={styles.commandLine}>{preview.command.idempotencyKey}</div>
      </div>
      <div className={styles.placementActions}>
        <button type="button" className={styles.ghostButton} onClick={onClose}>
          Close
        </button>
        <button type="button" className={styles.disabledButton} disabled>
          Confirm disabled
        </button>
      </div>
    </aside>
  );
}
