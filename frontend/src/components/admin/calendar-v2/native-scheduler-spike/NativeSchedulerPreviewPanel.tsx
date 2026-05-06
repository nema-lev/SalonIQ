'use client';

import { CalendarCheck2, Clock3, Scissors, UserRound } from 'lucide-react';
import type { CalendarV2CalendarBlock, CalendarV2Command } from '..';
import { commandPreviewLabel } from './native-scheduler-drag';
import styles from './native-scheduler.module.css';

type NativeSchedulerPreviewPanelProps = {
  selectedBlock: CalendarV2CalendarBlock | null;
  lastCommand: CalendarV2Command | null;
  readOnly?: boolean;
};

export function NativeSchedulerPreviewPanel({
  selectedBlock,
  lastCommand,
  readOnly = false,
}: NativeSchedulerPreviewPanelProps) {
  const appointment = selectedBlock?.appointment;

  return (
    <section className={`${styles.previewPanel} ${selectedBlock ? '' : styles.previewPanelEmpty}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>Booking Detail</p>
          <p className={styles.panelSubtitle}>{readOnly ? 'Read-only selection' : 'Local preview'}</p>
        </div>
        <span className={styles.panelCount}>{selectedBlock ? 'Selected' : 'None'}</span>
      </div>
      <div className={styles.previewContent}>
        {selectedBlock ? (
          <>
            <p className={styles.previewTitle}>
              {appointment?.client.name ?? selectedBlock.title}
            </p>
            <div className={styles.previewFacts}>
              <PreviewFact
                icon={<Clock3 size={13} strokeWidth={2.5} />}
                label="Time"
                value={formatRange(selectedBlock)}
              />
              <PreviewFact
                icon={<Scissors size={13} strokeWidth={2.5} />}
                label="Service"
                value={appointment?.service.name ?? selectedBlock.subtitle ?? 'Service unavailable'}
              />
              <PreviewFact
                icon={<UserRound size={13} strokeWidth={2.5} />}
                label="Staff"
                value={appointment?.staff.name ?? selectedBlock.cardSummary?.staffLabel ?? selectedBlock.staffId}
              />
            </div>
            <p className={styles.previewMeta}>
              {appointment?.visitProgress ? `Visit: ${formatState(appointment.visitProgress)}` : selectedBlock.kind}
            </p>
          </>
        ) : (
          <div className={styles.previewEmptyState}>
            <span className={styles.emptyIcon}>
              <CalendarCheck2 size={17} strokeWidth={2.5} />
            </span>
            <div className={styles.emptyText}>
              <p className={styles.emptyTitle}>Select a booking</p>
              <p className={styles.emptyCopy}>Appointment details appear here without enabling edits.</p>
            </div>
          </div>
        )}

        {lastCommand && (
          <div className={styles.commandLine}>{commandPreviewLabel(lastCommand)}</div>
        )}
      </div>
    </section>
  );
}

function PreviewFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.previewFact}>
      <span className={styles.previewFactIcon}>{icon}</span>
      <span className={styles.previewFactText}>
        <span className={styles.previewFactLabel}>{label}</span>
        <span className={styles.previewFactValue}>{value}</span>
      </span>
    </div>
  );
}

function formatRange(block: CalendarV2CalendarBlock) {
  const start = new Date(block.startAt);
  const end = new Date(block.endAt);

  return `${formatTime(start)}-${formatTime(end)}`;
}

function formatState(value: string) {
  return value.replaceAll('_', ' ');
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
