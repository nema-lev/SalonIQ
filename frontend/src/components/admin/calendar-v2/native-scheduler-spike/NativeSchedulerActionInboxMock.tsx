'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { AlertCircle, GripVertical } from 'lucide-react';
import type { ActionInboxItem, CalendarV2DemandItem } from '..';
import styles from './native-scheduler.module.css';

type NativeSchedulerActionInboxMockProps = {
  demandItems: CalendarV2DemandItem[];
  actionItems: ActionInboxItem[];
  onStartDemandDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    item: CalendarV2DemandItem,
  ) => void;
  readOnly?: boolean;
};

export function NativeSchedulerActionInboxMock({
  demandItems,
  actionItems,
  onStartDemandDrag,
  readOnly = false,
}: NativeSchedulerActionInboxMockProps) {
  const demandById = new Map(demandItems.map((item) => [item.id, item]));
  const requiresAction = actionItems.filter((item) => item.bucket === 'requires_action');
  const updates = actionItems.filter((item) => item.bucket === 'updates');
  const draggableDemandActions = requiresAction.filter(
    (item) => item.source === 'waitlist' && demandById.has(item.sourceId),
  );
  const secondaryActions = requiresAction.filter(
    (item) => item.source !== 'waitlist' || !demandById.has(item.sourceId),
  );

  return (
    <section className={styles.inboxPanel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelTitle}>Action Inbox</p>
        <span className={styles.panelCount}>{requiresAction.length}</span>
      </div>

      <div className={styles.inboxContent}>
        <p className={styles.inboxSectionLabel}>Requires action</p>

        {draggableDemandActions.map((action) => {
          const demand = demandById.get(action.sourceId);
          if (!demand) return null;

          return (
            <article
              key={action.id}
              className={`${styles.inboxItem} ${readOnly ? styles.inboxItemReadOnly : ''}`}
            >
              {!readOnly && (
                <button
                  type="button"
                  className={styles.inboxGrip}
                  aria-label={`Place ${demand.client.name}`}
                  onPointerDown={(event) => onStartDemandDrag(event, demand)}
                >
                  <GripVertical size={16} strokeWidth={2.6} />
                </button>
              )}
              <div className={styles.inboxText}>
                <p className={styles.inboxTitle}>{demand.client.name}</p>
                <p className={styles.inboxSubtitle}>
                  {demand.service.name} · {demand.preferredWindow.label}
                </p>
                <span className={styles.inboxTag}>{readOnly ? 'Read-only' : 'Drag to place'}</span>
              </div>
            </article>
          );
        })}

        {secondaryActions.map((action) => (
          <article key={action.id} className={`${styles.inboxItem} ${styles.secondaryItem}`}>
            <div className={styles.inboxText}>
              <p className={styles.inboxTitle}>
                <AlertCircle size={13} strokeWidth={2.4} /> {action.title}
              </p>
              <p className={styles.inboxSubtitle}>{action.subtitle}</p>
              <span className={styles.inboxTag}>{formatGroup(action.group)}</span>
            </div>
          </article>
        ))}

        <details className={styles.updatesDetails}>
          <summary className={styles.updatesSummary}>Updates · {updates.length}</summary>
          {updates.map((action) => (
            <article key={action.id} className={`${styles.inboxItem} ${styles.secondaryItem}`}>
              <div className={styles.inboxText}>
                <p className={styles.inboxTitle}>{action.title}</p>
                <p className={styles.inboxSubtitle}>{action.subtitle}</p>
              </div>
            </article>
          ))}
        </details>
      </div>
    </section>
  );
}

function formatGroup(group: ActionInboxItem['group']) {
  if (group === 'needs_approval') return 'Pending approval';
  if (group === 'needs_recovery') return 'Recovery';
  if (group === 'needs_reply') return 'Reply';
  return 'Action';
}
