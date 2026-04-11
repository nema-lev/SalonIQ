'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, Scissors } from 'lucide-react';
import { apiClient, setAuthToken, setTenantSlug } from '@/lib/api-client';
import axios from 'axios';

const schema = z.object({
  email: z.string().email('Невалиден email'),
  password: z.string().min(1, 'Въведете парола'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiClient.post<{ accessToken: string; owner: { name: string; tenantSlug?: string } }>('/auth/login', data),
    onSuccess: (data) => {
      setAuthToken(data.accessToken);
      if (data.owner.tenantSlug) {
        setTenantSlug(data.owner.tenantSlug);
      }
      toast.success(`Добре дошли, ${data.owner.name}!`);
      router.replace('/admin');
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = (error.response?.data as { message?: string } | undefined)?.message;

        if (status === 401) {
          toast.error(message || 'Невалиден email или парола.');
          return;
        }

        toast.error(message || 'Системна грешка при вход. Опитайте отново.');
        return;
      }

      toast.error('Системна грешка при вход. Опитайте отново.');
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-secondary)]/10 flex items-center justify-center p-4" style={{ minHeight: '100vh', background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(168,85,247,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="w-full max-w-sm" style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div className="text-center mb-8" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg"
            style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 40px rgba(124,58,237,0.18)', background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
          >
            <Scissors className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900" style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#111827' }}>Вход за администратор</h1>
          <p className="text-gray-500 text-sm mt-1" style={{ margin: '8px 0 0', fontSize: 16, color: '#4b5563' }}>Управление на вашия бизнес</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="bg-white rounded-2xl shadow-xl p-6 space-y-4"
          style={{ background: '#fff', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,0.12)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Email</label>
            <div className="relative" style={{ position: 'relative' }}>
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="owner@business.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors"
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 42px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
              />
            </div>
            {errors.email && <p className="text-red-500 text-xs mt-1" style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5" style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Парола</label>
            <div className="relative" style={{ position: 'relative' }}>
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                {...register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors"
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 42px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
              />
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1" style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-60 transition-all"
            style={{ width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Влез
          </button>

          <div style={{ display: 'grid', gap: 8 }}>
            <Link
              href="/admin/forgot-password"
              style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}
            >
              Забравена парола?
            </Link>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: '#6b7280' }}>
              Recovery flow-ът изпраща Telegram линк към вече свързания owner бот. Ако owner Telegram още не е свързан, super admin трябва да зададе временна парола.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
