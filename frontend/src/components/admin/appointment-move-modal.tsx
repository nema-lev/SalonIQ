'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import {
  type Appointment,
  type AppointmentContextResponse,
  type Slot,
  type StaffMember,
  formatAppointmentDay,
} from './calendar-model';

function getRescheduleErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error && 'response' in error) {
    const response = (error as any).response;
    const status = response?.status;
    const message = response?.data?.message;
    const normalizedMessage =
      typeof message === 'string'
        ? message
        : Array.isArray(message)
          ? message.find((entry): entry is string => typeof entry === 'string')
          : null;

    if (
      status === 409 &&
      (normalizedMessage?.includes('зает') ||
        normalizedMessage?.includes('интервал') ||
        normalizedMessage?.includes('блокиран'))
    ) {
      return 'Този час вече е зает. Изберете друг свободен слот.';
    }

    if (normalizedMessage) {
      return normalizedMessage;
    }
  }

  return fallback;
}

export function AppointmentMoveModal({
  open,
  appointment,
  onClose,
  onMoved,
}: {
  open: boolean;
  appointment: Appointment | (AppointmentContextResponse['appointment'] & Appointment) | null;
  onClose: () => void;
  onMoved: (startAt: string) => void;
}) {
  const queryClient = useQueryClient();
  const [staffId, setStaffId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const appointmentServiceId = appointment?.service_id || '';

  useEffect(() => {
    if (!open || !appointment) return;
    setStaffId(appointment.staff_id);
    setSelectedDate(new Date(appointment.start_at).toISOString().slice(0, 10));
    setSelectedSlot('');
  }, [appointment, open]);

  const { data: staffOptions, isLoading: staffLoading } = useQuery({
    queryKey: ['appointment-move-staff', appointmentServiceId],
    queryFn: () => apiClient.get<StaffMember[]>('/staff', { serviceId: appointmentServiceId }),
    enabled: open && Boolean(appointmentServiceId),
    staleTime: 30 * 1000,
  });

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ['appointment-move-slots', appointmentServiceId, staffId, selectedDate],
    queryFn: () =>
      apiClient.get<Slot[]>('/appointments/slots', {
        serviceId: appointmentServiceId,
        staffId,
        date: selectedDate,
      }),
    enabled: open && Boolean(appointmentServiceId) && Boolean(staffId) && Boolean(selectedDate),
    staleTime: 15 * 1000,
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!appointment) {
        throw new Error('Липсва резервация за преместване.');
      }

      const [year, month, day] = selectedDate.split('-').map(Number);
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
      await apiClient.patch(`/appointments/${appointment.id}/reschedule`, { startAt, staffId });
      return startAt;
    },
    onSuccess: (startAt) => {
      toast.success('Часът е преместен.');
      queryClient.invalidateQueries({ queryKey: ['appointment-context'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      onMoved(startAt);
    },
    onError: (error: unknown) => {
      toast.error(getRescheduleErrorMessage(error, 'Неуспешно преместване на часа.'));
    },
  });

  if (!open || !appointment) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/45 p-4">
      <div className="mx-auto flex h-full max-w-xl items-center justify-center">
        <div className="max-h-[92vh] w-full overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5">
            <div>
              <h3 className="text-xl font-black text-slate-900">Премести час</h3>
              <p className="mt-1 text-sm text-slate-500">
                Изберете нов специалист, дата и свободен слот за {appointment.client_name}.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Текущ запис</p>
              <p className="mt-2 text-sm font-black text-slate-900">{appointment.client_name}</p>
              <p className="mt-1 text-sm text-slate-600">{appointment.service_name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {formatAppointmentDay(appointment.start_at)} · {appointment.staff_name}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Специалист</label>
                <select
                  value={staffId}
                  onChange={(event) => {
                    setStaffId(event.target.value);
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="">{staffLoading ? 'Зареждане...' : 'Изберете специалист'}</option>
                  {staffOptions?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Дата</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Свободни слотове</label>
              <div className="min-h-[84px] rounded-3xl border border-slate-200 bg-slate-50 p-3">
                {!staffId || !selectedDate ? (
                  <p className="text-sm text-slate-400">Изберете специалист и дата.</p>
                ) : slotsLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
                  </div>
                ) : !slots?.length ? (
                  <p className="text-sm text-slate-400">Няма свободни слотове за този ден.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((slot) => (
                      <button
                        key={slot.start}
                        type="button"
                        onClick={() => setSelectedSlot(slot.start)}
                        className={`rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${
                          selectedSlot === slot.start
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'border border-slate-200 bg-white text-slate-700 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                        }`}
                      >
                        {slot.start}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Отказ
              </button>
              <button
                type="button"
                disabled={!staffId || !selectedDate || !selectedSlot || moveMutation.isPending}
                onClick={() => moveMutation.mutate()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {moveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Запази новия час
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
