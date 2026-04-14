'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, Loader2, Clock, Tag, Users } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTenant, useTenantActions } from '@/lib/tenant-context';

interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price: number | null;
  color: string;
  color_mode?: 'manual' | 'theme';
  is_public: boolean;
  booking_mode?: 'standard' | 'group';
  slot_capacity?: number;
  group_days?: string[];
  group_time_slots?: string[];
}

const GROUP_DAY_OPTIONS = [
  { value: 'mon', label: 'Пон' },
  { value: 'tue', label: 'Вт' },
  { value: 'wed', label: 'Ср' },
  { value: 'thu', label: 'Чет' },
  { value: 'fri', label: 'Пет' },
  { value: 'sat', label: 'Съб' },
  { value: 'sun', label: 'Нед' },
] as const;
const GROUP_DAY_LABELS = Object.fromEntries(GROUP_DAY_OPTIONS.map((item) => [item.value, item.label])) as Record<(typeof GROUP_DAY_OPTIONS)[number]['value'], string>;

const schema = z.object({
  name: z.string().min(2, 'Минимум 2 символа'),
  description: z.string().optional(),
  category: z.string().optional(),
  duration_minutes: z.coerce.number().min(5).max(480),
  price: z.preprocess(
    (value) => (value === '' || value == null ? undefined : Number(value)),
    z.number().min(0).optional(),
  ),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  is_public: z.boolean(),
  showPrice: z.boolean().default(true),
  booking_mode: z.enum(['standard', 'group']).default('standard'),
  slot_capacity: z.coerce.number().min(1).max(100).default(1),
  group_days: z.array(z.string()).default([]),
  group_time_slots_text: z.string().optional(),
  color_mode: z.enum(['manual', 'theme']).default('theme'),
});
type FormValues = z.infer<typeof schema>;

const COLORS = ['#7c3aed','#8b5cf6','#a855f7','#ec4899','#ef4444','#f59e0b','#10b981','#3b82f6','#6366f1'];

function buildThemeCategoryPalette(primary: string, secondary: string) {
  return createThemeDrivenPalette(primary, secondary);
}

