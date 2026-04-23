'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { formatBulgarianPhoneForDisplay, normalizeBulgarianPhone } from '@/lib/phone';
import { useTenant } from '@/lib/tenant-context';
import type { ClientSuggestion, Service, Slot, StaffMember } from './calendar-model';

function timeLabelToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function AdminBookingModal({
  open,
  defaultDate,
  defaultStaffId,
  preferredSlot,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultDate: string;
  defaultStaffId: string;
  preferredSlot: string;
  onClose: () => void;
  onCreated: (startAt: string) => void;
}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [lookupField, setLookupField] = useState<'name' | 'phone'>('name');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const lookupValue = lookupField === 'phone' ? clientPhone : clientName;
  const deferredLookupValue = useDeferredValue(lookupValue.trim());

  const resetForm = () => {
    setServiceId('');
    setStaffId(defaultStaffId);
    setSelectedDate(defaultDate);
    setSelectedSlot('');
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setNotes('');
    setLookupField('name');
    setShowSuggestions(false);
  };

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [defaultDate, defaultStaffId, open]);

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['admin-booking-services'],
    queryFn: () => apiClient.get<Service[]>('/services/admin'),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ['admin-booking-staff', serviceId],
    queryFn: () => apiClient.get<StaffMember[]>('/staff', { serviceId }),
    enabled: open && !!serviceId,
    staleTime: 30 * 1000,
  });

  const { data: slots, isLoading: slotsLoading } = useQuery({
    queryKey: ['admin-booking-slots', serviceId, staffId, selectedDate],
    queryFn: () =>
      apiClient.get<Slot[]>('/appointments/slots', {
        serviceId,
        staffId,
        date: selectedDate,
      }),
    enabled: open && !!serviceId && !!staffId && !!selectedDate,
    staleTime: 15 * 1000,
  });

  const { data: clientSuggestions, isFetching: suggestionsLoading } = useQuery({
    queryKey: ['admin-booking-clients', lookupField, deferredLookupValue],
    queryFn: () => apiClient.get<ClientSuggestion[]>('/clients', { q: deferredLookupValue }),
    enabled: open && deferredLookupValue.length >= 2,
    staleTime: 15 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();

      return apiClient.post<{ id: string; status: string; startAt: string }>('/appointments/admin', {
        serviceId,
        staffId,
        startAt,
        clientName: clientName.trim(),
        clientPhone: normalizeBulgarianPhone(clientPhone),
        clientEmail: tenant.collectClientEmail ? clientEmail.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        consentGiven: true,
        publicBaseUrl: window.location.origin,
      });
    },
    onSuccess: (data) => {
      toast.success('Резервацията е записана.');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-calendar-board'] });
      queryClient.invalidateQueries({ queryKey: ['appointments-waitlist'] });
      resetForm();
      onCreated(data.startAt);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Грешка при записване на резервацията.');
    },
  });

  const canSubmit =
    !!serviceId &&
    !!staffId &&
    !!selectedDate &&
    !!selectedSlot &&
    clientName.trim().length >= 2 &&
    /^\+359\d{9}$/.test(normalizeBulgarianPhone(clientPhone));

  const preferredSlotAvailable = useMemo(
    () => Boolean(preferredSlot && slots?.some((slot) => slot.start === preferredSlot)),
    [preferredSlot, slots],
  );

  const nearestPreferredSlots = useMemo(() => {
    if (!preferredSlot || !slots?.length || preferredSlotAvailable) {
      return [];
    }

    const preferredMinutes = timeLabelToMinutes(preferredSlot);
    if (preferredMinutes === null) {
      return [];
    }

    return slots
      .map((slot) => {
        const slotMinutes = timeLabelToMinutes(slot.start);
        if (slotMinutes === null) return null;
        return {
          slot,
          slotMinutes,
          distanceMinutes: Math.abs(slotMinutes - preferredMinutes),
          direction: slotMinutes < preferredMinutes ? 'earlier' : 'later',
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((left, right) => {
        if (left.distanceMinutes !== right.distanceMinutes) {
          return left.distanceMinutes - right.distanceMinutes;
        }
        return left.slotMinutes - right.slotMinutes;
      })
      .slice(0, 4);
  }, [preferredSlot, preferredSlotAvailable, slots]);

  useEffect(() => {
    if (!staff?.length) return;

    if (defaultStaffId && staff.some((member) => member.id === defaultStaffId)) {
      setStaffId((current) => current || defaultStaffId);
      return;
    }

    if (staffId && !staff.some((member) => member.id === staffId)) {
      setStaffId('');
      setSelectedSlot('');
    }
  }, [defaultStaffId, staff, staffId]);

  useEffect(() => {
    if (!preferredSlot || !slots?.length || !preferredSlotAvailable) return;
    setSelectedSlot((current) => current || preferredSlot);
  }, [preferredSlot, preferredSlotAvailable, slots]);

  const chooseClient = (client: ClientSuggestion) => {
    setClientName(client.name);
    setClientPhone(formatBulgarianPhoneForDisplay(client.phone));
    setClientEmail(client.email || '');
    setShowSuggestions(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/45 p-4">
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
        <div className="max-h-[92vh] w-full overflow-y-auto rounded-[28px] border border-slate-200 bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-5">
            <div>
              <h3 className="text-xl font-black text-slate-900">Нова резервация</h3>
              <p className="mt-1 text-sm text-slate-500">Записът ще се създаде директно за избрания клиент.</p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Услуга</label>
                <select
                  value={serviceId}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    setStaffId('');
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                >
                  <option value="">{servicesLoading ? 'Зареждане...' : 'Изберете услуга'}</option>
                  {services?.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                      {service.price != null ? ` · ${service.price} €` : ' · цена по запитване'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Специалист</label>
                <select
                  value={staffId}
                  onChange={(event) => {
                    setStaffId(event.target.value);
                    setSelectedSlot('');
                  }}
                  disabled={!serviceId}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-slate-50 disabled:text-slate-400"
                >
                  <option value="">
                    {!serviceId ? 'Първо изберете услуга' : staffLoading ? 'Зареждане...' : 'Изберете специалист'}
                  </option>
                  {staff?.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
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
                {preferredSlot ? (
                  <p className="mt-2 text-xs font-semibold text-[var(--color-primary)]">
                    Избран слот от календара: {preferredSlot}
                  </p>
                ) : null}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700">Свободни часове</label>
                <div className="min-h-[60px] rounded-3xl border border-slate-200 bg-slate-50 p-2">
                  {!serviceId || !staffId ? (
                    <p className="px-2 py-3 text-sm text-slate-400">Изберете услуга и специалист.</p>
                  ) : slotsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                    </div>
                  ) : preferredSlot && !preferredSlotAvailable && slots?.length ? (
                    <div className="space-y-3 px-2 py-2">
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                        <p className="font-semibold">Точният час {preferredSlot} не е свободен.</p>
                        <p className="mt-1 text-xs text-amber-800/80">
                          Показваме най-близките свободни варианти около избрания момент.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {nearestPreferredSlots.map((option) => (
                          <button
                            key={option.slot.start}
                            type="button"
                            onClick={() => setSelectedSlot(option.slot.start)}
                            className={`rounded-2xl px-3 py-2 text-sm font-semibold transition-colors ${
                              selectedSlot === option.slot.start
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'border border-amber-200 bg-white text-slate-700 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                            }`}
                          >
                            {option.slot.start} {option.direction === 'earlier' ? '· по-рано' : '· по-късно'}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : !slots?.length ? (
                    <p className="px-2 py-3 text-sm text-slate-400">Няма свободни часове за тази дата.</p>
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
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relative">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Име на клиент</label>
                  <input
                    value={clientName}
                    onChange={(event) => {
                      setClientName(event.target.value);
                      setLookupField('name');
                      setShowSuggestions(true);
                    }}
                    placeholder="Мария Иванова"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="relative">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Телефон</label>
                  <input
                    value={clientPhone}
                    onChange={(event) => {
                      setClientPhone(event.target.value);
                      setLookupField('phone');
                      setShowSuggestions(true);
                    }}
                    placeholder="0888123456"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              {showSuggestions && deferredLookupValue.length >= 2 && (clientSuggestions?.length || suggestionsLoading) && (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Търсене в клиентската база...
                    </div>
                  ) : (
                    clientSuggestions?.slice(0, 6).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => chooseClient(client)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{client.name}</p>
                          <p className="text-xs text-slate-500">
                            {formatBulgarianPhoneForDisplay(client.phone)}
                            {tenant.collectClientEmail && client.email ? ` · ${client.email}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-slate-400">{client.total_visits} посещ.</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {tenant.collectClientEmail && (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        value={clientEmail}
                        onChange={(event) => setClientEmail(event.target.value)}
                        placeholder="maria@example.com"
                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-slate-700">Бележка</label>
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Клиентът предпочита следобед."
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              Ако клиентът вече съществува в базата, изборът от предложенията попълва автоматично име и телефон.
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Отказ
              </button>
              <button
                type="button"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Запиши
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
