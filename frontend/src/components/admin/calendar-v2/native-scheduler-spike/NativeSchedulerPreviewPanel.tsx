'use client';

import { CalendarCheck2, Clock3, MessageCircle, Scissors, UserRound } from 'lucide-react';
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
  const clientName = appointment?.client.name ?? selectedBlock?.title ?? '';
  const serviceName = appointment?.service.name ?? selectedBlock?.subtitle ?? 'Service unavailable';
  const staffName = appointment?.staff.name ?? selectedBlock?.cardSummary?.staffLabel ?? selectedBlock?.staffId ?? '';

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
            <div className={styles.previewSummaryCard}>
              <span className={styles.previewAvatar}>{getInitials(clientName)}</span>
              <span className={styles.previewSummaryText}>
                <span className={styles.previewClientName}>{clientName}</span>
                <span className={styles.previewServiceLine}>
                  <Scissors size={12} strokeWidth={2.5} />
                  {serviceName}
                </span>
              </span>
            </div>
            <div className={styles.previewQuickFacts}>
              <span>
                <Clock3 size={13} strokeWidth={2.5} />
                {formatRange(selectedBlock)}
              </span>
              <span>
                <UserRound size={13} strokeWidth={2.5} />
                {staffName}
              </span>
            </div>
            {appointment && (
              <div className={styles.previewStatusRow}>
                <PreviewFact
                  icon={<CalendarCheck2 size={13} strokeWidth={2.5} />}
                  label="Status"
                  value={formatBookingStatus(appointment)}
                />
              </div>
            )}
            {appointment?.communicationState && appointment.communicationState !== 'none' && (
              <p className={styles.previewMessage}>
                <MessageCircle size={13} strokeWidth={2.5} />
                Message: {formatState(appointment.communicationState)}
              </p>
            )}
            {appointment?.notes && <p className={styles.previewNote}>{appointment.notes}</p>}
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

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';

  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatBookingStatus(appointment: NonNullable<CalendarV2CalendarBlock['appointment']>) {
  return `${formatState(appointment.schedulingState)} · ${formatState(appointment.visitProgress)}`;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
