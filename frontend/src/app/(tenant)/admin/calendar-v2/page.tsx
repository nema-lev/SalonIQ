import type { Metadata } from 'next';
import { NativeSchedulerV2Spike } from '@/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike';

export const metadata: Metadata = {
  title: 'Calendar V2 Spike',
  robots: 'noindex, nofollow',
};

export default function AdminCalendarV2SpikePage() {
  if (process.env.NEXT_PUBLIC_ENABLE_CALENDAR_V2_SPIKE !== 'true') {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600">
        Calendar V2 native scheduler spike is disabled.
      </section>
    );
  }

  return <NativeSchedulerV2Spike />;
}
