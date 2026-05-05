'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type {
  CalendarBoardResponse,
  Service,
  WaitlistEntry,
} from './calendar-model';

const EMPTY_WAITLIST_ENTRIES: WaitlistEntry[] = [];
const EMPTY_SERVICES: Service[] = [];

type UseAdminCalendarBoardDataOptions = {
  rangeStart: Date;
  rangeEndExclusive: Date;
  enabled?: boolean;
};

export function useAdminCalendarBoardData({
  rangeStart,
  rangeEndExclusive,
  enabled = true,
}: UseAdminCalendarBoardDataOptions) {
  const rangeStartIso = rangeStart.toISOString();
  const rangeEndExclusiveIso = rangeEndExclusive.toISOString();

  const calendarBoardQuery = useQuery({
    queryKey: ['appointments-calendar-board', rangeStartIso, rangeEndExclusiveIso],
    queryFn: () =>
      apiClient.get<CalendarBoardResponse>('/appointments/calendar-board', {
        from: rangeStartIso,
        to: rangeEndExclusiveIso,
      }),
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,
    refetchOnWindowFocus: 'always',
    enabled,
  });

  const waitlistQuery = useQuery({
    queryKey: ['appointments-waitlist'],
    queryFn: () => apiClient.get<WaitlistEntry[]>('/appointments/waitlist'),
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
    refetchOnWindowFocus: 'always',
    enabled,
  });

  const servicesQuery = useQuery({
    queryKey: ['admin-calendar-services'],
    queryFn: () => apiClient.get<Service[]>('/services/admin'),
    staleTime: 60 * 1000,
    enabled,
  });

  return {
    calendarBoard: calendarBoardQuery.data,
    waitlistEntries: waitlistQuery.data ?? EMPTY_WAITLIST_ENTRIES,
    services: servicesQuery.data ?? EMPTY_SERVICES,
    isCalendarBoardLoading: calendarBoardQuery.isLoading,
    isInitialLoading: calendarBoardQuery.isLoading || waitlistQuery.isLoading || servicesQuery.isLoading,
    isFetching:
      calendarBoardQuery.isFetching || waitlistQuery.isFetching || servicesQuery.isFetching,
    error: calendarBoardQuery.error ?? waitlistQuery.error ?? servicesQuery.error ?? null,
    calendarBoardError: calendarBoardQuery.error,
    waitlistError: waitlistQuery.error,
    servicesError: servicesQuery.error,
    refetchCalendarBoard: calendarBoardQuery.refetch,
    refetchWaitlist: waitlistQuery.refetch,
    refetchServices: servicesQuery.refetch,
  };
}
