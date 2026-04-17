'use client';

import { useMemo, useState } from 'react';
import { AxiosError } from 'axios';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Loader2, Pencil, Plus, Scissors, User, UserRoundCheck } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { getSubscriptionPlanConfig, PLAN_LABELS } from '@/lib/plan-config';
import { useTenant } from '@/lib/tenant-context';

interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  bio: string | null;
  specialties: string[] | null;
  color: string | null;
  is_active: boolean;
  accepts_online: boolean;
  service_ids: string[] | null;
}

interface ServiceOption {
  id: string;
  name: string;
  category: string | null;
}

const schema = z.object({
  name: z.string().min(2, 'Минимум 2 символа'),
  email: z.string().email('Невалиден имейл').optional().or(z.literal('')),
  phone: z.string().optional(),
  bio: z.string().optional(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, 'Невалиден цвят'),
  accepts_online: z.boolean(),
  is_active: z.boolean(),
  specialtiesText: z.string().optional(),
  serviceIds: z.array(z.string()).default([]),
});

type FormValues = z.infer<typeof schema>;

const COLORS = ['#7c3aed', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1'];

export default function AdminStaffPage() {
  const qc = useQueryClient();
  const tenant = useTenant();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: staff, isLoading: staffLoading } = useQuery({
    queryKey: ['admin-staff'],
    queryFn: () => apiClient.get<StaffMember[]>('/staff/admin'),
    staleTime: 30 * 1000,
  });

  const { data: services, isLoading: servicesLoading } = useQuery({
    queryKey: ['admin-staff-services'],
    queryFn: () => apiClient.get<ServiceOption[]>('/services/admin'),
    staleTime: 60 * 1000,
  });

  const serviceOptions = useMemo(() => services ?? [], [services]);
  const planProfile = useMemo(() => getSubscriptionPlanConfig(tenant.plan), [tenant.plan]);
  const staffCount = staff?.length ?? 0;
  const reachedStaffLimit = planProfile.staffLimit != null && staffCount >= planProfile.staffLimit;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      color: '#7c3aed',
      accepts_online: true,
      is_active: true,
      specialtiesText: '',
      serviceIds: [],
    },
  });

  const selectedColor = watch('color');
  const selectedServiceIds = watch('serviceIds') || [];

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        name: values.name.trim(),
        email: values.email?.trim() || undefined,
        phone: values.phone?.trim() || undefined,
        bio: values.bio?.trim() || undefined,
        color: values.color,
        accepts_online: values.accepts_online,
        is_active: values.is_active,
        serviceIds: values.serviceIds,
        specialties: values.specialtiesText
          ?.split(',')
          .map((item) => item.trim())
          .filter(Boolean) || [],
      };

      return editing
        ? apiClient.patch(`/staff/admin/${editing.id}`, payload)
        : apiClient.post('/staff/admin', payload);
    },
    onSuccess: () => {
      toast.success(editing ? 'Служителят е обновен.' : 'Служителят е добавен.');
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
      setShowForm(false);
      setEditing(null);
      reset({
        color: '#7c3aed',
        accepts_online: true,
        is_active: true,
        specialtiesText: '',
        serviceIds: [],
      });
    },
    onError: (error) => {
      const errorMessage = (error as AxiosError<{ message?: string | string[] }>).response?.data?.message;
      const message = Array.isArray(errorMessage) ? errorMessage.join('\n') : errorMessage;
      toast.error(message || 'Грешка при запазване на служителя.');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (member: StaffMember) =>
      apiClient.patch(`/staff/admin/${member.id}`, {
        name: member.name,
        email: member.email ?? undefined,
        phone: member.phone ?? undefined,
        bio: member.bio ?? undefined,
        color: member.color || '#7c3aed',
        accepts_online: false,
        is_active: false,
        specialties: member.specialties || [],
        serviceIds: member.service_ids || [],
      }),
    onSuccess: () => {
      toast.success('Служителят е архивиран.');
      qc.invalidateQueries({ queryKey: ['admin-staff'] });
    },
    onError: () => {
      toast.error('Грешка при архивиране на служителя.');
    },
  });

  const openCreate = () => {
    if (reachedStaffLimit) {
      toast.error(`Текущият план (${PLAN_LABELS[(tenant.plan as keyof typeof PLAN_LABELS) || 'BASIC'] || tenant.plan}) е достигнал лимита за Персонал.`);
      return;
    }

    setEditing(null);
    reset({
      name: '',
      email: '',
      phone: '',
      bio: '',
      color: '#7c3aed',
      accepts_online: true,
      is_active: true,
      specialtiesText: '',
      serviceIds: [],
    });
    setShowForm(true);
  };

  const openEdit = (member: StaffMember) => {
    setEditing(member);
    reset({
      name: member.name,
      email: member.email ?? '',
      phone: member.phone ?? '',
      bio: member.bio ?? '',
      color: member.color || '#7c3aed',
      accepts_online: member.accepts_online,
      is_active: member.is_active,
      specialtiesText: member.specialties?.join(', ') ?? '',
      serviceIds: member.service_ids ?? [],
    });
    setShowForm(true);
  };

  const toggleService = (serviceId: string) => {
    const next = selectedServiceIds.includes(serviceId)
      ? selectedServiceIds.filter((id) => id !== serviceId)
      : [...selectedServiceIds, serviceId];
    setValue('serviceIds', next, { shouldValidate: true, shouldDirty: true });
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            {staffCount} профила
            {planProfile.staffLimit != null ? ` от ${planProfile.staffLimit}` : ' · без лимит'}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          disabled={reachedStaffLimit}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Нов служител
        </button>
      </div>

      {planProfile.staffLimit != null ? (
        <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${
          reachedStaffLimit
            ? 'border-amber-200 bg-amber-50 text-amber-900'
            : 'border-gray-200 bg-white text-gray-600'
        }`}>
          <p className="font-semibold text-gray-900">
            План {PLAN_LABELS[(tenant.plan as keyof typeof PLAN_LABELS) || 'BASIC'] || tenant.plan}
          </p>
          <p className="mt-1">
            Лимитът за Персонал е {planProfile.staffLimit} профила. Редакцията и архивирането остават активни.
            {reachedStaffLimit ? ' Добавянето на нов служител е блокирано до ъпгрейд на плана.' : ''}
          </p>
        </div>
      ) : null}

      {staffLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
        </div>
      ) : (
        <div className="grid gap-3">
          {staff?.map((member) => (
            <div key={member.id} className="rounded-2xl border border-gray-100 bg-white p-4">
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-black text-white"
                  style={{ backgroundColor: member.color || '#7c3aed' }}
                >
                  {member.name.charAt(0)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-bold text-gray-900">{member.name}</p>
                    {!member.is_active && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500">
                        Неактивен
                      </span>
                    )}
                    {!member.accepts_online && (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        Само офлайн
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                    {member.phone && <span>{member.phone}</span>}
                    {member.email && <span>{member.email}</span>}
                  </div>

                  {member.specialties?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {member.specialties.map((specialty) => (
                        <span key={specialty} className="rounded-full bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                          {specialty}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {member.service_ids?.length ? (
                    <p className="mt-3 text-xs text-gray-400">
                      Услуги: {member.service_ids.length}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-gray-400">Няма вързани услуги</p>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {member.is_active && (
                    <button
                      type="button"
                      onClick={() => archiveMutation.mutate(member)}
                      className="rounded-lg p-2 transition-colors hover:bg-gray-50"
                      title="Архивирай"
                    >
                      <Archive className="h-4 w-4 text-gray-400" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(member)}
                    className="rounded-lg p-2 transition-colors hover:bg-gray-50"
                  >
                    <Pencil className="h-4 w-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-gray-100 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-black text-gray-900">
                  {editing ? 'Редакция на служител' : 'Нов служител'}
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Тук добавяш и изключваш персонал, както и връзката му с услугите.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200"
              >
                <Plus className="h-4 w-4 rotate-45" />
              </button>
            </div>

            <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Име *</label>
                  <input
                    {...register('name')}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Телефон</label>
                  <input
                    {...register('phone')}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Имейл</label>
                  <input
                    {...register('email')}
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700">Роля/специалности</label>
                  <input
                    {...register('specialtiesText')}
                    placeholder="Фризьор, колорист, маникюр"
                    className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700">Описание</label>
                <textarea
                  {...register('bio')}
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Акцентен цвят</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setValue('color', color, { shouldValidate: true, shouldDirty: true })}
                      className={`h-8 w-8 rounded-full transition-transform ${selectedColor === color ? 'scale-110 ring-2 ring-gray-400 ring-offset-2' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Услуги</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {servicesLoading ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Зареждане на услуги...
                    </div>
                  ) : (
                    serviceOptions.map((service) => {
                      const active = selectedServiceIds.includes(service.id);
                      return (
                        <button
                          key={service.id}
                          type="button"
                          onClick={() => toggleService(service.id)}
                          className={`rounded-2xl border px-4 py-3 text-left transition-colors ${
                            active
                              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5'
                              : 'border-gray-200 bg-white hover:border-[var(--color-primary)]/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-gray-900">{service.name}</p>
                              {service.category && (
                                <p className="mt-1 text-xs text-gray-500">{service.category}</p>
                              )}
                            </div>
                            {active ? (
                              <UserRoundCheck className="h-4 w-4 flex-shrink-0 text-[var(--color-primary)]" />
                            ) : (
                              <Scissors className="h-4 w-4 flex-shrink-0 text-gray-300" />
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3">
                  <input {...register('accepts_online')} type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" />
                  <span className="text-sm text-gray-700">Участва в онлайн резервации</span>
                </label>

                <label className="flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-3">
                  <input {...register('is_active')} type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" />
                  <span className="text-sm text-gray-700">Активен профил</span>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-600"
                >
                  Отказ
                </button>
                <button
                  type="submit"
                  disabled={mutation.isPending}
                  className="flex-1 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {mutation.isPending ? 'Записване...' : 'Запази'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
