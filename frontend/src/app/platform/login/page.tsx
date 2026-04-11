'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, Shield } from 'lucide-react';
import axios from 'axios';
import { apiClient, setPlatformAuthToken } from '@/lib/api-client';

const schema = z.object({
  email: z.string().email('Невалиден email'),
  password: z.string().min(1, 'Въведете парола'),
});

type FormValues = z.infer<typeof schema>;

export default function PlatformLoginPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiClient.post<{ accessToken: string; admin: { email: string; role: string } }>('/platform/login', data),
    onSuccess: (data) => {
      setPlatformAuthToken(data.accessToken);
      toast.success(`Вход: ${data.admin.email}`);
      router.replace('/platform');
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const message = (error.response?.data as { message?: string } | undefined)?.message;
        toast.error(message || 'Грешка при вход.');
        return;
      }
      toast.error('Грешка при вход.');
    },
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', color: '#fff' }}>
            <Shield className="h-8 w-8" />
          </div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#fff' }}>Platform Admin</h1>
        </div>

        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          style={{ background: '#fff', borderRadius: 24, boxShadow: '0 24px 60px rgba(15,23,42,0.28)', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}
        >
          <div style={{ borderRadius: 14, background: '#f8fafc', padding: '12px 14px', fontSize: 13, lineHeight: 1.5, color: '#475569' }}>
            Входът тук не е hardcoded в проекта. Ползва backend env променливите <code>SUPER_ADMIN_EMAIL</code> и <code>SUPER_ADMIN_PASSWORD</code>.
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Email</label>
            <div style={{ position: 'relative' }}>
              <Mail style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} className="h-4 w-4" />
              <input
                {...register('email')}
                type="email"
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 42px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
              />
            </div>
            {errors.email && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.email.message}</p>}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 700, color: '#374151' }}>Парола</label>
            <div style={{ position: 'relative' }}>
              <Lock style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} className="h-4 w-4" />
              <input
                {...register('password')}
                type="password"
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 42px', borderRadius: 14, border: '1px solid #d1d5db', fontSize: 16 }}
              />
            </div>
            {errors.password && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#dc2626' }}>{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            style={{ width: '100%', padding: '14px 18px', borderRadius: 14, border: 'none', background: '#0f172a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Влез
          </button>
        </form>
      </div>
    </div>
  );
}
