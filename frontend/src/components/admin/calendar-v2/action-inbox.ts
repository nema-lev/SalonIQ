import type {
  Appointment,
  NotificationLogEntry,
  WaitlistEntry,
} from '../calendar-model';
import {
  formatAppointmentDay,
  getCalendarOwnerState,
  getRequestWindowLabel,
  isCancelledCalendarItem,
  isRequestOwnerState,
} from '../calendar-model';
import type { CalendarV2CommandType } from './commands';

export type ActionInboxBucket = 'requires_action' | 'updates';
export type ActionInboxGroup =
  | 'needs_scheduling'
  | 'needs_approval'
  | 'needs_recovery'
  | 'needs_reply'
  | 'update';
export type ActionInboxStatus = 'open' | 'handled' | 'archived';
export type ActionInboxSource = 'appointment' | 'waitlist' | 'notification' | 'system';

export type ActionInboxActionType =
  | CalendarV2CommandType
  | 'openDetails'
  | 'findFirstAvailable'
  | 'replyToClient'
  | 'retryNotification';

export interface ActionInboxActionDescriptor {
  type: ActionInboxActionType;
  label: string;
  commandType?: CalendarV2CommandType;
}

export interface ActionInboxItem {
  id: string;
  bucket: ActionInboxBucket;
  group: ActionInboxGroup;
  status: ActionInboxStatus;
  source: ActionInboxSource;
  sourceId: string;
  title: string;
  subtitle?: string;
  sortAt: string;
  primaryAction: ActionInboxActionDescriptor | null;
  secondaryActions: ActionInboxActionDescriptor[];
}

export interface BuildActionInboxItemsInput {
  appointments?: Appointment[];
  waitlist?: WaitlistEntry[];
  notifications?: NotificationLogEntry[];
}

export interface ActionInboxBuckets {
  requires_action: ActionInboxItem[];
  updates: ActionInboxItem[];
}

export interface ActionInboxCounts {
  requiresAction: number;
  updates: number;
  open: number;
  handled: number;
  archived: number;
  total: number;
}

export function buildActionInboxItems(input: BuildActionInboxItemsInput): ActionInboxItem[] {
  return [
    ...(input.waitlist ?? []).map(projectWaitlistToActionInboxItem),
    ...(input.appointments ?? []).flatMap((appointment) => {
      const item = projectAppointmentToActionInboxItem(appointment);
      return item ? [item] : [];
    }),
    ...(input.notifications ?? []).flatMap((notification) => {
      const item = projectNotificationToActionInboxItem(notification);
      return item ? [item] : [];
    }),
  ].sort((left, right) => new Date(left.sortAt).getTime() - new Date(right.sortAt).getTime());
}

export function splitActionInboxBuckets(items: ActionInboxItem[]): ActionInboxBuckets {
  return {
    requires_action: items.filter((item) => item.bucket === 'requires_action'),
    updates: items.filter((item) => item.bucket === 'updates'),
  };
}

export function getActionInboxCounts(items: ActionInboxItem[]): ActionInboxCounts {
  return items.reduce<ActionInboxCounts>(
    (counts, item) => {
      counts.total += 1;
      if (item.bucket === 'requires_action' && item.status === 'open') counts.requiresAction += 1;
      if (item.bucket === 'updates' && item.status === 'open') counts.updates += 1;
      if (item.status === 'open') counts.open += 1;
      if (item.status === 'handled') counts.handled += 1;
      if (item.status === 'archived') counts.archived += 1;
      return counts;
    },
    {
      requiresAction: 0,
      updates: 0,
      open: 0,
      handled: 0,
      archived: 0,
      total: 0,
    },
  );
}

function projectWaitlistToActionInboxItem(entry: WaitlistEntry): ActionInboxItem {
  const isOpen = entry.status === 'waiting' || entry.status === 'notified';

  return {
    id: `waitlist:${entry.id}`,
    bucket: isOpen ? 'requires_action' : 'updates',
    group: isOpen ? 'needs_scheduling' : 'update',
    status: entry.status === 'cancelled' ? 'archived' : entry.status === 'booked' ? 'handled' : 'open',
    source: 'waitlist',
    sourceId: entry.id,
    title: entry.client_name,
    subtitle: `${entry.service_name} | ${getRequestWindowLabel(entry)}`,
    sortAt: entry.updated_at ?? entry.created_at,
    primaryAction: isOpen
      ? {
          type: 'placeRequest',
          label: 'Place request',
          commandType: 'placeRequest',
        }
      : {
          type: 'markUpdateRead',
          label: 'Mark read',
          commandType: 'markUpdateRead',
        },
    secondaryActions: isOpen
      ? [
          {
            type: 'findFirstAvailable',
            label: 'Find first available',
          },
          {
            type: 'archiveActionItem',
            label: 'Archive',
            commandType: 'archiveActionItem',
          },
        ]
      : [],
  };
}

