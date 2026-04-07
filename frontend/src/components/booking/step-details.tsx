'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, User, Phone, Mail, MessageSquare, Shield } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import type { BookingFormData } from '@/types/booking';

const schema = z.object({
  clientName: z
    .string()
    .min(2, 'Моля, въведете поне 2 символа')
    .max(100, 'Твърде дълго')
    .regex(/^[\p{L}\s'-]+$/u, 'Само букви'),
  clientPhone: z
    .string()
    .min(7, 'Невалиден телефон')
    .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Невалиден телефон'),
  clientEmail: z
    .string()
    .email('Невалиден email')
    .optional()
    .or(z.literal('')),
  notes: z.string().max(500, 'Максимум 500 символа').optional(),
  consentGiven: z.literal(true, {
    errorMap: () => ({ message: 'Необходимо е съгласие за получаване на известявания' }),
  }),
});

type FormValues = z.infer<typeof schema>;

interface StepDetailsProps {
  formData: Partial<BookingFormData>;
  onNext: (data: Partial<BookingFormData>) => void;
  onBack: () => void;
}

export function StepDetails({ formData, onNext, onBack }: StepDetailsProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
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
      consentGiven: (formData.consentGiven as true) || undefined,
    },
    mode: 'onChange',
  });

  const onSubmit = (values: FormValues) => {
    onNext({
      clientName: values.clientName.trim(),
      clientPhone: values.clientPhone.replace(/\s/g, ''),
      clientEmail: values.clientEmail || undefined,
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

      <h2 className="text-2xl font-bold text-gray-900 mb-2">Вашите данни</h2>
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
              placeholder="Иван Иванов"
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
              placeholder="+359 888 123 456"
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
            На този номер ще получите потвърждение за запазения {copy.bookingLabel}
          </p>
        </div>

        {/* Email — по избор */}
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
              placeholder="ivan@example.com"
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

        {/* GDPR Consent */}
        <label className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl cursor-pointer group">
          <input
            {...register('consentGiven')}
            type="checkbox"
            className="
              w-5 h-5 mt-0.5 rounded border-gray-300 flex-shrink-0
              accent-[var(--color-primary)] cursor-pointer
            "
          />
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-800">
                Съгласие за известявания
              </span>
            </div>
            <p className="text-xs text-gray-600 leading-relaxed">
              Съгласявам се да получавам потвърждения и напомняния за моите часове
              чрез Telegram/SMS. Данните ми се обработват само за тази цел и не се
              споделят с трети страни. (GDPR)
            </p>
            {errors.consentGiven && (
              <p className="text-red-500 text-xs mt-1 font-medium">
                {errors.consentGiven.message}
              </p>
            )}
          </div>
        </label>

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
