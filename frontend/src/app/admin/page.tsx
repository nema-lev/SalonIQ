'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays, subDays, isToday } from 'date-fns';
import { bg } from 'date-fns/locale';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarDays,
  KeyRound,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCcw,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import {
  formatBulgarianPhoneForDisplay,
  normalizeBulgarianPhone,
} from '@/lib/phone';
import { useTenant } from '@/lib/tenant-context';

interface Appointment {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  service_id: string;
  staff_id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  service_color: string;
  staff_name: string;
  staff_color: string;
  price: number | null;
  internal_notes: string | null;
}

interface UpcomingAppointment {
  id: string;
  start_at: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  staff_name: string;
  status: string;
  owner_alert_state?: string;
  proposal_decision?: string;
}

interface Service {
  id: string;
  name: string;
  category: string | null;
  duration_minutes: number;
  price: number | null;
  is_public: boolean;
}

interface StaffMember {
  id: string;
  name: string;
  color: string;
}

interface Slot {
  start: string;
  end: string;
}

interface ClientSuggestion {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  total_visits: number;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Нова заявка', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  proposal_pending: { label: 'Чака клиент', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  confirmed: { label: 'Потвърден', cls: 'bg-green-100 text-green-700 border-green-200' },
  completed: { label: 'Завършен', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  cancelled: { label: 'Отменен', cls: 'bg-red-100 text-red-700 border-red-200' },
  no_show: { label: 'No-show', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export default function AdminCalendarPage() {
  const tenant = useTenant();
  const qc = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [proposalTarget, setProposalTarget] = useState<Appointment | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const dateKey = format(currentDate, 'yyyy-MM-dd');

  const { data: appointments, isLoading, refetch } = useQuery({
    queryKey: ['appointments', dateKey],
    queryFn: () => apiClient.get<Appointment[]>('/appointments', { date: dateKey }),
    staleTime: 30 * 1000,
  });

  const { data: upcoming, isLoading: upcomingLoading } = useQuery({
    queryKey: ['appointments-upcoming'],
    queryFn: () =>
      apiClient.get<UpcomingAppointment[]>('/appointments/upcoming', {
        limit: '12',
        mode: 'attention',
      }),
    staleTime: 30 * 1000,
    refetchInterval: 15000,
  });

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/status`, { status });
      refetch();
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
    } catch {
      toast.error('Грешка при смяна на статуса');
    }
  };

  const handleOwnerAlertRead = async (id: string) => {
    try {
      await apiClient.patch(`/appointments/${id}/owner-alert-read`, {});
      qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
      qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
    } catch {
      toast.error('Грешка при обновяване на известието.');
    }
  };

  const handleBookingCreated = (startAt: string) => {
    setShowBookingModal(false);
    setProposalTarget(null);
    setCurrentDate(new Date(startAt));
    qc.invalidateQueries({ queryKey: ['appointments'] });
    qc.invalidateQueries({ queryKey: ['appointments-upcoming'] });
    qc.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
  };

  const actionItems = upcoming ?? [];
  const pendingItems = actionItems.filter((appointment) =>
    appointment.status === 'pending' || appointment.status === 'proposal_pending',
  );
  const responseItems = actionItems.filter((appointment) => appointment.owner_alert_state);

  const goToday = () => setCurrentDate(new Date());

  return (
    <div>
      <div className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Календар и директни резервации</h2>
          <p className="text-sm text-gray-500 mt-1">
            Ръчно записаните часове от админ панела се създават директно като потвърдени.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setProposalTarget(null);
            setShowBookingModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 transition-opacity hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Нова резервация
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Чакащи потвърждение</h2>
            <p className="text-xs text-gray-500 mt-1">Нови заявки и изпратени предложения, които още чакат отговор.</p>
          </div>
        </div>

        {upcomingLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
          </div>
        ) : !pendingItems.length ? (
          <p className="text-sm text-gray-400">Няма заявки за действие.</p>
        ) : (
          <div className="space-y-2">
            {pendingItems.map((appt) => (
              <button
                key={appt.id}
                type="button"
                onClick={() => setCurrentDate(new Date(appt.start_at))}
                className="w-full text-left rounded-xl border border-gray-100 px-3 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{appt.client_name}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {appt.service_name} · {appt.staff_name} · {appt.status === 'proposal_pending' ? 'чака клиент' : 'чака решение'}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-[var(--color-primary)]">
                      {format(new Date(appt.start_at), 'd MMM, HH:mm', { locale: bg })}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatBulgarianPhoneForDisplay(appt.client_phone)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Отговори по предложения</h2>
            <p className="text-xs text-gray-500 mt-1">Клиенти, които вече са приели или отказали предложен час.</p>
          </div>
        </div>

        {!responseItems.length ? (
          <p className="text-sm text-gray-400">Няма нови клиентски отговори.</p>
        ) : (
          <div className="space-y-2">
            {responseItems.map((appt) => {
              const isAccepted = appt.owner_alert_state === 'proposal_accepted';

              return (
                <div
                  key={appt.id}
                  className="rounded-xl border border-gray-100 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{appt.client_name}</p>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {isAccepted ? 'Прието предложение' : 'Отказано предложение'} · {appt.service_name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOwnerAlertRead(appt.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      <RefreshCcw className="h-3 w-3" />
                      Видяно
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className={`text-sm font-semibold ${isAccepted ? 'text-green-700' : 'text-red-600'}`}>
                      {isAccepted ? 'Клиентът прие часа' : 'Клиентът отказа часа'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(appt.start_at), 'd MMM, HH:mm', { locale: bg })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
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

          <input
            ref={dateInputRef}
            type="date"
            value={dateKey}
            onChange={(e) => setCurrentDate(new Date(`${e.target.value}T12:00:00`))}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => {
              if (dateInputRef.current?.showPicker) {
                dateInputRef.current.showPicker();
                return;
              }
              dateInputRef.current?.click();
            }}
            className="w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
            aria-label="Избери дата"
          >
            <CalendarDays className="w-4 h-4 text-gray-600" />
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
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

          {appointments.map((appt) => {
            const startTime = format(new Date(appt.start_at), 'HH:mm');
            const endTime = format(new Date(appt.end_at), 'HH:mm');
            const statusCfg = STATUS_CONFIG[appt.status] ?? STATUS_CONFIG.pending;

            return (
              <div
                key={appt.id}
                className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-4"
              >
                <div className="flex flex-col items-center gap-1 flex-shrink-0 w-14">
                  <span className="text-sm font-bold text-gray-900">{startTime}</span>
                  <div
                    className="w-1 flex-1 rounded-full min-h-[24px]"
                    style={{ backgroundColor: appt.service_color }}
                  />
                  <span className="text-xs text-gray-400">{endTime}</span>
                </div>

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
                        {formatBulgarianPhoneForDisplay(appt.client_phone)}
                      </a>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {startTime} – {endTime}
                    </span>
                    {appt.price != null && (
                      <span className="font-semibold text-gray-600">{appt.price} €</span>
                    )}
                  </div>

                  {(appt.status === 'pending' || appt.status === 'proposal_pending') && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => handleStatusChange(appt.id, 'confirmed')}
                        className="flex-1 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                      >
                        ✅ Потвърди
                      </button>
                      <button
                        onClick={() => {
                          setProposalTarget(appt);
                          setShowBookingModal(true);
                        }}
                        className="flex-1 py-1.5 text-xs font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
                      >
                        ↺ Предложи нов час
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

      <AdminBookingModal
        open={showBookingModal}
        defaultDate={dateKey}
        proposalTarget={proposalTarget}
        onClose={() => {
          setShowBookingModal(false);
          setProposalTarget(null);
        }}
        onCreated={handleBookingCreated}
      />
    </div>
  );
}

function AdminBookingModal({
  open,
  defaultDate,
  proposalTarget,
  onClose,
  onCreated,
}: {
  open: boolean;
  defaultDate: string;
  proposalTarget: Appointment | null;
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
  const [mode, setMode] = useState<'direct' | 'ask-client'>('direct');

  const lookupValue = lookupField === 'phone' ? clientPhone : clientName;
  const deferredLookupValue = useDeferredValue(lookupValue.trim());

  const resetForm = () => {
    setServiceId('');
    setStaffId('');
    setSelectedDate(defaultDate);
    setSelectedSlot('');
    setClientName('');
    setClientPhone('');
    setClientEmail('');
    setNotes('');
    setLookupField('name');
    setShowSuggestions(false);
    setMode('direct');
  };

  useEffect(() => {
    if (open) {
      setSelectedDate(proposalTarget ? format(new Date(proposalTarget.start_at), 'yyyy-MM-dd') : defaultDate);
      setSelectedSlot('');
      if (proposalTarget) {
        setServiceId(proposalTarget.service_id);
        setStaffId(proposalTarget.staff_id);
        setClientName(proposalTarget.client_name);
        setClientPhone(formatBulgarianPhoneForDisplay(proposalTarget.client_phone));
        setMode('ask-client');
      }
    }
  }, [defaultDate, open, proposalTarget]);

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
    mutationFn: async (submitMode: 'direct' | 'ask-client') => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const [hours, minutes] = selectedSlot.split(':').map(Number);
      const startAt = new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();

      if (proposalTarget) {
        return apiClient.post<{ id: string; status: string; startAt: string }>(
          `/appointments/${proposalTarget.id}/proposal`,
          {
            startAt,
            publicBaseUrl: window.location.origin,
          },
        );
      }

      return apiClient.post<{ id: string; status: string; startAt: string }>('/appointments/admin', {
        serviceId,
        staffId,
        startAt,
        clientName: clientName.trim(),
        clientPhone: normalizeBulgarianPhone(clientPhone),
        clientEmail: tenant.collectClientEmail ? clientEmail.trim() || undefined : undefined,
        notes: notes.trim() || undefined,
        consentGiven: true,
        askClient: submitMode === 'ask-client',
        publicBaseUrl: window.location.origin,
      });
    },
    onSuccess: (data, submitMode) => {
      toast.success(
        proposalTarget || submitMode === 'ask-client'
          ? 'Предложението е изпратено към клиента.'
          : 'Резервацията е записана директно и е потвърдена.',
      );
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['admin-header-upcoming'] });
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
    <div className="fixed inset-0 z-50 bg-black/45 p-4">
      <div className="mx-auto flex h-full max-w-3xl items-center justify-center">
        <div className="w-full max-h-[92vh] overflow-y-auto rounded-[28px] border border-gray-100 bg-white shadow-2xl">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-5 py-5">
            <div>
              <h3 className="text-xl font-black text-gray-900">
                {proposalTarget ? 'Предложи нов час' : 'Нова резервация от админ'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {proposalTarget
                  ? 'Изпращаш контра оферта към клиента. Часът ще бъде потвърден само ако той приеме.'
                  : 'Можеш или да запишеш директно, или да изпратиш предложение към клиента за потвърждение.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Услуга</label>
                <select
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    setStaffId('');
                    setSelectedSlot('');
                  }}
                  disabled={Boolean(proposalTarget)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-gray-50 disabled:text-gray-400"
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
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Специалист</label>
                <select
                  value={staffId}
                  onChange={(e) => {
                    setStaffId(e.target.value);
                    setSelectedSlot('');
                  }}
                  disabled={!serviceId || Boolean(proposalTarget)}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:bg-gray-50 disabled:text-gray-400"
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
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Дата</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedSlot('');
                  }}
                  className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Свободни часове</label>
                <div className="min-h-[60px] rounded-2xl border border-gray-200 bg-gray-50 p-2">
                  {!serviceId || !staffId ? (
                    <p className="px-2 py-3 text-sm text-gray-400">Изберете услуга и специалист.</p>
                  ) : slotsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--color-primary)]" />
                    </div>
                  ) : !slots?.length ? (
                    <p className="px-2 py-3 text-sm text-gray-400">Няма свободни часове за тази дата.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelectedSlot(slot.start)}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                            selectedSlot === slot.start
                              ? 'bg-[var(--color-primary)] text-white'
                              : 'bg-white text-gray-700 border border-gray-200 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
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

            <div className="rounded-3xl border border-gray-100 bg-gray-50/70 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="relative">
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Име на клиент</label>
                  <input
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      setLookupField('name');
                      setShowSuggestions(true);
                    }}
                    placeholder="Мария Иванова"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div className="relative">
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Телефон</label>
                  <input
                    value={clientPhone}
                    onChange={(e) => {
                      setClientPhone(e.target.value);
                      setLookupField('phone');
                      setShowSuggestions(true);
                    }}
                    placeholder="0888123456"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              {showSuggestions && deferredLookupValue.length >= 2 && (clientSuggestions?.length || suggestionsLoading) && (
                <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Търсене в клиентската база...
                    </div>
                  ) : (
                    clientSuggestions?.slice(0, 6).map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => chooseClient(client)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-gray-50"
                      >
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatBulgarianPhoneForDisplay(client.phone)}
                            {tenant.collectClientEmail && client.email ? ` · ${client.email}` : ''}
                          </p>
                        </div>
                        <span className="text-xs text-gray-400">{client.total_visits} посещ.</span>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {tenant.collectClientEmail && (
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-gray-700">Email</label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        value={clientEmail}
                        onChange={(e) => setClientEmail(e.target.value)}
                        placeholder="maria@example.com"
                        className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[var(--color-primary)]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Бележка</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Клиентът предпочита следобед."
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>
            </div>

            <div className={`rounded-2xl border px-4 py-3 text-sm ${
              proposalTarget || mode === 'ask-client'
                ? 'border-violet-100 bg-violet-50 text-violet-900'
                : 'border-emerald-100 bg-emerald-50 text-emerald-900'
            }`}>
              {proposalTarget || mode === 'ask-client'
                ? 'Ще изпратиш предложение към клиента. Часът няма да се счита за окончателно приет, докато клиентът не го потвърди.'
                : 'Резервацията ще се създаде директно като потвърдена. Ако клиентът вече съществува в базата, изборът от предложенията попълва автоматично име и телефон.'}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Отказ
              </button>
              <button
                type="button"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => {
                  setMode('direct');
                  createMutation.mutate('direct');
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {proposalTarget ? 'Изпрати предложението' : 'Запиши директно'}
              </button>
              {!proposalTarget && (
                <button
                  type="button"
                  disabled={!canSubmit || createMutation.isPending}
                  onClick={() => {
                    setMode('ask-client');
                    createMutation.mutate('ask-client');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  Питай клиента
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
