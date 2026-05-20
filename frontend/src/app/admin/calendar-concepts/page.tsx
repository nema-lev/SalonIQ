import type { Metadata } from 'next';
import { CalendarConceptPlayground } from '@/components/admin/calendar-concepts/CalendarConceptPlayground';

export const metadata: Metadata = {
  title: 'Calendar UX Concepts',
  robots: 'noindex, nofollow',
};

export default function AdminCalendarConceptsPage() {
  return <CalendarConceptPlayground />;
}
