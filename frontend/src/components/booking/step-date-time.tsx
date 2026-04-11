'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DayPicker } from 'react-day-picker';
import { format, addDays, startOfToday, isBefore } from 'date-fns';
import { bg } from 'date-fns/locale';
import { ChevronLeft, Clock, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTenant } from '@/lib/tenant-context';
import type { BookingFormData } from '@/types/booking';
import 'react-day-picker/dist/style.css';

interface TimeSlot {
  start: string;
  end: string;
  remainingSpots?: number;
  capacity?: number;
}

interface StepDateTimeProps {
  serviceId: string;
  staffId: string;
  onNext: (data: Partial<BookingFormData>) => void;
  onBack: () => void;
}

const DAY_MAP: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

export function StepDateTime({ serviceId, staffId, onNext, onBack }: StepDateTimeProps) {
  const tenant = useTenant();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  const today = startOfToday();
  const maxDate = addDays(today, tenant.maxAdvanceBookingDays);

  // Намери дните, в които салонът е отворен (за да ги показва в календара)
  const disabledDays = (date: Date) => {
    const dayKey = DAY_MAP[date.getDay()];
    const daySchedule = tenant.workingHours[dayKey];
    const isPast = isBefore(date, today);
    const isTooFar = date > maxDate;
    const isClosedDay = !daySchedule?.isOpen;
    return isPast || isTooFar || isClosedDay;
  };

  // Зареди слотовете за избраната дата
  const { data: slots, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['slots', serviceId, staffId, selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null],
    queryFn: () =>
      apiClient.get<TimeSlot[]>('/appointments/slots', {
        serviceId,
        staffId,
        date: format(selectedDate!, 'yyyy-MM-dd'),
      }),
    enabled: !!selectedDate,
    staleTime: 30 * 1000, // 30 секунди — слотовете се променят бързо
  });
  const resolvedSlots = slotsError || !slots ? [] : slots;

  const handleSelectSlot = (slot: string) => {
    setSelectedSlot(slot);
  };

  const handleContinue = () => {
    if (!selectedDate || !selectedSlot) return;

    // Конструирай пълен ISO datetime
    const [hours, minutes] = selectedSlot.split(':').map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(hours, minutes, 0, 0);

    onNext({
      date: format(selectedDate, 'yyyy-MM-dd'),
      timeSlot: selectedSlot,
      startAt: dateTime.toISOString(),
      displayDate: format(selectedDate, "EEEE, d MMMM yyyy 'г.'", { locale: bg }),
    });
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Назад
      </button>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Изберете дата и час</h2>
      <p className="text-gray-500 mb-6">Показваме само свободните часове в реално време</p>

      {/* Calendar */}
      <div
        className="mb-6 overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-3 shadow-[0_18px_48px_rgba(73,39,142,0.08)] backdrop-blur-xl"
        style={{ ['--rdp-cell-size' as string]: 'min(48px, calc((100vw - 76px) / 7))' }}
      >
        <DayPicker
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            setSelectedDate(date);
            setSelectedSlot(null);
          }}
          disabled={disabledDays}
          locale={bg}
          fromDate={today}
          toDate={maxDate}
          className="booking-day-picker"
        />
      </div>

      {/* Time slots */}
      {selectedDate && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">
            {format(selectedDate, "d MMMM", { locale: bg })} — свободни часове:
          </h3>

          {slotsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
            </div>
          ) : resolvedSlots && resolvedSlots.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {resolvedSlots.map((slot) => (
                <button
                  key={slot.start}
                  onClick={() => handleSelectSlot(slot.start)}
                  className={`
                    py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-150
                    ${selectedSlot === slot.start
                      ? 'bg-[var(--color-primary)] text-white shadow-md scale-105'
                      : 'bg-gray-50 text-gray-700 hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] border border-gray-200'
                    }
                  `}
                >
                  <span className="flex items-center gap-1 justify-center">
                    <Clock className="w-3 h-3" />
                    {slot.start}
                  </span>
                  {typeof slot.remainingSpots === 'number' && typeof slot.capacity === 'number' && (
                    <span className="mt-1 block text-[11px] opacity-80">
                      {slot.remainingSpots} / {slot.capacity} места
                    </span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <p className="text-gray-500 font-medium">Няма свободни часове за тази дата</p>
              <p className="text-sm text-gray-400 mt-1">Изберете друга дата</p>
            </div>
          )}
        </div>
      )}

      {/* Continue button */}
      {selectedDate && selectedSlot && (
        <button
          onClick={handleContinue}
          className="
            w-full mt-6 py-4 rounded-xl font-semibold text-white
            bg-[var(--color-primary)] hover:opacity-90 active:scale-[0.99]
            transition-all duration-150 shadow-lg shadow-[var(--color-primary)]/25
          "
        >
          Продължи →
        </button>
      )}
    </div>
  );
}
