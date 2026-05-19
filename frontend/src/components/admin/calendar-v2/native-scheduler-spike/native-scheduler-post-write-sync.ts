import { CALENDAR_V2_REFRESH_WARNING_MESSAGE } from './native-scheduler-action-errors';

export const CALENDAR_V2_POST_WRITE_REFRESH_WARNING = CALENDAR_V2_REFRESH_WARNING_MESSAGE;

export type NativeSchedulerPostWriteSyncStatus = 'synced' | 'refresh_warning';

export type NativeSchedulerPostWriteSyncResult<TRefresh> =
  | {
      status: 'synced';
      refreshResult: TRefresh;
    }
  | {
      status: 'refresh_warning';
      refreshResult?: TRefresh;
    };

type AttemptNativeSchedulerPostWriteSyncOptions<TRefresh> = {
  refresh: () => Promise<TRefresh>;
  isRefreshResultUsable?: (refreshResult: TRefresh) => boolean;
};

export async function attemptNativeSchedulerPostWriteSync<TRefresh>({
  refresh,
  isRefreshResultUsable = () => true,
}: AttemptNativeSchedulerPostWriteSyncOptions<TRefresh>): Promise<NativeSchedulerPostWriteSyncResult<TRefresh>> {
  try {
    const refreshResult = await refresh();

    if (!isRefreshResultUsable(refreshResult)) {
      return {
        status: 'refresh_warning',
        refreshResult,
      };
    }

    return {
      status: 'synced',
      refreshResult,
    };
  } catch {
    return {
      status: 'refresh_warning',
    };
  }
}

type RunNativeSchedulerPostWriteMutationOptions<TMutation, TRefresh> =
  AttemptNativeSchedulerPostWriteSyncOptions<TRefresh> & {
    mutate: () => Promise<TMutation>;
  };

export async function runNativeSchedulerPostWriteMutation<TMutation, TRefresh>({
  mutate,
  refresh,
  isRefreshResultUsable,
}: RunNativeSchedulerPostWriteMutationOptions<TMutation, TRefresh>) {
  const mutationResult = await mutate();
  const syncResult = await attemptNativeSchedulerPostWriteSync({
    refresh,
    isRefreshResultUsable,
  });

  return {
    mutationResult,
    syncResult,
  };
}

export function shouldClearNativeSchedulerSelectionAfterPostWriteSync({
  syncStatus,
  appointmentVisibleAfterRefresh,
}: {
  syncStatus: NativeSchedulerPostWriteSyncStatus;
  appointmentVisibleAfterRefresh?: boolean;
}) {
  return syncStatus === 'refresh_warning' || appointmentVisibleAfterRefresh === false;
}
