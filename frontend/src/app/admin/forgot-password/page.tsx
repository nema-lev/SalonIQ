'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'sonner';
import { KeyRound, Loader2, Send, ShieldAlert } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Невалиден email'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiClient.post<{ accepted: boolean }>('/auth/recovery/request', {
        email: data.email,
        publicBaseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
      }),
    onSuccess: () => {
      toast.success('Ако owner Telegram е свързан, recovery линкът е изпратен там.');
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string } | undefined)?.message;
        toast.error(message || 'Грешка при заявка за recovery.');
        return;
      }

      toast.error('Грешка при заявка за recovery.');
    },
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(15,23,42,0.06), rgba(14,165,233,0.08))', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a, #1d4ed8)', color: '#fff' }}>
            <KeyRound className="h-8 w-8" />
          </div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#111827' }}>Възстановяване на достъпа</h1>
          <p style={{ margin: '8px 0 0', fontSize: 15, color: '#4b5563' }}>
            Recovery линкът се изпраща в свързания owner Telegram чат.
          </p>
        </div>

        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          style={{ background: '#fff', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,0.12)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div style={{ borderRadius: 14, background: '#f8fafc', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#475569' }}>
            Работи само ако owner Telegram вече е свързан в настройките на бизнеса. Ако не е, платформеният super admin трябва да зададе временна парола.
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Owner email</label>
            <input
              {...register('email')}
              type="email"
              autoComplete="email"
              placeholder="owner@business.com"
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
            />
            {errors.email && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.email.message}</p>}
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            style={{ width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Изпрати recovery линк
          </button>

          {mutation.isSuccess && (
            <div style={{ borderRadius: 14, border: '1px solid #dbeafe', background: '#eff6ff', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#1d4ed8' }}>
              Ако за този email има бизнес със свързан owner Telegram, изпратихме recovery линк в бота.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, borderRadius: 14, border: '1px solid #fde68a', background: '#fffbeb', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#92400e' }}>
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Recovery линкът е валиден 30 минути и не отменя блокировката при неплатен акаунт.</span>
          </div>

          <Link href="/admin/login" style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
            Назад към входа
          </Link>
        </form>
      </div>
    </div>
  );
}
