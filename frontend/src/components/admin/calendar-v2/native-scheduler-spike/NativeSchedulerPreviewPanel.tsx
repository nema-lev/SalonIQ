'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Clock3, MessageCircle, Scissors, UserRound } from 'lucide-react';
import type { CalendarV2CalendarBlock, CalendarV2Command, CalendarV2DemandItem } from '..';
import { getNativeSchedulerCancelBookingIntent } from './native-scheduler-cancel-booking';
import { getNativeSchedulerConfirmBookingIntent } from './native-scheduler-confirm-booking';
import { commandPreviewLabel } from './native-scheduler-drag';
import { getNativeSchedulerRescheduleBookingIntent } from './native-scheduler-reschedule-booking';
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

export type NativeSchedulerReschedulePanelContext = {
  sourceBlock: CalendarV2CalendarBlock;
  target: {
    staffName: string;
    timeLabel: string;
    startAt: string;
  } | null;
  hasConflict: boolean;
  onCancel: () => void;
};

type NativeSchedulerPreviewPanelProps = {
  selectedBlock: CalendarV2CalendarBlock | null;
  lastCommand: CalendarV2Command | null;
  placementContext?: NativeSchedulerPlacementPanelContext | null;
  rescheduleContext?: NativeSchedulerReschedulePanelContext | null;
  readOnly?: boolean;
  confirmBooking?: {
    enabled: boolean;
    onConfirm?: (appointmentId: string) => Promise<void>;
  };
  cancelBooking?: {
    enabled: boolean;
    onCancel?: (appointmentId: string) => Promise<void>;
  };
  rescheduleBooking?: {
    enabled: boolean;
    onStart?: (block: CalendarV2CalendarBlock) => void;
  };
};

