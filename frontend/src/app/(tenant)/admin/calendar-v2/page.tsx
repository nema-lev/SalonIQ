import type { Metadata } from 'next';
import { CalendarV2RealDataAdapter } from '@/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter';
import { PlacementBoardConcept } from '@/components/admin/calendar-v2/placement-board-spike';

export const metadata: Metadata = {
  title: 'Calendar V2',
  robots: 'noindex, nofollow',
};

type AdminCalendarV2PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function AdminCalendarV2Page({ searchParams }: AdminCalendarV2PageProps) {
  if (process.env.NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW === 'true') {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
        Calendar V2 route alias is disabled.
      </section>
    );
  }

  if (
    getSearchParam(searchParams, 'sample') === '1' &&
    getSearchParam(searchParams, 'concept') === 'placement-board'
  ) {
    return <PlacementBoardConcept />;
  }

  return <CalendarV2RealDataAdapter />;
}

function getSearchParam(
  searchParams: AdminCalendarV2PageProps['searchParams'],
  key: string,
) {
  const value = searchParams?.[key];

  return Array.isArray(value) ? value[0] : value;
}
