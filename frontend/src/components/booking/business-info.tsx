'use client';

import { Clock, MapPin, ExternalLink } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';

const DAY_NAMES: Record<string, string> = {
  mon: 'Понеделник',
  tue: 'Вторник',
  wed: 'Сряда',
  thu: 'Четвъртък',
  fri: 'Петък',
  sat: 'Събота',
  sun: 'Неделя',
};

const DAY_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function BusinessInfo() {
  const tenant = useTenant();
  const { workingHours, address, city, googleMapsUrl } = tenant;

  const hasWorkingHours = Object.keys(workingHours).length > 0;

  if (!hasWorkingHours && !address) return null;

  // Намери днешния ден
  const todayKey = DAY_ORDER[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1];
  const todaySchedule = workingHours[todayKey];

  return (
    <div className="mt-10 space-y-4">
      <div className="h-px bg-gray-100" />

      {/* Работно време */}
      {hasWorkingHours && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-4">
            <Clock className="w-4 h-4 text-[var(--color-primary)]" />
            Работно време
          </h3>

          {/* Днес */}
          {todaySchedule && (
            <div className="flex items-center gap-2 mb-3 p-2.5 rounded-lg bg-[var(--color-primary)]/5">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  todaySchedule.isOpen ? 'bg-green-500' : 'bg-red-400'
                }`}
              />
              <span className="text-sm font-semibold text-gray-700">Днес:</span>
              <span className="text-sm text-gray-600">
                {todaySchedule.isOpen
                  ? `${todaySchedule.open} – ${todaySchedule.close}`
                  : 'Затворено'}
              </span>
            </div>
          )}

          {/* Всички дни */}
          <div className="space-y-1.5">
            {DAY_ORDER.map((day) => {
              const schedule = workingHours[day];
              if (!schedule) return null;
              const isToday = day === todayKey;

              return (
                <div
                  key={day}
                  className={`flex justify-between items-center text-sm py-1 ${
                    isToday ? 'font-semibold text-[var(--color-primary)]' : 'text-gray-600'
                  }`}
                >
                  <span>{DAY_NAMES[day]}</span>
                  <span className={schedule.isOpen ? '' : 'text-gray-400'}>
                    {schedule.isOpen
                      ? `${schedule.open} – ${schedule.close}`
                      : 'Почивен'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Адрес и карта */}
      {address && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-3">
            <MapPin className="w-4 h-4 text-[var(--color-primary)]" />
            Адрес
          </h3>
          <p className="text-gray-600 text-sm">
            {[address, city].filter(Boolean).join(', ')}
          </p>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex items-center gap-1.5 mt-3 text-sm font-semibold
                text-[var(--color-primary)] hover:underline
              "
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Виж в Google Maps
            </a>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="text-center text-xs text-gray-300 pb-4">
        Powered by SalonIQ
      </p>
    </div>
  );
}