export default function AdminServicesPage() {
  const qc = useQueryClient();
  const tenant = useTenant();
  const { updateTenant } = useTenantActions();
  const isGroupTrainingBusiness = tenant.businessType === 'GROUP_TRAINING';
  const [categoryDraft, setCategoryDraft] = useState('');
  const [editing, setEditing] = useState<Service | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serviceCategories, setServiceCategories] = useState<string[]>(tenant.theme.serviceCategories || []);

  useEffect(() => {
    setServiceCategories(tenant.theme.serviceCategories || []);
  }, [tenant.theme.serviceCategories]);

  const { data: services, isLoading } = useQuery({
    queryKey: ['admin-services'],
    queryFn: () => apiClient.get<Service[]>('/services/admin'),
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      color: '#7c3aed',
      is_public: true,
      duration_minutes: 60,
      booking_mode: isGroupTrainingBusiness ? 'group' : 'standard',
      slot_capacity: 1,
      group_days: [],
      group_time_slots_text: '',
      color_mode: 'theme',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => {
      const parsedGroupTimeSlots = (data.group_time_slots_text || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        ...data,
        price: data.showPrice ? data.price ?? null : null,
        booking_mode: isGroupTrainingBusiness ? 'group' : 'standard',
        slot_capacity: isGroupTrainingBusiness ? data.slot_capacity : 1,
        group_days: isGroupTrainingBusiness ? data.group_days : [],
        group_time_slots: isGroupTrainingBusiness ? parsedGroupTimeSlots : [],
        category: data.category?.trim() || undefined,
        color:
          data.color_mode === 'theme'
            ? resolveCategoryColor(
                data.category?.trim() || null,
                mergeCategories(serviceCategories, data.category?.trim() || null),
                tenant.theme.primaryColor,
                tenant.theme.secondaryColor,
              )
            : data.color,
      };
      delete (payload as Partial<FormValues>).showPrice;
      delete (payload as Partial<FormValues>).group_time_slots_text;

      return (
      editing
        ? apiClient.patch(`/services/${editing.id}`, payload)
        : apiClient.post('/services', payload)
      );
    },
    onSuccess: () => {
      toast.success(editing ? 'Услугата е обновена' : 'Услугата е добавена');
      qc.invalidateQueries({ queryKey: ['admin-services'] });
      setShowForm(false);
      setEditing(null);
      reset();
    },
    onError: (error: any) => toast.error(error?.response?.data?.message || 'Грешка при запазване'),
  });

  const openEdit = (svc: Service) => {
    setEditing(svc);
    reset({
      name: svc.name,
      description: svc.description ?? '',
      category: svc.category ?? '',
      duration_minutes: svc.duration_minutes,
      price: svc.price ?? undefined,
      color: svc.color,
      is_public: svc.is_public,
      showPrice: svc.price != null,
      color_mode: svc.color_mode || 'manual',
      booking_mode: svc.booking_mode || (isGroupTrainingBusiness ? 'group' : 'standard'),
      slot_capacity: svc.slot_capacity ?? 1,
      group_days: svc.group_days ?? [],
      group_time_slots_text: (svc.group_time_slots ?? []).join(', '),
    });
    setShowForm(true);
  };

  const selectedColor = watch('color');
  const colorMode = watch('color_mode');
  const showPrice = watch('showPrice');
  const selectedGroupDays = watch('group_days') || [];
  const categoryValue = watch('category') || '';
  const groupedServices = groupServicesByCategory(services || []);
  const themePalette = buildThemeCategoryPalette(tenant.theme.primaryColor, tenant.theme.secondaryColor);

  const persistCategories = async (nextCategories: string[]) => {
    const result = await apiClient.patch<{ updated: boolean; serviceCategories: string[] }>(
      '/tenants/settings/service-categories',
      { serviceCategories: nextCategories },
    );
    setServiceCategories(result.serviceCategories);
    updateTenant({ theme: { serviceCategories: result.serviceCategories } });
  };

  const addCategory = async () => {
    const trimmed = categoryDraft.trim();
    if (!trimmed) return;
    const next = Array.from(new Set([...serviceCategories, trimmed]));
    await persistCategories(next);
    setCategoryDraft('');
    toast.success('Категорията е добавена.');
  };

  return (
    <div className="mx-auto w-full max-w-6xl min-w-0">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-gray-500">{services?.length ?? 0} услуги</p>
        <button
          onClick={() => {
            setEditing(null);
            reset({
              color: '#7c3aed',
              is_public: true,
              duration_minutes: 60,
              showPrice: true,
              booking_mode: isGroupTrainingBusiness ? 'group' : 'standard',
              slot_capacity: 1,
              group_days: [],
              group_time_slots_text: '',
              color_mode: 'theme',
            });
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 transition-all"
        >
          <Plus className="w-4 h-4" />Нова услуга
        </button>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Категории</label>
            <input
              value={categoryDraft}
              onChange={(event) => setCategoryDraft(event.target.value)}
              placeholder="Добави категория"
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
            />
          </div>
          <button
            type="button"
            onClick={() => void addCategory()}
            className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          >
            Добави категория
          </button>
        </div>
        {serviceCategories.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {serviceCategories.map((category, index) => (
              <span
                key={category}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  backgroundColor: `${themePalette[index % themePalette.length]}18`,
                  borderColor: `${themePalette[index % themePalette.length]}40`,
                  color: themePalette[index % themePalette.length],
                }}
              >
                {category}
              </span>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" /></div>
      ) : (
        <div className="grid gap-3">
          {groupedServices.map(([categoryName, categoryServices]) => {
            const categoryColor = resolveCategoryColor(
              categoryName === '__uncategorized__' ? null : categoryName,
              mergeCategories(serviceCategories, categoryName === '__uncategorized__' ? null : categoryName),
              tenant.theme.primaryColor,
              tenant.theme.secondaryColor,
            );
            return (
              <div key={categoryName} className="rounded-3xl border border-gray-100 bg-white p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: categoryColor }} />
                  <h3 className="text-sm font-black text-gray-900">
                    {categoryName === '__uncategorized__' ? 'Без категория' : categoryName}
                  </h3>
                  <span className="text-xs text-gray-400">{categoryServices.length} услуги</span>
                </div>
                <div className="grid gap-3">
                  {categoryServices.map((svc) => (
                    <div key={svc.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
                      <div className="w-3 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: svc.color_mode === 'theme' ? categoryColor : svc.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900">{svc.name}</p>
                          {!svc.is_public && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Скрита</span>}
                          {svc.color_mode === 'theme' && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Тема</span>}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-400 mt-0.5 flex-wrap">
                          {svc.category && <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{svc.category}</span>}
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{svc.duration_minutes} мин.</span>
                          {svc.booking_mode === 'group' && (
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />до {svc.slot_capacity ?? 1} души</span>
                          )}
                          <span className="font-semibold text-gray-600">
                            {svc.price != null ? `${svc.price} €` : 'Цена по запитване'}
                          </span>
                        </div>
                        {svc.booking_mode === 'group' && (
                          <p className="mt-1 text-xs text-gray-500">
                            {(svc.group_days ?? []).map((day) => GROUP_DAY_LABELS[day as keyof typeof GROUP_DAY_LABELS] || day).join(', ') || 'Без дни'} · {(svc.group_time_slots ?? []).join(', ') || 'Без часове'}
                          </p>
                        )}
                      </div>
                      <button onClick={() => openEdit(svc)} className="p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <Pencil className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="font-black text-lg text-gray-900 mb-5">
              {editing ? 'Редактирай услуга' : 'Нова услуга'}
            </h3>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Наименование *</label>
                <input {...register('name')} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm" />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Категория</label>
                  <select {...register('category')} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm bg-white">
                    <option value="">Без категория</option>
                    {[...new Set([...(serviceCategories || []), ...(categoryValue ? [categoryValue] : [])])].map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Продължителност (мин) *</label>
                  <input {...register('duration_minutes')} type="number" min={5} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Цена (€)</label>
                  <input
                    {...register('price')}
                    type="number"
                    step="0.01"
                    min={0}
                    placeholder={showPrice ? '0.00' : 'Скрита'}
                    disabled={!showPrice}
                    className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Цвят</label>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setValue('color_mode', 'theme', { shouldDirty: true })}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold ${colorMode === 'theme' ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}
                      >
                        От темата
                      </button>
                      <button
                        type="button"
                        onClick={() => setValue('color_mode', 'manual', { shouldDirty: true })}
                        className={`rounded-xl px-3 py-2 text-xs font-semibold ${colorMode === 'manual' ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-600'}`}
                      >
                        Ръчен цвят
                      </button>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {COLORS.map((c) => (
                        <button key={c} type="button" onClick={() => setValue('color', c)}
                          disabled={colorMode !== 'manual'}
                          className={`w-6 h-6 rounded-full transition-transform disabled:opacity-35 ${selectedColor === c ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    {colorMode === 'theme' && (
                      <p className="text-xs text-gray-500">
                        Цветът ще се вземе от избраната тема и категорията.
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Описание</label>
                <textarea {...register('description')} rows={2} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm resize-none" />
              </div>
              {isGroupTrainingBusiness && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Капацитет *</label>
                      <input {...register('slot_capacity')} type="number" min={1} max={100} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm" />
                      {errors.slot_capacity && <p className="text-red-500 text-xs mt-1">{errors.slot_capacity.message}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Часове за класа</label>
                      <input
                        {...register('group_time_slots_text')}
                        placeholder="09:00, 18:30"
                        className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Дни за провеждане</label>
                    <div className="flex flex-wrap gap-2">
                      {GROUP_DAY_OPTIONS.map((day) => {
                        const active = selectedGroupDays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => setValue(
                              'group_days',
                              active
                                ? selectedGroupDays.filter((value) => value !== day.value)
                                : [...selectedGroupDays, day.value],
                              { shouldDirty: true, shouldValidate: true },
                            )}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                              active
                                ? 'bg-[var(--color-primary)] text-white'
                                : 'border border-gray-200 bg-white text-gray-600'
                            }`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      За групови тренировки клиентите ще виждат само тези дни и точните часове от полето по-горе.
                    </p>
                  </div>
                </>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input {...register('is_public')} type="checkbox" className="accent-[var(--color-primary)] w-4 h-4" />
                <span className="text-sm text-gray-700">Видима за клиенти (онлайн резервации)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input {...register('showPrice')} type="checkbox" className="accent-[var(--color-primary)] w-4 h-4" />
                <span className="text-sm text-gray-700">Показвай цена към услугата</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Отказ</button>
                <button type="submit" disabled={mutation.isPending} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Запази
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function groupServicesByCategory(services: Service[]) {
  const groups = new Map<string, Service[]>();
  for (const service of services) {
    const key = service.category?.trim() || '__uncategorized__';
    const bucket = groups.get(key) || [];
    bucket.push(service);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'bg'));
}

function resolveCategoryColor(
  category: string | null,
  categories: string[],
  primaryColor: string,
  secondaryColor: string,
) {
  const palette = buildThemeCategoryPalette(primaryColor, secondaryColor);
  if (!category) {
    return palette[0];
  }
  const normalizedCategory = category.trim();
  const nextCategories = mergeCategories(categories, normalizedCategory);
  const index = Math.max(nextCategories.findIndex((entry) => entry === normalizedCategory), 0);
  return palette[index % palette.length];
}

function mergeCategories(categories: string[], category: string | null) {
  const next = new Set(categories.map((entry) => entry.trim()).filter(Boolean));
  if (category?.trim()) {
    next.add(category.trim());
  }
  return [...next];
}

function createThemeDrivenPalette(primary: string, secondary: string) {
  const primaryHsl = hexToHsl(primary) || { h: 265, s: 74, l: 55 };
  const secondaryHsl = hexToHsl(secondary) || { h: 290, s: 68, l: 62 };
  const hues = [
    primaryHsl.h,
    secondaryHsl.h,
    primaryHsl.h + 18,
    secondaryHsl.h - 18,
    primaryHsl.h + 36,
    secondaryHsl.h + 24,
    primaryHsl.h - 24,
    secondaryHsl.h + 46,
    primaryHsl.h + 58,
    secondaryHsl.h - 42,
  ];

  return hues.map((hue, index) =>
    hslToHex({
      h: normalizeHue(hue),
      s: clamp(primaryHsl.s + (index % 2 === 0 ? 2 : -4), 58, 78),
      l: clamp(54 + ((index % 4) - 1.5) * 4, 42, 66),
    }),
  );
}

function hexToHsl(hex: string) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }

  return {
    h: normalizeHue(h * 60),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex({ h, s, l }: { h: number; s: number; l: number }) {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return `#${[r, g, b]
    .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0'))
    .join('')}`;
}

function parseHex(value: string) {
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16),
    };
  }
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return {
      r: parseInt(`${normalized[1]}${normalized[1]}`, 16),
      g: parseInt(`${normalized[2]}${normalized[2]}`, 16),
      b: parseInt(`${normalized[3]}${normalized[3]}`, 16),
    };
  }
  return null;
}

function normalizeHue(value: number) {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
