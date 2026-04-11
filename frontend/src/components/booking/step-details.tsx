'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, User, Phone, Mail, MessageSquare } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import { normalizeBulgarianPhone } from '@/lib/phone';
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

interface StepDetailsProps {
  formData: Partial<BookingFormData>;
  onNext: (data: Partial<BookingFormData>) => void;
  onBack: () => void;
}

export function StepDetails({ formData, onNext, onBack }: StepDetailsProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
  const schema = useMemo(() => buildSchema(tenant.collectClientEmail), [tenant.collectClientEmail]);
  const {
    register,
    handleSubmit,
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

  const onSubmit = (values: FormValues) => {
    onNext({
      clientName: values.clientName.trim(),
      clientPhone: values.clientPhone,
      clientEmail: tenant.collectClientEmail ? values.clientEmail || undefined : undefined,
      notes: values.notes || undefined,
      consentGiven: true,
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
              className={`
                w-full pl-10 pr-4 py-3 rounded-xl border-2 outline-none transition-colors
                ${errors.clientName
                  ? 'border-red-300 focus:border-red-400 bg-red-50'
                  : 'border-gray-200 focus:border-[var(--color-primary)] bg-white'
                }
              `}
            />
          </div>
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
              className={`
                w-full pl-10 pr-4 py-3 rounded-xl border-2 outline-none transition-colors
                ${errors.clientPhone
                  ? 'border-red-300 focus:border-red-400 bg-red-50'
                  : 'border-gray-200 focus:border-[var(--color-primary)] bg-white'
                }
              `}
            />
          </div>
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
          С резервацията се изпращат задължителни потвърждение и напомняне за часа.
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
