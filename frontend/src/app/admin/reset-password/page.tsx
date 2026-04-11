'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import axios from 'axios';
import { toast } from 'sonner';
import { CheckCircle2, KeyRound, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

const schema = z
  .object({
    newPassword: z.string().min(6, 'Минимум 6 символа'),
    confirmPassword: z.string().min(6, 'Минимум 6 символа'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Паролите не съвпадат.',
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const verifyQuery = useQuery({
    queryKey: ['owner-recovery-verify', token],
    enabled: Boolean(token),
    queryFn: () =>
      apiClient.post<{ valid: boolean; businessName: string; ownerEmail: string; expiresAt: string }>('/auth/recovery/verify', { token }),
    retry: false,
  });

  const resetMutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiClient.post<{ reset: boolean; ownerEmail: string }>('/auth/recovery/reset', {
        token,
        newPassword: data.newPassword,
      }),
    onSuccess: () => {
      toast.success('Паролата е сменена.');
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string } | undefined)?.message;
        toast.error(message || 'Неуспешна смяна на паролата.');
        return;
      }

      toast.error('Неуспешна смяна на паролата.');
    },
  });

  const verifyMessage =
    axios.isAxiosError(verifyQuery.error)
      ? ((verifyQuery.error.response?.data as { message?: string } | undefined)?.message || 'Невалиден или изтекъл recovery линк.')
      : 'Невалиден или изтекъл recovery линк.';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, rgba(15,23,42,0.06), rgba(124,58,237,0.10))', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #4f46e5, #0f172a)', color: '#fff' }}>
            <KeyRound className="h-8 w-8" />
          </div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#111827' }}>Нова парола</h1>
        </div>

        <div style={{ background: '#fff', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,0.12)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {!token && (
            <div style={{ borderRadius: 14, border: '1px solid #fecaca', background: '#fff5f5', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#b91c1c' }}>
              Липсва recovery token в линка.
            </div>
          )}

          {token && verifyQuery.isLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, background: '#f8fafc', padding: '12px 14px', fontSize: 14, color: '#475569' }}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Проверявам recovery линка...
            </div>
          )}

          {token && verifyQuery.isError && (
            <div style={{ borderRadius: 14, border: '1px solid #fecaca', background: '#fff5f5', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#b91c1c' }}>
              {verifyMessage}
            </div>
          )}

          {token && verifyQuery.data && !resetMutation.isSuccess && (
            <>
              <div style={{ borderRadius: 14, background: '#f8fafc', padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#475569' }}>
                Бизнес: <strong>{verifyQuery.data.businessName}</strong><br />
                Owner: <strong>{verifyQuery.data.ownerEmail}</strong><br />
                Валидно до: <strong>{new Date(verifyQuery.data.expiresAt).toLocaleString('bg-BG')}</strong>
              </div>

              <form onSubmit={handleSubmit((data) => resetMutation.mutate(data))} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Нова парола</label>
                  <input
                    {...register('newPassword')}
                    type="password"
                    autoComplete="new-password"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
                  />
                  {errors.newPassword && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.newPassword.message}</p>}
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Повтори паролата</label>
                  <input
                    {...register('confirmPassword')}
                    type="password"
                    autoComplete="new-password"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
                  />
                  {errors.confirmPassword && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.confirmPassword.message}</p>}
                </div>

                <button
                  type="submit"
                  disabled={resetMutation.isPending}
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
                >
                  {resetMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Запази новата парола
                </button>
              </form>
            </>
          )}

          {resetMutation.isSuccess && (
            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, border: '1px solid #bbf7d0', background: '#f0fdf4', padding: '12px 14px', fontSize: 14, color: '#166534' }}>
                <CheckCircle2 className="h-4 w-4" />
                Паролата е сменена успешно. Можете да влезете с нея.
              </div>
              <Link href="/admin/login" style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
                Към входа
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
