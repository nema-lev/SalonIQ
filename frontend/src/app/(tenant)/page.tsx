import { headers } from 'next/headers';
import { BookingWizard } from '@/components/booking/booking-wizard';
import { BusinessHeader } from '@/components/booking/business-header';
import { BusinessInfo } from '@/components/booking/business-info';

export default async function HomePage() {
  return (
    <main
      className="min-h-screen bg-[var(--bg-surface)]"
      style={{
        minHeight: '100vh',
        background: 'transparent',
      }}
    >
      {/* Cover image + logo header */}
      <BusinessHeader />

      <div
        className="max-w-2xl mx-auto px-4 pb-16"
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: '0 16px calc(env(safe-area-inset-bottom, 0px) + 88px)',
        }}
      >
        {/* Стъпков wizard за резервация */}
        <BookingWizard />

        {/* Информация за салона */}
        <BusinessInfo />
      </div>
    </main>
  );
}
