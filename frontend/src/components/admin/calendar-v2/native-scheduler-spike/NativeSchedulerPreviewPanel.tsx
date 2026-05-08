'use client';

import { CalendarCheck2, Clock3, MessageCircle, Scissors, UserRound } from 'lucide-react';
import type { CalendarV2CalendarBlock, CalendarV2Command, CalendarV2DemandItem } from '..';
import { commandPreviewLabel } from './native-scheduler-drag';
import styles from './native-scheduler.module.css';

export type NativeSchedulerPlacementPanelContext = {
  demandItem: CalendarV2DemandItem;
  target: {
    staffName: string;
    timeLabel: string;
    startAt: string;
  } | null;
  durationMinutes: number;
  usesFallbackDuration: boolean;
  hasConflict: boolean;
  onCancel: () => void;
};

type NativeSchedulerPreviewPanelProps = {
  selectedBlock: CalendarV2CalendarBlock | null;
  lastCommand: CalendarV2Command | null;
  placementContext?: NativeSchedulerPlacementPanelContext | null;
  readOnly?: boolean;
};

export function NativeSchedulerPreviewPanel({
  selectedBlock,
  lastCommand,
  placementContext = null,
  readOnly = false,
}: NativeSchedulerPreviewPanelProps) {
  const appointment = selectedBlock?.appointment;
  const clientName = appointment?.client.name ?? selectedBlock?.title ?? '';
  const serviceName = appointment?.service.name ?? selectedBlock?.subtitle ?? 'Услугата липсва';
  const staffName = appointment?.staff.name ?? selectedBlock?.cardSummary?.staffLabel ?? selectedBlock?.staffId ?? '';
  const isPlacementContext = Boolean(placementContext);

  return (
    <section className={`${styles.previewPanel} ${selectedBlock || isPlacementContext ? '' : styles.previewPanelEmpty}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>{isPlacementContext ? 'Поставяне на заявка' : 'Детайли за час'}</p>
          <p className={styles.panelSubtitle}>{isPlacementContext || readOnly ? 'Само преглед' : 'Локален преглед'}</p>
        </div>
        <span className={placementContext?.hasConflict ? styles.panelCountWarning : styles.panelCount}>
          {getPanelCountLabel({ selectedBlock, placementContext })}
        </span>
      </div>
      <div className={styles.previewContent}>
        {placementContext ? (
          <PlacementContextView context={placementContext} />
        ) : selectedBlock ? (
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
                  label="Състояние"
                  value={formatBookingStatus(appointment)}
                />
              </div>
            )}
            {appointment?.communicationState && appointment.communicationState !== 'none' && (
              <p className={styles.previewMessage}>
                <MessageCircle size={13} strokeWidth={2.5} />
                Съобщение: {formatCommunicationState(appointment.communicationState)}
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
              <p className={styles.emptyTitle}>Изберете час</p>
              <p className={styles.emptyCopy}>Детайлите за избрания час ще се покажат тук без редакция.</p>
            </div>
          </div>
        )}

        {lastCommand && !placementContext && (
          <div className={styles.commandLine}>{commandPreviewLabel(lastCommand)}</div>
        )}
      </div>
    </section>
  );
}

function PlacementContextView({ context }: { context: NativeSchedulerPlacementPanelContext }) {
  const demand = context.demandItem;
  const targetDate = context.target ? formatPlacementDate(context.target.startAt) : null;
  const durationLabel = `${context.durationMinutes} мин${
    context.usesFallbackDuration ? ' · резервна продължителност' : ''
  }`;

  return (
    <div className={styles.placementContext}>
      <div className={styles.previewSummaryCard}>
        <span className={styles.previewAvatar}>{getInitials(demand.client.name)}</span>
        <span className={styles.previewSummaryText}>
          <span className={styles.previewClientName}>{demand.client.name}</span>
          <span className={styles.previewServiceLine}>
            <Scissors size={12} strokeWidth={2.5} />
            {demand.service.name}
          </span>
        </span>
      </div>

      <div className={styles.placementContextFacts}>
        <span>
          <Clock3 size={13} strokeWidth={2.5} />
          {durationLabel}
        </span>
        <span>
          <UserRound size={13} strokeWidth={2.5} />
          {context.target ? context.target.staffName : 'Изберете специалист и час'}
        </span>
      </div>

      {context.target ? (
        <p className={styles.previewReadOnlyNote}>
          {targetDate}, {context.target.timeLabel}. Това е само преглед и часът още не е записан.
        </p>
      ) : (
        <div className={styles.previewEmptyState}>
          <span className={styles.emptyIcon}>
            <CalendarCheck2 size={17} strokeWidth={2.5} />
          </span>
          <div className={styles.emptyText}>
            <p className={styles.emptyTitle}>Избирате слот за заявка</p>
            <p className={styles.emptyCopy}>Изберете свободен час в календара.</p>
          </div>
        </div>
      )}

      {context.hasConflict && (
        <p className={styles.previewConflictNote}>
          Избраният слот има локален конфликт. Засега това не записва час.
        </p>
      )}

      <button type="button" className={styles.ghostButton} onClick={context.onCancel}>
        Отказ
      </button>
    </div>
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

function getPanelCountLabel({
  selectedBlock,
  placementContext,
}: {
  selectedBlock: CalendarV2CalendarBlock | null;
  placementContext: NativeSchedulerPlacementPanelContext | null;
}) {
  if (placementContext?.hasConflict) return 'Конфликт';
  if (placementContext?.target) return 'Избран слот';
  if (placementContext) return 'Активно';
  return selectedBlock ? 'Избран' : 'Няма';
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
  if (appointment.confirmationState === 'confirmed' && appointment.schedulingState === 'scheduled') {
    return 'потвърден';
  }

  return formatSchedulingState(appointment.schedulingState);
}

function formatSchedulingState(value: string) {
  const labels: Record<string, string> = {
    unscheduled: 'без час',
    proposed: 'предложен',
    scheduled: 'насрочен',
    rescheduled: 'преместен',
    cancelled: 'отменен',
    completed: 'приключен',
    no_show: 'неявил се',
  };

  return labels[value] ?? formatState(value);
}

function formatCommunicationState(value: string) {
  const labels: Record<string, string> = {
    pending: 'чака изпращане',
    sent: 'изпратено',
    delivered: 'доставено',
    failed: 'неуспешно',
    read: 'прочетено',
  };

  return labels[value] ?? formatState(value);
}

function formatPlacementDate(value: string) {
  const date = new Date(value);

  return date.toLocaleDateString('bg-BG', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
