'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, addDays, subDays, isToday } from 'date-fns';
import { bg } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Loader2, Clock, User, Phone } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface Appointment {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  service_color: string;
  staff_name: string;
  staff_color: string;
  price: number | null;
  internal_notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Изчаква',    cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  confirmed: { label: 'Потвърден', cls: 'bg-green-100 text-green-700 border-green-200' },
  completed: { label: 'Завършен',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  cancelled: { label: 'Отменен',   cls: 'bg-red-100 text-red-700 border-red-200' },
  no_show:   { label: 'No-show',   cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function AdminCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const { data: appointments, isLoading, refetch } = useQuery({
    queryKey: ['appointments', dateKey],
    queryFn: () => apiClient.get<Appointment[]>('/appointments', { date: dateKey }),
    staleTime: 30 * 1000,
  });

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, { status });
      refetch();
    } catch {
      alert('Грешка при смяна на статуса');
    }
  };

  const goToday = () => setCurrentDate(new Date());

  return (
    <div>
      {/* Date navigation */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentDate(subDays(currentDate, 1))}
            className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="text-center">
            <p className="font-bold text-gray-900">
              {format(currentDate, "d MMMM yyyy 'г.'", { locale: bg })}
            </p>
            <p className="text-xs text-gray-400 capitalize">
              {format(currentDate, 'EEEE', { locale: bg })}
            </p>
          </div>

          <button
            onClick={() => setCurrentDate(addDays(currentDate, 1))}
            className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {!isToday(currentDate) && (
          <button
            onClick={goToday}
            className="text-sm font-semibold text-[var(--color-primary)] hover:underline"
          >
            Днес
          </button>
        )}
      </div>

      {/* Appointments list */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : !appointments?.length ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
          <p className="text-gray-400 font-medium text-lg">Няма резервации за този ден</p>
          <p className="text-gray-300 text-sm mt-1">Свободен ден 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-2xl font-black text-gray-900">{appointments.length}</p>
              <p className="text-xs text-gray-400 mt-0.5">Общо резервации</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-2xl font-black text-green-600">
                {appointments.filter((a) => a.status === 'confirmed').length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Потвърдени</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-2xl font-black text-amber-600">
                {appointments.filter((a) => a.status === 'pending').length}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Изчакващи</p>
            </div>
          </div>

          {/* Appointment cards */}
          {appointments.map((appt) => {
            const startTime = format(new Date(appt.start_at), 'HH:mm');
            const endTime = format(new Date(appt.end_at), 'HH:mm');
            const statusCfg = STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.pending;

            return (
              <div
                key={appt.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4"
              >
                {/* Time + color bar */}
                <div className="flex flex-col items-center gap-1 flex-shrink-0 w-14">
                  <span className="text-sm font-bold text-gray-900">{startTime}</span>
                  <div
                    className="w-1 flex-1 rounded-full min-h-[24px]"
                    style={{ backgroundColor: appt.service_color }}
                  />
                  <span className="text-xs text-gray-400">{endTime}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="font-bold text-gray-900">{appt.client_name}</p>
                      <p className="text-sm text-gray-500">{appt.service_name}</p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${statusCfg.cls}`}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {appt.staff_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${appt.client_phone}`} className="hover:text-[var(--color-primary)]">
                        {appt.client_phone}
                      </a>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {startTime} – {endTime}
                    </span>
                    {appt.price != null && (
                      <span className="font-semibold text-gray-600">{appt.price} лв.</span>
                    )}
                  </div>

                  {/* Quick actions */}
                  {appt.status === 'pending' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleStatusChange(appt.id, 'confirmed')}
                        className="flex-1 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                      >
                        ✅ Потвърди
                      </button>
                      <button
                        onClick={() => handleStatusChange(appt.id, 'cancelled')}
                        className="flex-1 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                      >
                        ❌ Откажи
                      </button>
                    </div>
                  )}
                  {appt.status === 'confirmed' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleStatusChange(appt.id, 'completed')}
                        className="py-1.5 px-3 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      >
                        ✔ Завърши
                      </button>
                      <button
                        onClick={() => handleStatusChange(appt.id, 'no_show')}
                        className="py-1.5 px-3 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        No-show
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
