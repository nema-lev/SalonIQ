'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, User, Phone, Mail, MessageSquare } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import { formatBulgarianPhoneForDisplay, normalizeBulgarianPhone } from '@/lib/phone';
import { apiClient } from '@/lib/api-client';
import type { BookingFormData } from '@/types/booking';

const buildSchema = (collectClientEmail: boolean) =>
  z.object({
    clientName: z
      .string()
      .min(2, 'Моля, въведете поне 2 символа')
      .max(100, 'Твърде дълго')
      .regex(/^[\p{L}\s'-]+$/u, 'Само букви'),
    clientPhone: z
      .string()
      .min(7, 'Невалиден телефон')
      .transform((value) => normalizeBulgarianPhone(value))
      .refine((value) => /^\+359\d{9}$/.test(value), 'Невалиден телефон'),
    clientEmail: collectClientEmail
      ? z.string().email('Невалиден email').optional().or(z.literal(''))
      : z.string().optional().or(z.literal('')),
    notes: z.string().max(500, 'Максимум 500 символа').optional(),
  });

type FormValues = z.infer<ReturnType<typeof buildSchema>>;
type ClientSuggestion = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  totalVisits?: number;
};

interface StepDetailsProps {
  formData: Partial<BookingFormData>;
  onNext: (data: Partial<BookingFormData>) => void;
  onBack: () => void;
}

export function StepDetails({ formData, onNext, onBack }: StepDetailsProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
  const notificationCopy =
    tenant.enableTelegramNotifications && tenant.enableSmsNotifications
      ? 'Потвържденията и напомнянията се изпращат с приоритет в Telegram, а при липсващ Telegram чат могат да минат по SMS.'
      : tenant.enableTelegramNotifications
        ? 'Потвържденията и напомнянията се изпращат през Telegram, когато номерът е свързан с бота.'
        : tenant.enableSmsNotifications
          ? 'Потвържденията и напомнянията се изпращат по SMS.'
          : 'Потвържденията и напомнянията в момента са изключени от настройките на бизнеса.';
  const schema = useMemo(() => buildSchema(tenant.collectClientEmail), [tenant.collectClientEmail]);
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientName: formData.clientName || '',
      clientPhone: formData.clientPhone || '',
      clientEmail: formData.clientEmail || '',
      notes: formData.notes || '',
    },
    mode: 'onChange',
  });
  const clientName = watch('clientName');
  const clientPhone = watch('clientPhone');
  const [lookupMode, setLookupMode] = useState<'name' | 'phone'>('name');
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const lookupValue = (lookupMode === 'phone' ? clientPhone : clientName)?.trim() || '';
    const digitCount = lookupValue.replace(/\D/g, '').length;
    const shouldSearch = lookupMode === 'phone' ? digitCount >= 6 : lookupValue.length >= 2;

    if (!shouldSearch) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        setLoadingSuggestions(true);
        const result = await apiClient.get<ClientSuggestion[]>('/tenants/client-quick-search', { q: lookupValue });
        setSuggestions(result);
      } catch {
        setSuggestions([]);
      } finally {
        setLoadingSuggestions(false);
      }
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [clientName, clientPhone, lookupMode]);

  const onSubmit = (values: FormValues) => {
    onNext({
      clientName: values.clientName.trim(),
      clientPhone: values.clientPhone,
      clientEmail: tenant.collectClientEmail ? values.clientEmail || undefined : undefined,
      notes: values.notes || undefined,
      consentGiven: true,
    });
  };

  const chooseSuggestion = (suggestion: ClientSuggestion) => {
    setValue('clientName', suggestion.name, { shouldValidate: true, shouldDirty: true });
    setValue('clientPhone', formatBulgarianPhoneForDisplay(suggestion.phone), { shouldValidate: true, shouldDirty: true });
    if (tenant.collectClientEmail && suggestion.email) {
      setValue('clientEmail', suggestion.email, { shouldValidate: true, shouldDirty: true });
    }
    setShowSuggestions(false);
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

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Данни за контакт</h2>
      <p className="text-gray-500 mb-6">{copy.detailsHint}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Имена */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Две имена <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              {...register('clientName')}
              type="text"
              placeholder="Мария Иванова"
              autoComplete="name"
              onFocus={() => {
                setLookupMode('name');
                setShowSuggestions(true);
              }}
              className={`
                w-full pl-10 pr-4 py-3 rounded-xl border-2 outline-none transition-colors
                ${errors.clientName
                  ? 'border-red-300 focus:border-red-400 bg-red-50'
                  : 'border-gray-200 focus:border-[var(--color-primary)] bg-white'
                }
              `}
            />
          </div>
          {showSuggestions && lookupMode === 'name' && (loadingSuggestions || suggestions.length > 0) && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {loadingSuggestions ? (
                <div className="px-4 py-3 text-sm text-gray-500">Търсене в предишни клиенти...</div>
              ) : (
                suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => chooseSuggestion(suggestion)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{suggestion.name}</p>
                      <p className="text-xs text-gray-500">{formatBulgarianPhoneForDisplay(suggestion.phone)}</p>
                    </div>
                    <span className="text-[11px] text-gray-400">{suggestion.totalVisits || 0} посещ.</span>
                  </button>
                ))
              )}
            </div>
          )}
          {errors.clientName && (
            <p className="text-red-500 text-xs mt-1">{errors.clientName.message}</p>
          )}
        </div>

        {/* Телефон */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Телефон <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              {...register('clientPhone')}
              type="tel"
              placeholder="0899 123 456 или +359 899 123 456"
              autoComplete="tel"
              onFocus={() => {
                setLookupMode('phone');
                setShowSuggestions(true);
              }}
              className={`
                w-full pl-10 pr-4 py-3 rounded-xl border-2 outline-none transition-colors
                ${errors.clientPhone
                  ? 'border-red-300 focus:border-red-400 bg-red-50'
                  : 'border-gray-200 focus:border-[var(--color-primary)] bg-white'
                }
              `}
            />
          </div>
          {showSuggestions && lookupMode === 'phone' && (loadingSuggestions || suggestions.length > 0) && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              {loadingSuggestions ? (
                <div className="px-4 py-3 text-sm text-gray-500">Търсене в предишни клиенти...</div>
              ) : (
                suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => chooseSuggestion(suggestion)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{formatBulgarianPhoneForDisplay(suggestion.phone)}</p>
                      <p className="text-xs text-gray-500">{suggestion.name}</p>
                    </div>
                    <span className="text-[11px] text-gray-400">{suggestion.totalVisits || 0} посещ.</span>
                  </button>
                ))
              )}
            </div>
          )}
          {errors.clientPhone && (
            <p className="text-red-500 text-xs mt-1">{errors.clientPhone.message}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Приемаме и `08...`, и `+359...`. Интервали, скоби и тирета се изчистват автоматично.
          </p>
        </div>

        {tenant.collectClientEmail && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email{' '}
              <span className="text-gray-400 font-normal">(по избор)</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                {...register('clientEmail')}
                type="email"
                placeholder="maria@example.com"
                autoComplete="email"
                className={`
                  w-full pl-10 pr-4 py-3 rounded-xl border-2 outline-none transition-colors
                  ${errors.clientEmail
                    ? 'border-red-300 focus:border-red-400 bg-red-50'
                    : 'border-gray-200 focus:border-[var(--color-primary)] bg-white'
                  }
                `}
              />
            </div>
            {errors.clientEmail && (
              <p className="text-red-500 text-xs mt-1">{errors.clientEmail.message}</p>
            )}
          </div>
        )}

        {/* Бележки */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Бележки{' '}
            <span className="text-gray-400 font-normal">(по избор)</span>
          </label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
            <textarea
              {...register('notes')}
              placeholder="Специални изисквания, предпочитания..."
              rows={3}
              className="
                w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200
                focus:border-[var(--color-primary)] outline-none transition-colors resize-none
              "
            />
          </div>
          {errors.notes && (
            <p className="text-red-500 text-xs mt-1">{errors.notes.message}</p>
          )}
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {notificationCopy}
        </div>

        <button
          type="submit"
          className="
            w-full py-4 rounded-xl font-semibold text-white
            bg-[var(--color-primary)] hover:opacity-90 active:scale-[0.99]
            transition-all duration-150 shadow-lg shadow-[var(--color-primary)]/25
            disabled:opacity-50 disabled:cursor-not-allowed
          "
        >
          Продължи към потвърждение →
        </button>
      </form>
    </div>
  );
}
