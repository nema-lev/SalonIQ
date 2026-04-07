'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Loader2, Lock, Mail, Scissors } from 'lucide-react';
import { apiClient, setAuthToken } from '@/lib/api-client';

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
      apiClient.post<{ accessToken: string; owner: { name: string } }>('/auth/login', data),
    onSuccess: (data) => {
      setAuthToken(data.accessToken);
      toast.success(`Добре дошли, ${data.owner.name}!`);
      router.replace('/admin');
    },
    onError: () => {
      toast.error('Невалиден email или парола.');
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-secondary)]/10 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))' }}
          >
            <Scissors className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">Вход за администратор</h1>
          <p className="text-gray-500 text-sm mt-1">Управление на вашия бизнес</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit((data) => mutation.mutate(data))}
          className="bg-white rounded-2xl shadow-xl p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="elena@salon-aurora.bg"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors"
              />
            </div>
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Парола</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                {...register('password')}
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors"
              />
            </div>
            {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-60 transition-all"
          >
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            Влез
          </button>
        </form>
      </div>
    </div>
  );
}