function projectAppointmentToActionInboxItem(appointment: Appointment): ActionInboxItem | null {
  const ownerState = getCalendarOwnerState(appointment);

  if (isRequestOwnerState(appointment)) {
    return {
      id: `appointment:${appointment.id}:approval`,
      bucket: 'requires_action',
      group: 'needs_approval',
      status: 'open',
      source: 'appointment',
      sourceId: appointment.id,
      title: appointment.client_name,
      subtitle: `${appointment.service_name} | ${formatAppointmentDay(appointment.start_at)}`,
      sortAt: appointment.start_at,
      primaryAction: {
        type: 'confirmRequest',
        label: 'Confirm request',
        commandType: 'confirmRequest',
      },
      secondaryActions: [
        {
          type: 'declineRequest',
          label: 'Decline',
          commandType: 'declineRequest',
        },
        {
          type: 'openDetails',
          label: 'Open details',
        },
      ],
    };
  }

  if (!isCancelledCalendarItem(appointment)) {
    return null;
  }

  if (hasConservativeRecoveryCondition(appointment, ownerState)) {
    return {
      id: `appointment:${appointment.id}:recovery`,
      bucket: 'requires_action',
      group: 'needs_recovery',
      status: 'open',
      source: 'appointment',
      sourceId: appointment.id,
      title: appointment.client_name,
      subtitle: `${appointment.service_name} | Client cancellation`,
      sortAt: appointment.start_at,
      primaryAction: {
        type: 'replyToClient',
        label: 'Reply to client',
      },
      secondaryActions: [
        {
          type: 'archiveActionItem',
          label: 'Archive',
          commandType: 'archiveActionItem',
        },
        {
          type: 'openDetails',
          label: 'Open details',
        },
      ],
    };
  }

  return {
    id: `appointment:${appointment.id}:cancelled`,
    bucket: 'updates',
    group: 'update',
    status: 'open',
    source: 'appointment',
    sourceId: appointment.id,
    title: appointment.client_name,
    subtitle: `${appointment.service_name} | Cancelled`,
    sortAt: appointment.start_at,
    primaryAction: {
      type: 'markUpdateRead',
      label: 'Mark read',
      commandType: 'markUpdateRead',
    },
    secondaryActions: [
      {
        type: 'openDetails',
        label: 'Open details',
      },
    ],
  };
}

function projectNotificationToActionInboxItem(notification: NotificationLogEntry): ActionInboxItem | null {
  if (notification.status === 'failed') {
    return {
      id: `notification:${notification.id}:failed`,
      bucket: 'requires_action',
      group: 'needs_reply',
      status: 'open',
      source: 'notification',
      sourceId: notification.id,
      title: notification.type,
      subtitle: notification.error_message ?? notification.channel,
      sortAt: notification.sent_at ?? notification.created_at,
      primaryAction: {
        type: 'retryNotification',
        label: 'Retry notification',
      },
      secondaryActions: [
        {
          type: 'archiveActionItem',
          label: 'Archive',
          commandType: 'archiveActionItem',
        },
      ],
    };
  }

  if (notification.status === 'sent' || notification.status === 'delivered' || notification.status === 'read') {
    return {
      id: `notification:${notification.id}:update`,
      bucket: 'updates',
      group: 'update',
      status: notification.status === 'read' ? 'handled' : 'open',
      source: 'notification',
      sourceId: notification.id,
      title: notification.type,
      subtitle: notification.channel,
      sortAt: notification.delivered_at ?? notification.sent_at ?? notification.created_at,
      primaryAction: {
        type: 'markUpdateRead',
        label: 'Mark read',
        commandType: 'markUpdateRead',
      },
      secondaryActions: [],
    };
  }

  return null;
}

// Recovery is action-required only when the backend owner state clearly says the client cancelled.
function hasConservativeRecoveryCondition(appointment: Appointment, ownerState: string) {
  return ownerState === 'cancelled_by_client' && appointment.cancelled_by === 'client';
}
