'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DayPicker } from 'react-day-picker';
import { addDays, format, isBefore, startOfToday } from 'date-fns';
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
  preferredStaffId?: string;
  preferredStaffName?: string;
  onNext: (data: Partial<BookingFormData>) => void;
  onBack: () => void;
}

const DAY_MAP: Record<number, string> = {
  0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat',
};

const REQUEST_PERIODS = [
  { key: 'morning', label: 'Сутрин', hint: '09:00 - 12:00' },
  { key: 'afternoon', label: 'Следобед', hint: '12:00 - 17:00' },
  { key: 'evening', label: 'Вечер', hint: '17:00 - 20:00' },
  { key: 'any', label: 'Няма значение', hint: 'Първият удобен за салона слот' },
] as const;

export function StepDateTime({
  serviceId,
  staffId,
  preferredStaffId,
  preferredStaffName,
  onNext,
  onBack,
}: StepDateTimeProps) {
  const tenant = useTenant();
  const [mode, setMode] = useState<'slot' | 'request'>('slot');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [requestDate, setRequestDate] = useState<Date | undefined>();
  const [requestPeriod, setRequestPeriod] = useState<(typeof REQUEST_PERIODS)[number]['key']>('any');

  const today = startOfToday();
  const maxDate = addDays(today, tenant.maxAdvanceBookingDays);

  const disabledDays = (date: Date) => {
    const dayKey = DAY_MAP[date.getDay()];
    const daySchedule = tenant.workingHours[dayKey];
    const isPast = isBefore(date, today);
    const isTooFar = date > maxDate;
    const isClosedDay = !daySchedule?.isOpen;
    return isPast || isTooFar || isClosedDay;
  };

  const { data: slots, isLoading: slotsLoading, error: slotsError } = useQuery({
    queryKey: ['slots', serviceId, staffId, selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null],
    queryFn: () =>
      apiClient.get<TimeSlot[]>('/appointments/slots', {
        serviceId,
        staffId,
        date: format(selectedDate!, 'yyyy-MM-dd'),
      }),
    enabled: mode === 'slot' && !!selectedDate,
    staleTime: 30 * 1000,
  });

  const resolvedSlots = slotsError || !slots ? [] : slots;

  const handleContinue = () => {
    if (mode === 'request') {
      const period = REQUEST_PERIODS.find((entry) => entry.key === requestPeriod)!;
      onNext({
        bookingMode: 'request',
        requestDate: requestDate ? format(requestDate, 'yyyy-MM-dd') : undefined,
        requestTimePeriod: requestPeriod,
        requestTimePeriodLabel: period.label,
      });
      return;
    }

    if (!selectedDate || !selectedSlot) return;

    const [hours, minutes] = selectedSlot.split(':').map(Number);
    const dateTime = new Date(selectedDate);
    dateTime.setHours(hours, minutes, 0, 0);

    onNext({
      bookingMode: 'slot',
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
        className="mb-4 flex items-center gap-1 text-sm transition-colors"
        style={{ color: 'var(--text-soft)' }}
      >
        <ChevronLeft className="w-4 h-4" />
        Назад
      </button>

      <h2 className="mb-2 text-2xl font-bold" style={{ color: 'var(--text-strong)' }}>Дата и час</h2>
      <p className="mb-6" style={{ color: 'var(--text-soft)' }}>
        Изберете точен свободен час или изпратете заявка без фиксиран слот.
      </p>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('slot')}
          className={`rounded-[28px] border p-5 text-left transition-colors ${
            mode === 'slot' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-gray-200 bg-white'
          }`}
        >
          <p className="text-sm font-black" style={{ color: 'var(--text-strong)' }}>Избирам точен час</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-soft)' }}>
            Виждате само реално свободните слотове.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setMode('request')}
          className={`rounded-[28px] border p-5 text-left transition-colors ${
            mode === 'request' ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-gray-200 bg-white'
          }`}
        >
          <p className="text-sm font-black" style={{ color: 'var(--text-strong)' }}>Нямам точен час</p>
          <p className="mt-2 text-sm" style={{ color: 'var(--text-soft)' }}>
            Изпращате заявка и салонът я подрежда в pending requests.
          </p>
        </button>
      </div>

      {mode === 'slot' ? (
        <>
          <div
            className="mb-6 overflow-hidden rounded-[28px] border border-white/70 bg-white/80 p-3 shadow-[0_18px_48px_rgba(15,23,42,0.08)] backdrop-blur-xl"
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

          {selectedDate && (
            <div>
              <h3 className="mb-3 font-semibold" style={{ color: 'var(--text-strong)' }}>
                {format(selectedDate, "d MMMM", { locale: bg })} — свободни часове:
              </h3>

              {slotsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
                </div>
              ) : resolvedSlots.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {resolvedSlots.map((slot) => (
                    <button
                      key={slot.start}
                      onClick={() => setSelectedSlot(slot.start)}
                      className={`
                        rounded-lg py-2.5 px-3 text-sm font-medium transition-all duration-150
                        ${selectedSlot === slot.start
                          ? 'bg-[var(--color-primary)] text-white shadow-md scale-105'
                          : 'border border-gray-200'
                        }
                      `}
                      style={
                        selectedSlot === slot.start
                          ? undefined
                          : {
                              background: 'var(--surface-pill)',
                              color: 'var(--text-strong)',
                              borderColor: 'var(--line-soft)',
                            }
                      }
                    >
                      <span className="flex items-center justify-center gap-1">
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
                <div className="rounded-xl py-8 text-center" style={{ background: 'var(--surface-pill)', border: '1px solid var(--line-soft)' }}>
                  <p className="font-medium" style={{ color: 'var(--text-soft)' }}>Няма свободни часове за тази дата</p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-soft)' }}>Изберете друга дата</p>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-5 rounded-[30px] border border-gray-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div>
            <h3 className="text-lg font-black" style={{ color: 'var(--text-strong)' }}>Какво е най-удобно?</h3>
            <p className="mt-2 text-sm" style={{ color: 'var(--text-soft)' }}>
              Предпочитан специалист: {preferredStaffName || 'Без предпочитание'}.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              Предпочитан ден <span style={{ color: 'var(--text-soft)', fontWeight: 400 }}>(по избор)</span>
            </label>
            <div className="overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-3">
              <DayPicker
                mode="single"
                selected={requestDate}
                onSelect={setRequestDate}
                disabled={disabledDays}
                locale={bg}
                fromDate={today}
                toDate={maxDate}
                className="booking-day-picker"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold" style={{ color: 'var(--text-strong)' }}>
              Част от деня
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {REQUEST_PERIODS.map((period) => (
                <button
                  key={period.key}
                  type="button"
                  onClick={() => setRequestPeriod(period.key)}
                  className={`rounded-[22px] border p-4 text-left transition-colors ${
                    requestPeriod === period.key
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                      : 'border-gray-200 bg-[var(--surface-pill)]'
                  }`}
                >
                  <p className="text-sm font-black" style={{ color: 'var(--text-strong)' }}>{period.label}</p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--text-soft)' }}>{period.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
            Следващата стъпка ще изпрати заявка без точен час. Тя влиза директно в pending requests на салона.
          </div>
        </div>
      )}

      {((mode === 'slot' && selectedDate && selectedSlot) || mode === 'request') && (
        <button
          onClick={handleContinue}
          className="mt-6 w-full rounded-xl py-4 font-semibold text-white transition-all duration-150 shadow-lg shadow-[var(--color-primary)]/25 hover:opacity-90 active:scale-[0.99]"
          style={{ background: 'var(--color-primary)' }}
        >
          Продължи →
        </button>
      )}
    </div>
  );
}
