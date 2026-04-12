'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft, Calendar, Clock, User, Phone, Mail,
  Scissors, MapPin, AlertCircle, Loader2, CheckCircle2,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { formatBulgarianPhoneForDisplay } from '@/lib/phone';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import type { BookingFormData } from '@/types/booking';

interface StepConfirmationProps {
  formData: BookingFormData;
  onBack: () => void;
  onSuccess: (appointment: { id: string; status: string }) => void;
}

interface BookingRow {
  icon: React.ReactNode;
  label: string;
  value: string;
}

export function StepConfirmation({ formData, onBack, onSuccess }: StepConfirmationProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post<{ id: string; status: string }>('/appointments', {
        serviceId: formData.serviceId,
        staffId: formData.staffId,
        startAt: formData.startAt,
        clientName: formData.clientName,
        clientPhone: formData.clientPhone,
        clientEmail: tenant.collectClientEmail ? formData.clientEmail || undefined : undefined,
        notes: formData.notes || undefined,
        consentGiven: true,
        publicBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    onSuccess: (data) => {
      onSuccess(data);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Неуспешно записване. Моля, опитайте отново.';
      toast.error(Array.isArray(msg) ? msg.join(', ') : msg);
    },
  });

  const rows: BookingRow[] = [
    {
      icon: <Scissors className="w-4 h-4 text-[var(--color-primary)]" />,
      label: copy.serviceLabel.charAt(0).toUpperCase() + copy.serviceLabel.slice(1),
      value: `${formData.serviceName} (${formData.serviceDuration} мин.)`,
    },
    {
      icon: <User className="w-4 h-4 text-[var(--color-primary)]" />,
      label: copy.providerLabel.charAt(0).toUpperCase() + copy.providerLabel.slice(1),
      value: formData.staffName,
    },
    {
      icon: <Calendar className="w-4 h-4 text-[var(--color-primary)]" />,
      label: 'Дата',
      value: formData.displayDate,
    },
    {
      icon: <Clock className="w-4 h-4 text-[var(--color-primary)]" />,
      label: 'Час',
      value: formData.timeSlot,
    },
    {
      icon: <User className="w-4 h-4 text-gray-400" />,
      label: 'Клиент',
      value: formData.clientName,
    },
    {
      icon: <Phone className="w-4 h-4 text-gray-400" />,
      label: 'Телефон',
      value: formatBulgarianPhoneForDisplay(formData.clientPhone),
    },
    ...(tenant.collectClientEmail && formData.clientEmail
      ? [{ icon: <Mail className="w-4 h-4 text-gray-400" />, label: 'Email', value: formData.clientEmail }]
      : []),
    ...(tenant.address
      ? [{ icon: <MapPin className="w-4 h-4 text-gray-400" />, label: 'Адрес', value: tenant.address }]
      : []),
  ];

  return (
    <div>
      <button
        onClick={onBack}
        disabled={mutation.isPending}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors disabled:opacity-50"
      >
        <ChevronLeft className="w-4 h-4" />
        Назад
      </button>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Потвърдете данните</h2>
      <p className="text-gray-500 mb-6">Проверете детайлите преди да потвърдите {copy.bookingLabel}а</p>

      {/* Summary card */}
      <div className="bg-gray-50 rounded-2xl p-5 mb-5 space-y-3.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm flex-shrink-0">
              {row.icon}
            </div>
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm text-gray-500">{row.label}</span>
              <span className="text-sm font-semibold text-gray-800 text-right max-w-[55%]">
                {row.value}
              </span>
            </div>
          </div>
        ))}

        {formData.servicePrice != null && (
          <div className="pt-3 mt-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-700">Приблизителна цена</span>
              <span className="text-xl font-bold text-[var(--color-primary)]">
                {formData.servicePrice} €
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Notes display */}
      {formData.notes && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-amber-700 mb-1">Вашите бележки:</p>
          <p className="text-sm text-amber-800">{formData.notes}</p>
        </div>
      )}

      {/* Cancellation policy */}
      {tenant.allowClientCancellation && tenant.cancellationHours > 0 && (
        <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 mb-6">
          <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            <span className="font-semibold">Политика за отмяна:</span> Можете да отмените
            безплатно до {tenant.cancellationHours} часа преди {copy.bookingLabel}а.
            {' '}Потвърждение и напомняне се изпращат автоматично.
          </p>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="
          w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2
          bg-[var(--color-primary)] hover:opacity-90 active:scale-[0.99]
          transition-all duration-150 shadow-lg shadow-[var(--color-primary)]/25
          disabled:opacity-60 disabled:cursor-not-allowed
        "
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Изпращане...
          </>
        ) : (
          <>
            <CheckCircle2 className="w-5 h-5" />
            Потвърди резервацията
          </>
        )}
      </button>
    </div>
  );
}
