'use client';

import type { CalendarV2CalendarBlock, CalendarV2Command } from '..';
import { commandPreviewLabel } from './native-scheduler-drag';
import styles from './native-scheduler.module.css';

type NativeSchedulerPreviewPanelProps = {
  selectedBlock: CalendarV2CalendarBlock | null;
  lastCommand: CalendarV2Command | null;
};

export function NativeSchedulerPreviewPanel({
  selectedBlock,
  lastCommand,
}: NativeSchedulerPreviewPanelProps) {
  const appointment = selectedBlock?.appointment;

  return (
    <section className={styles.previewPanel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>Preview</p>
        <span className={styles.panelCount}>{selectedBlock ? 'Selected' : 'Idle'}</span>
      </div>
      <div className={styles.previewContent}>
        {selectedBlock ? (
          <>
            <p className={styles.previewTitle}>
              {appointment?.client.name ?? selectedBlock.title}
            </p>
            <p className={styles.previewMeta}>
              {appointment?.service.name ?? selectedBlock.subtitle} · {formatRange(selectedBlock)}
            </p>
            <p className={styles.previewMeta}>
              {appointment?.visitProgress ? `Visit: ${appointment.visitProgress}` : selectedBlock.kind}
            </p>
          </>
        ) : (
          <>
            <p className={styles.previewTitle}>No booking selected</p>
            <p className={styles.previewMeta}>Card body opens this local preview.</p>
          </>
        )}

        {lastCommand && (
          <div className={styles.commandLine}>{commandPreviewLabel(lastCommand)}</div>
        )}
      </div>
    </section>
  );
}

function formatRange(block: CalendarV2CalendarBlock) {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);

  return `${formatTime(start)}-${formatTime(end)}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