export function NativeSchedulerPreviewPanel({
  selectedBlock,
  lastCommand,
  placementContext = null,
  rescheduleContext = null,
  readOnly = false,
  confirmBooking,
  cancelBooking,
  rescheduleBooking,
}: NativeSchedulerPreviewPanelProps) {
  const appointment = selectedBlock?.appointment;
  const clientName = appointment?.client.name ?? selectedBlock?.title ?? '';
  const serviceName = appointment?.service.name ?? selectedBlock?.subtitle ?? 'Услугата липсва';
  const staffName = appointment?.staff.name ?? selectedBlock?.cardSummary?.staffLabel ?? selectedBlock?.staffId ?? '';
  const isPlacementContext = Boolean(placementContext);
  const isRescheduleContext = Boolean(rescheduleContext);
  const confirmIntent = useMemo(
    () =>
      getNativeSchedulerConfirmBookingIntent({
        selectedBlock,
        canWrite: Boolean(confirmBooking?.enabled && confirmBooking.onConfirm),
        placementContextActive: isPlacementContext || isRescheduleContext,
      }),
    [confirmBooking?.enabled, confirmBooking?.onConfirm, isPlacementContext, isRescheduleContext, selectedBlock],
  );
  const cancelIntent = useMemo(
    () =>
      getNativeSchedulerCancelBookingIntent({
        selectedBlock,
        canWrite: Boolean(cancelBooking?.enabled && cancelBooking.onCancel),
        placementContextActive: isPlacementContext || isRescheduleContext,
      }),
    [cancelBooking?.enabled, cancelBooking?.onCancel, isPlacementContext, isRescheduleContext, selectedBlock],
  );
  const rescheduleIntent = useMemo(
    () =>
      getNativeSchedulerRescheduleBookingIntent({
        selectedBlock,
        canWrite: Boolean(rescheduleBooking?.enabled && rescheduleBooking.onStart),
        placementContextActive: isPlacementContext,
        rescheduleContextActive: isRescheduleContext,
      }),
    [
      isPlacementContext,
      isRescheduleContext,
      rescheduleBooking?.enabled,
      rescheduleBooking?.onStart,
      selectedBlock,
    ],
  );
  const [confirmBookingOpen, setConfirmBookingOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmBookingOpen(false);
    setIsConfirming(false);
    setConfirmError(null);
    setConfirmCancelOpen(false);
    setIsCancelling(false);
    setCancelError(null);
  }, [cancelIntent?.appointmentId, confirmIntent?.appointmentId, isPlacementContext, isRescheduleContext]);

  const handleConfirmBooking = async () => {
    if (!confirmIntent || !confirmBooking?.onConfirm) return;

    setIsConfirming(true);
    setConfirmError(null);

    try {
      await confirmBooking.onConfirm(confirmIntent.appointmentId);
      setConfirmBookingOpen(false);
    } catch (error) {
      setConfirmError(
        error instanceof Error && error.message
          ? error.message
          : 'Не успяхме да потвърдим часа. Опитайте отново.',
      );
    } finally {
      setIsConfirming(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelIntent || !cancelBooking?.onCancel) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      await cancelBooking.onCancel(cancelIntent.appointmentId);
      setConfirmCancelOpen(false);
    } catch (error) {
      setCancelError(
        error instanceof Error && error.message
          ? error.message
          : 'Не успяхме да откажем часа. Опитайте отново.',
      );
    } finally {
      setIsCancelling(false);
    }
  };
  const panelSubtitle =
    isPlacementContext || isRescheduleContext || (readOnly && !confirmIntent && !cancelIntent && !rescheduleIntent)
      ? 'Само преглед'
      : 'Детайли и действия';

  return (
    <section className={`${styles.previewPanel} ${selectedBlock || isPlacementContext || isRescheduleContext ? '' : styles.previewPanelEmpty}`}>
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderText}>
          <p className={styles.panelTitle}>
            {isPlacementContext ? 'Поставяне на заявка' : isRescheduleContext ? 'Преместване на час' : 'Детайли за час'}
          </p>
          <p className={styles.panelSubtitle}>{panelSubtitle}</p>
        </div>
        <span className={placementContext?.hasConflict || rescheduleContext?.hasConflict ? styles.panelCountWarning : styles.panelCount}>
          {getPanelCountLabel({ selectedBlock, placementContext, rescheduleContext })}
        </span>
      </div>
      <div className={styles.previewContent}>
        {placementContext ? (
          <PlacementContextView context={placementContext} />
        ) : rescheduleContext ? (
          <RescheduleContextView context={rescheduleContext} />
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
            {rescheduleIntent && (
              <div className={styles.rescheduleBookingSection}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => {
                    if (!selectedBlock) return;
                    rescheduleBooking?.onStart?.(selectedBlock);
                    setConfirmBookingOpen(false);
                    setConfirmCancelOpen(false);
                    setConfirmError(null);
                    setCancelError(null);
                  }}
                >
                  Премести час
                </button>
              </div>
            )}
            {confirmIntent && (
              <div className={styles.confirmBookingSection}>
                {!confirmBookingOpen ? (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => {
                      setConfirmBookingOpen(true);
                      setConfirmCancelOpen(false);
                      setConfirmError(null);
                      setCancelError(null);
                    }}
                  >
                    Потвърди час
                  </button>
                ) : (
                  <div className={styles.confirmBookingConfirm}>
                    <p className={styles.confirmBookingTitle}>Да потвърдим ли часа?</p>
                    <p className={styles.confirmBookingBody}>
                      Часът ще бъде потвърден и ще остане в графика.
                    </p>
                    {confirmError && <p className={styles.previewConflictNote}>{confirmError}</p>}
                    <div className={styles.confirmBookingActions}>
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => {
                          void handleConfirmBooking();
                        }}
                        disabled={isConfirming}
                      >
                        {isConfirming ? 'Потвърждаване…' : 'Потвърди'}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => {
                          setConfirmBookingOpen(false);
                          setConfirmError(null);
                        }}
                        disabled={isConfirming}
                      >
                        Назад
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {cancelIntent && (
              <div className={styles.cancelBookingSection}>
                {!confirmCancelOpen ? (
                  <button
                    type="button"
                    className={styles.dangerButton}
                    onClick={() => {
                      setConfirmCancelOpen(true);
                      setConfirmBookingOpen(false);
                      setConfirmError(null);
                      setCancelError(null);
                    }}
                  >
                    Откажи час
                  </button>
                ) : (
                  <div className={styles.cancelBookingConfirm}>
                    <p className={styles.cancelBookingTitle}>Да откажем ли часа?</p>
                    <p className={styles.cancelBookingBody}>
                      Часът ще бъде премахнат от графика. Това действие ще освободи слота.
                    </p>
                    {cancelError && <p className={styles.previewConflictNote}>{cancelError}</p>}
                    <div className={styles.cancelBookingActions}>
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => {
                          void handleConfirmCancel();
                        }}
                        disabled={isCancelling}
                      >
                        {isCancelling ? 'Отказване…' : 'Откажи часа'}
                      </button>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => {
                          setConfirmCancelOpen(false);
                          setCancelError(null);
                        }}
                        disabled={isCancelling}
                      >
                        Назад
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
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

        {lastCommand && !placementContext && !rescheduleContext && (
          <div className={styles.commandLine}>{commandPreviewLabel(lastCommand)}</div>
        )}
      </div>
    </section>
  );
}

function RescheduleContextView({ context }: { context: NativeSchedulerReschedulePanelContext }) {
  const appointment = context.sourceBlock.appointment;
  const clientName = appointment?.client.name ?? context.sourceBlock.title;
  const serviceName = appointment?.service.name ?? context.sourceBlock.subtitle ?? 'Услугата липсва';
  const targetDate = context.target ? formatPlacementDate(context.target.startAt) : null;

  return (
    <div className={styles.placementContext}>
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

      {context.target ? (
        <p className={styles.previewReadOnlyNote}>
          Нов слот: {targetDate}, {context.target.timeLabel} · {context.target.staffName}.
        </p>
      ) : (
        <div className={styles.previewEmptyState}>
          <span className={styles.emptyIcon}>
            <CalendarCheck2 size={17} strokeWidth={2.5} />
          </span>
          <div className={styles.emptyText}>
            <p className={styles.emptyTitle}>Преместване на час</p>
            <p className={styles.emptyCopy}>Изберете нов свободен час в календара.</p>
          </div>
        </div>
      )}

      {context.hasConflict && (
        <p className={styles.previewConflictNote}>
          Този час вече е зает.
        </p>
      )}

      <p className={styles.previewReadOnlyNote}>
        Часът ще се премести само след натискане на „Запази промяната“.
      </p>

      <button type="button" className={styles.ghostButton} onClick={context.onCancel}>
        Отказ
      </button>
    </div>
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
            <p className={styles.emptyCopy}>
              Изберете свободен час в календара. Часът още не е записан.
            </p>
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
  rescheduleContext,
}: {
  selectedBlock: CalendarV2CalendarBlock | null;
  placementContext: NativeSchedulerPlacementPanelContext | null;
  rescheduleContext: NativeSchedulerReschedulePanelContext | null;
}) {
  if (placementContext?.hasConflict) return 'Конфликт';
  if (placementContext?.target) return 'Избран слот';
  if (placementContext) return 'Избираме слот';
  if (rescheduleContext?.hasConflict) return 'Конфликт';
  if (rescheduleContext?.target) return 'Избран слот';
  if (rescheduleContext) return 'Избираме слот';
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
