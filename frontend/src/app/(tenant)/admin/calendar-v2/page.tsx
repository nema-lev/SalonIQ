import type { Metadata } from 'next';
import { CalendarV2RealDataAdapter } from '@/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter';

export const metadata: Metadata = {
  title: 'Calendar V2',
  robots: 'noindex, nofollow',
};

export default function AdminCalendarV2Page() {
  if (process.env.NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW === 'true') {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
        Calendar V2 route alias is disabled.
      </section>
    );
  }

  return <CalendarV2RealDataAdapter />;
}
