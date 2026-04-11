'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Save,
  Bot,
  Clock,
  Shield,
  Palette,
  ChevronDown,
  Loader2,
  ExternalLink,
  Copy,
  Upload,
  Image as ImageIcon,
  X,
  UserRound,
  KeyRound,
} from 'lucide-react';
import { useTenant, useTenantActions } from '@/lib/tenant-context';
import { apiClient } from '@/lib/api-client';
import {
  DEFAULT_NOTIFICATION_TEMPLATES,
  TEMPLATE_TOKENS,
  renderTemplatePreview,
} from '@/lib/notification-templates';

type Tab = 'general' | 'notifications' | 'booking' | 'theme';

const BUSINESS_TYPE_OPTIONS = [
  { value: 'SALON', label: 'Козметичен салон' },
  { value: 'BARBERSHOP', label: 'Бръснарница' },
  { value: 'HAIR_SALON', label: 'Фризьорски салон' },
  { value: 'NAIL_STUDIO', label: 'Маникюрно студио' },
  { value: 'SPA', label: 'СПА / уелнес' },
  { value: 'DENTAL', label: 'Дентален кабинет' },
  { value: 'MASSAGE', label: 'Масажно студио' },
  { value: 'BEAUTY', label: 'Студио за красота' },
  { value: 'OTHER', label: 'Друг бизнес' },
] as const;

const BUSINESS_TYPE_LABELS = Object.fromEntries(
  BUSINESS_TYPE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<(typeof BUSINESS_TYPE_OPTIONS)[number]['value'], string>;

type ThemePreset = {
  id: string;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  borderRadius: 'sharp' | 'rounded' | 'pill';
  surfaceStyle: 'light' | 'graphite' | 'dark';
};

const THEME_PRESETS: ThemePreset[] = [
  { id: 'royal', label: 'Royal', primaryColor: '#7c3aed', secondaryColor: '#a855f7', accentColor: '#f59e0b', borderRadius: 'rounded', surfaceStyle: 'light' },
  { id: 'emerald', label: 'Emerald', primaryColor: '#047857', secondaryColor: '#10b981', accentColor: '#f59e0b', borderRadius: 'rounded', surfaceStyle: 'light' },
  { id: 'rose', label: 'Rose', primaryColor: '#e11d48', secondaryColor: '#fb7185', accentColor: '#f97316', borderRadius: 'pill', surfaceStyle: 'light' },
  { id: 'midnight', label: 'Midnight', primaryColor: '#8b5cf6', secondaryColor: '#38bdf8', accentColor: '#f97316', borderRadius: 'rounded', surfaceStyle: 'dark' },
  { id: 'graphite', label: 'Graphite', primaryColor: '#111827', secondaryColor: '#475569', accentColor: '#22c55e', borderRadius: 'sharp', surfaceStyle: 'graphite' },
  { id: 'gold', label: 'Gold', primaryColor: '#9a3412', secondaryColor: '#f59e0b', accentColor: '#111827', borderRadius: 'sharp', surfaceStyle: 'light' },
  { id: 'ocean', label: 'Ocean', primaryColor: '#0369a1', secondaryColor: '#38bdf8', accentColor: '#14b8a6', borderRadius: 'rounded', surfaceStyle: 'light' },
  { id: 'noir', label: 'Noir', primaryColor: '#0f172a', secondaryColor: '#334155', accentColor: '#f59e0b', borderRadius: 'pill', surfaceStyle: 'dark' },
];

function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function getApiErrorMessage(error: any, fallback = 'Грешка при запазване.') {
  const message = error?.response?.data?.message;
  if (Array.isArray(message)) {
    return message.filter((item) => typeof item === 'string' && item.trim()).join('\n') || fallback;
  }
  if (typeof message === 'string' && message.trim()) {
    return message;
  }
  return fallback;
}

function getBookingSettingsErrorMessage(error: any) {
  const raw = getApiErrorMessage(error, '');
  if (
    raw.includes('maxAdvanceBookingDays') ||
    raw.includes('minAdvanceBookingHours') ||
    raw.includes('cancellationHours')
  ) {
    return 'Провери числовите полета: Отмяна до трябва да е между 0 и 168 часа, Мин. предварително между 0 и 72 часа, а Макс. напред между 1 и 365 дни.';
  }

  return raw || 'Грешка при запазване.';
}

function parseOptionalNumber(value: unknown) {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');

  const TABS = [
    { id: 'general' as Tab, label: 'Основни', icon: Shield },
    { id: 'notifications' as Tab, label: 'Известявания', icon: Bot },
    { id: 'booking' as Tab, label: 'Резервации', icon: Clock },
    { id: 'theme' as Tab, label: 'Облик', icon: Palette },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-hidden px-0.5">
      <div className="grid w-full grid-cols-2 gap-2 rounded-[24px] border border-white/60 bg-white/72 p-2 shadow-[0_16px_36px_rgba(15,23,42,0.06)] backdrop-blur-xl sm:grid-cols-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex min-w-0 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition-all ${
              activeTab === id ? 'bg-white text-gray-900 shadow-[0_10px_24px_rgba(15,23,42,0.08)]' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-5 sm:mt-6">
        {activeTab === 'general' && <GeneralSettings />}
        {activeTab === 'notifications' && <NotificationSettings />}
        {activeTab === 'booking' && <BookingSettings />}
        {activeTab === 'theme' && <ThemeSettings />}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-white/60 bg-white/88 p-4 shadow-[0_20px_44px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
      <h3 className="mb-4 text-base font-bold text-gray-900 sm:text-[1.05rem]">{title}</h3>
      {children}
    </div>
  );
}

function SaveBtn({ isDirty, isSubmitting }: { isDirty: boolean; isSubmitting: boolean }) {
  return (
    <div className="pointer-events-none sticky z-20 pt-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
      <div className="pointer-events-auto ml-auto flex w-full max-w-full justify-end sm:w-auto">
        <div className="w-full rounded-[22px] border border-white/70 bg-white/90 p-2 shadow-[0_18px_48px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:w-auto">
          <button
            type="submit"
            disabled={!isDirty || isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-5 py-3 font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[168px]"
            style={{
              boxShadow: '0 18px 42px rgba(124,58,237,0.24)',
            }}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isSubmitting ? 'Запазване...' : 'Запази'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }
>(function Input({ label, hint, className, ...rest }, ref) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <input
        ref={ref}
        {...rest}
        className={`w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)] ${className || ''}`}
      />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
});

function GeneralSettings() {
  const tenant = useTenant();
  const { updateTenant } = useTenantActions();
  const [ownerProfile, setOwnerProfile] = useState<null | { name: string; email: string }>(null);
  const [ownerProfileError, setOwnerProfileError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm({
    defaultValues: {
      businessName: tenant.businessName,
      description: tenant.description || '',
      address: tenant.address || '',
      city: tenant.city || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      website: tenant.website || '',
      googleMapsUrl: tenant.googleMapsUrl || '',
    },
  });
  const {
    register: registerOwner,
    handleSubmit: handleSubmitOwner,
    reset: resetOwner,
    formState: { isDirty: isOwnerDirty, isSubmitting: isOwnerSubmitting },
  } = useForm({
    defaultValues: {
      name: '',
      email: '',
      currentPassword: '',
      newPassword: '',
    },
  });

  useEffect(() => {
    reset({
      businessName: tenant.businessName,
      description: tenant.description || '',
      address: tenant.address || '',
      city: tenant.city || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      website: tenant.website || '',
      googleMapsUrl: tenant.googleMapsUrl || '',
    });
  }, [tenant, reset]);

  useEffect(() => {
    let mounted = true;
    apiClient
      .get<{ id: string; name: string; email: string; role: string; tenantId: string }>('/auth/me')
      .then((owner) => {
        if (!mounted) return;
        setOwnerProfileError(null);
        setOwnerProfile({ name: owner.name, email: owner.email });
        resetOwner({
          name: owner.name,
          email: owner.email,
          currentPassword: '',
          newPassword: '',
        });
      })
      .catch((error) => {
        if (!mounted) return;
        setOwnerProfileError(getApiErrorMessage(error, 'Неуспешно зареждане на профила на собственика.'));
      });

    return () => {
      mounted = false;
    };
  }, [resetOwner]);

  const onSubmit = async (values: any) => {
    const payload = {
      businessName: values.businessName.trim(),
      description: normalizeOptionalString(values.description),
      address: normalizeOptionalString(values.address),
      city: normalizeOptionalString(values.city),
      phone: normalizeOptionalString(values.phone),
      email: normalizeOptionalString(values.email)?.toLowerCase(),
      website: normalizeOptionalString(values.website),
      googleMapsUrl: normalizeOptionalString(values.googleMapsUrl),
    };

    try {
      await apiClient.patch('/tenants/settings/general', payload);
      updateTenant({
        businessName: payload.businessName,
        description: payload.description ?? null,
        address: payload.address ?? null,
        city: payload.city ?? null,
        phone: payload.phone ?? null,
        email: payload.email ?? null,
        website: payload.website ?? null,
        googleMapsUrl: payload.googleMapsUrl ?? null,
      });
      reset({
        businessName: payload.businessName,
        description: payload.description || '',
        address: payload.address || '',
        city: payload.city || '',
        phone: payload.phone || '',
        email: payload.email || '',
        website: payload.website || '',
        googleMapsUrl: payload.googleMapsUrl || '',
      });
      toast.success('Информацията за бизнеса е запазена.');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const onSubmitOwner = async (values: any) => {
    try {
      const result = await apiClient.patch<{
        updated: boolean;
        owner: { id: string; name: string; email: string };
      }>('/auth/profile', {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        currentPassword: normalizeOptionalString(values.currentPassword),
        newPassword: normalizeOptionalString(values.newPassword),
      });

      setOwnerProfile({ name: result.owner.name, email: result.owner.email });
      resetOwner({
        name: result.owner.name,
        email: result.owner.email,
        currentPassword: '',
        newPassword: '',
      });
      toast.success('Данните за достъп са запазени.');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-28">
        <Card title="Информация за бизнеса">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Input label="Наименование" {...register('businessName')} />
            </div>
            <div className="md:col-span-2">
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-4">
                <p className="text-sm font-medium text-gray-700">Тип бизнес</p>
                <div className="mt-2 inline-flex items-center rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 shadow-sm">
                  {BUSINESS_TYPE_LABELS[tenant.businessType as keyof typeof BUSINESS_TYPE_LABELS] || tenant.businessType}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  Тази настройка вече се управлява само от super admin панела, за да не се разминава логиката между отделните типове бизнес.
                </p>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Описание</label>
              <textarea
                {...register('description')}
                rows={4}
                className="w-full resize-none rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
              />
            </div>
            <Input label="Адрес" {...register('address')} />
            <Input label="Град" {...register('city')} />
            <Input label="Телефон" type="tel" {...register('phone')} />
            <Input label="Email" type="email" {...register('email')} />
            <Input label="Уебсайт" type="url" placeholder="https://example.com" {...register('website')} />
            <Input label="Google Maps линк" type="url" placeholder="https://maps.google.com/..." {...register('googleMapsUrl')} />
          </div>
        </Card>
        <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
      </form>

      <form onSubmit={handleSubmitOwner(onSubmitOwner)} className="space-y-5 pb-28">
        <Card title="Собственик и достъп">
          {ownerProfileError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {ownerProfileError}
            </div>
          )}
          <div className="mb-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            В момента входът е по email, не по потребителско име. Забравена парола още няма отделен автоматичен recovery flow.
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Име на собственика"
              placeholder="Елена Петрова"
              {...registerOwner('name')}
            />
            <Input
              label="Email за вход"
              type="email"
              placeholder="owner@business.com"
              {...registerOwner('email')}
            />
            <Input
              label="Текуща парола"
              type="password"
              hint="Нужна е само ако сменяте email или парола."
              {...registerOwner('currentPassword')}
            />
            <Input
              label="Нова парола"
              type="password"
              hint="Оставете празно, ако не сменяте паролата."
              {...registerOwner('newPassword')}
            />
          </div>
          {ownerProfile && (
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5">
                <UserRound className="h-3.5 w-3.5" />
                {ownerProfile.name}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                {ownerProfile.email}
              </span>
            </div>
          )}
        </Card>
        <SaveBtn isDirty={isOwnerDirty} isSubmitting={isOwnerSubmitting} />
      </form>
    </div>
  );
}

function NotificationSettings() {
  const tenant = useTenant();
  const { updateTenant } = useTenantActions();
  const [publicBaseUrl, setPublicBaseUrl] = useState('');
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [openingTelegramBot, setOpeningTelegramBot] = useState(false);
  const [notificationSettingsLoaded, setNotificationSettingsLoaded] = useState(false);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>('booking-pending');
  const [telegramBotLink, setTelegramBotLink] = useState<string | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<null | {
    connected: boolean;
    webhookUrl: string;
    pendingUpdateCount?: number;
    lastErrorMessage?: string;
  }>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm({
    defaultValues: {
      telegramBotToken: '',
      telegramChatId: '',
      smsApiKey: '',
      smsSenderId: '',
      reminder24h: tenant.reminderHours.includes(24),
      reminder2h: tenant.reminderHours.includes(2),
      bookingPendingTemplate: tenant.notificationTemplates.bookingPending,
      bookingConfirmedTemplate: tenant.notificationTemplates.bookingConfirmed,
      reminder24hTemplate: tenant.notificationTemplates.reminder24h,
      reminder2hTemplate: tenant.notificationTemplates.reminder2h,
      cancellationTemplate: tenant.notificationTemplates.cancellation,
      ownerNewBookingTemplate: tenant.notificationTemplates.ownerNewBooking,
    },
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPublicBaseUrl(window.location.origin);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    apiClient
      .get<{
        telegramBotToken: string;
        telegramChatId: string;
        smsApiKey: string;
        smsSenderId: string;
        reminderHours: number[];
        notificationTemplates: typeof tenant.notificationTemplates;
      }>('/tenants/settings/notifications')
      .then((settings) => {
        if (!mounted) return;
        reset({
          telegramBotToken: settings.telegramBotToken || '',
          telegramChatId: settings.telegramChatId || '',
          smsApiKey: settings.smsApiKey || '',
          smsSenderId: settings.smsSenderId || '',
          reminder24h: settings.reminderHours.includes(24),
          reminder2h: settings.reminderHours.includes(2),
          bookingPendingTemplate: settings.notificationTemplates.bookingPending,
          bookingConfirmedTemplate: settings.notificationTemplates.bookingConfirmed,
          reminder24hTemplate: settings.notificationTemplates.reminder24h,
          reminder2hTemplate: settings.notificationTemplates.reminder2h,
          cancellationTemplate: settings.notificationTemplates.cancellation,
          ownerNewBookingTemplate: settings.notificationTemplates.ownerNewBooking,
        });
        setNotificationSettingsLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setNotificationSettingsLoaded(true);
        toast.error('Неуспешно зареждане на настройките за известия.');
      });

    return () => {
      mounted = false;
    };
  }, [reset]);

  useEffect(() => {
    setValue('reminder24h', tenant.reminderHours.includes(24), { shouldDirty: false });
    setValue('reminder2h', tenant.reminderHours.includes(2), { shouldDirty: false });
    setValue('bookingPendingTemplate', tenant.notificationTemplates.bookingPending, { shouldDirty: false });
    setValue('bookingConfirmedTemplate', tenant.notificationTemplates.bookingConfirmed, { shouldDirty: false });
    setValue('reminder24hTemplate', tenant.notificationTemplates.reminder24h, { shouldDirty: false });
    setValue('reminder2hTemplate', tenant.notificationTemplates.reminder2h, { shouldDirty: false });
    setValue('cancellationTemplate', tenant.notificationTemplates.cancellation, { shouldDirty: false });
    setValue('ownerNewBookingTemplate', tenant.notificationTemplates.ownerNewBooking, { shouldDirty: false });
  }, [tenant.notificationTemplates, tenant.reminderHours, setValue]);

  const reminder24h = watch('reminder24h');
  const reminder2h = watch('reminder2h');
  const bookingPendingTemplate = watch('bookingPendingTemplate');
  const bookingConfirmedTemplate = watch('bookingConfirmedTemplate');
  const reminder24hTemplate = watch('reminder24hTemplate');
  const reminder2hTemplate = watch('reminder2hTemplate');
  const cancellationTemplate = watch('cancellationTemplate');
  const ownerNewBookingTemplate = watch('ownerNewBookingTemplate');
  const webhookUrl = publicBaseUrl ? `${publicBaseUrl}/api/v1/webhooks/telegram/${tenant.slug}` : '';
  const hasSmsConfig = Boolean(watch('smsApiKey') || watch('smsSenderId'));

  const buildNotificationPayload = (values: any) => {
    const reminderHours = [values.reminder24h ? 24 : null, values.reminder2h ? 2 : null].filter(
      (value): value is number => typeof value === 'number',
    );

    return {
      telegramBotToken: normalizeOptionalString(values.telegramBotToken),
      telegramChatId: normalizeOptionalString(values.telegramChatId),
      smsApiKey: normalizeOptionalString(values.smsApiKey),
      smsSenderId: normalizeOptionalString(values.smsSenderId),
      reminderHours,
      bookingPendingTemplate: values.bookingPendingTemplate.trim(),
      bookingConfirmedTemplate: values.bookingConfirmedTemplate.trim(),
      reminder24hTemplate: values.reminder24hTemplate.trim(),
      reminder2hTemplate: values.reminder2hTemplate.trim(),
      cancellationTemplate: values.cancellationTemplate.trim(),
      ownerNewBookingTemplate: values.ownerNewBookingTemplate.trim(),
    };
  };

  const getWebhookPayload = (values: any) => ({
    publicBaseUrl,
    telegramBotToken: normalizeOptionalString(values.telegramBotToken),
    telegramChatId: normalizeOptionalString(values.telegramChatId),
  });

  const persistNotificationSettings = async (values: any, silent = false) => {
    const payload = buildNotificationPayload(values);
    const result = await apiClient.patch<{ updated: boolean; notificationTemplates: typeof tenant.notificationTemplates }>(
      '/tenants/settings/notifications',
      payload,
    );

    updateTenant({ reminderHours: payload.reminderHours, notificationTemplates: result.notificationTemplates });
    reset({
      telegramBotToken: values.telegramBotToken || '',
      telegramChatId: values.telegramChatId || '',
      smsApiKey: values.smsApiKey || '',
      smsSenderId: values.smsSenderId || '',
      reminder24h: payload.reminderHours.includes(24),
      reminder2h: payload.reminderHours.includes(2),
      bookingPendingTemplate: result.notificationTemplates.bookingPending,
      bookingConfirmedTemplate: result.notificationTemplates.bookingConfirmed,
      reminder24hTemplate: result.notificationTemplates.reminder24h,
      reminder2hTemplate: result.notificationTemplates.reminder2h,
      cancellationTemplate: result.notificationTemplates.cancellation,
      ownerNewBookingTemplate: result.notificationTemplates.ownerNewBooking,
    });

    if (!silent) {
      toast.success('Настройките за известявания са запазени.');
    }

    return result;
  };

  const saveTelegramCredentials = async () => {
    try {
      setTelegramSaving(true);
      await persistNotificationSettings(getValues());
    } catch (error: any) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setTelegramSaving(false);
    }
  };

  const onSubmit = async (values: any) => {
    try {
      await persistNotificationSettings(values);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const connectWebhook = async () => {
    try {
      const values = getValues();
      const result = await apiClient.post<{
        connected: boolean;
        webhookUrl: string;
        info: { pendingUpdateCount?: number; lastErrorMessage?: string };
      }>('/tenants/settings/notifications/webhook/connect', {
        ...getWebhookPayload(values),
      });

      setWebhookStatus({
        connected: result.connected,
        webhookUrl: result.webhookUrl,
        pendingUpdateCount: result.info.pendingUpdateCount,
        lastErrorMessage: result.info.lastErrorMessage,
      });
      toast.success(result.connected ? 'Webhook-ът е свързан.' : 'Webhook-ът не беше потвърден от Telegram.');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Грешка при свързване на webhook-а.'));
    }
  };

  const checkWebhook = async () => {
    try {
      const values = getValues();
      const result = await apiClient.post<{
        connected: boolean;
        webhookUrl: string;
        info: { pendingUpdateCount?: number; lastErrorMessage?: string };
      }>('/tenants/settings/notifications/webhook/info', getWebhookPayload(values));

      setWebhookStatus({
        connected: result.connected,
        webhookUrl: result.webhookUrl,
        pendingUpdateCount: result.info.pendingUpdateCount,
        lastErrorMessage: result.info.lastErrorMessage,
      });
      toast.success(result.connected ? 'Webhook информацията е обновена.' : 'За този бот няма активен webhook.');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Грешка при проверка на webhook-а.'));
    }
  };

  const disconnectWebhook = async () => {
    try {
      const result = await apiClient.post<{
        connected: boolean;
        webhookUrl: string;
        info: { pendingUpdateCount?: number; lastErrorMessage?: string };
      }>('/tenants/settings/notifications/webhook/disconnect', {});

      setWebhookStatus({
        connected: result.connected,
        webhookUrl: result.webhookUrl,
        pendingUpdateCount: result.info.pendingUpdateCount,
        lastErrorMessage: result.info.lastErrorMessage,
      });
      toast.success('Webhook-ът е премахнат.');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Грешка при премахване на webhook-а.'));
    }
  };

  const openTelegramBot = async () => {
    try {
      setOpeningTelegramBot(true);
      const values = getValues();
      const result = await apiClient.post<{
        botUsername: string;
        botLink: string;
        expiresAt: string;
        linkedChatId: string | null;
      }>('/tenants/settings/notifications/telegram/owner-link', {
        telegramBotToken: normalizeOptionalString(values.telegramBotToken),
      });

      setTelegramBotLink(result.botLink);
      window.location.assign(result.botLink);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error, 'Грешка при отваряне на Telegram бота.'));
    } finally {
      setOpeningTelegramBot(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-28">
      <Card title="Telegram канал">
        <div className="space-y-4 overflow-x-hidden">
          <div className="rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-blue-700">
            1. Създавате бот през <strong>@BotFather</strong> с <code>/newbot</code>.<br />
            2. Запазвате Bot Token-а тук.<br />
            3. Натискате бутона за webhook отдолу. Той вика Telegram Bot API вместо команда в BotFather.<br />
            4. Chat ID на собственика се взима най-лесно чрез <strong>@userinfobot</strong>, не чрез Вашия бот.
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href="https://t.me/BotFather"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              <Bot className="h-4 w-4" />
              Отвори @BotFather
            </a>
            <a
              href="https://t.me/userinfobot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              <ExternalLink className="h-4 w-4" />
              Отвори @userinfobot
            </a>
            <button
              type="button"
              onClick={openTelegramBot}
              disabled={openingTelegramBot}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              {openingTelegramBot ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
              Отвори моя бот
            </button>
          </div>

          <Input
            label="Bot Token (оставете празно ако не се сменя)"
            type="password"
            placeholder="7123456789:AAxxxxx..."
            {...register('telegramBotToken')}
            className="font-mono"
          />
          <Input
            label="Chat ID на собственика"
            placeholder="123456789"
            {...register('telegramChatId')}
            hint='Автоматичен вариант: "Отвори моя бот" -> Start. Ръчен fallback: @userinfobot.'
          />

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div className="space-y-2">
              <button
                type="button"
                onClick={saveTelegramCredentials}
                disabled={telegramSaving}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
              >
                {telegramSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {telegramSaving ? 'Запазване...' : 'Запази Telegram данните'}
              </button>
              <p className="text-xs text-gray-500">
                Бутоните за webhook работят и с текущо въведените стойности. Този бутон е само за отделно запазване на настройките.
              </p>
            </div>
          </div>

          {telegramBotLink && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              <p className="font-semibold">Директен линк към бота</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={telegramBotLink}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-emerald-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Отвори Telegram линка
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(telegramBotLink);
                    toast.success('Telegram линкът е копиран.');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700"
                >
                  <Copy className="h-4 w-4" />
                  Копирай линка
                </button>
              </div>
            </div>
          )}

          <div className="min-w-0 rounded-xl bg-gray-50 p-3">
            <p className="mb-1.5 text-xs font-semibold text-gray-600">Webhook URL:</p>
            <div className="flex min-w-0 items-center gap-2">
              <code className="min-w-0 flex-1 break-all text-xs text-gray-700">{webhookUrl}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success('Webhook URL е копиран.');
                }}
                className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50"
              >
                <Copy className="h-3 w-3" />
                Копирай
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connectWebhook}
              disabled={!publicBaseUrl || !notificationSettingsLoaded}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Свържи webhook
            </button>
            <button
              type="button"
              onClick={checkWebhook}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Провери webhook
            </button>
            <button
              type="button"
              onClick={disconnectWebhook}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
            >
              Премахни webhook
            </button>
          </div>

          {webhookStatus && (
            <div className={`rounded-xl p-4 text-sm ${webhookStatus.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              <p className="font-semibold">
                {webhookStatus.connected ? 'Webhook-ът е активен.' : 'Няма активен webhook.'}
              </p>
              {webhookStatus.webhookUrl && (
                <p className="mt-1 break-all">URL: {webhookStatus.webhookUrl}</p>
              )}
              {typeof webhookStatus.pendingUpdateCount === 'number' && (
                <p className="mt-1">Чакащи update-и: {webhookStatus.pendingUpdateCount}</p>
              )}
              {webhookStatus.lastErrorMessage && (
                <p className="mt-1">Последна грешка: {webhookStatus.lastErrorMessage}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="Тригери и резервен SMS">
        <div className="space-y-5">
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            Тук управляваш кога да се изпращат известията. Telegram е основният интерактивен канал. SMS остава резервен вариант за клиенти без Telegram.
          </div>

          <div className="grid gap-3">
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4">
              <input
                type="checkbox"
                {...register('reminder24h')}
                className="mt-0.5 h-5 w-5 rounded accent-[var(--color-primary)]"
              />
              <div>
                <p className="font-semibold text-gray-800">Напомняне 24 часа по-рано</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Това е стабилен и разбираем вариант за повечето бизнеси.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4">
              <input
                type="checkbox"
                {...register('reminder2h')}
                className="mt-0.5 h-5 w-5 rounded accent-[var(--color-primary)]"
              />
              <div>
                <p className="font-semibold text-gray-800">Напомняне 2 часа по-рано</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Подходящо е като второ кратко напомняне в деня на часа.
                </p>
              </div>
            </label>
          </div>

          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
            Изпращане „в 10:00 на предния ден“ е различен scheduler. Текущият модел поддържа само offset-и спрямо часа: 24h и 2h.
          </div>

          <div className="rounded-2xl border border-gray-200 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Резервен SMS канал</p>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  Използва се само когато клиентът няма Telegram. SMS-ите са текстови и могат да съдържат линк, но не и inline бутони.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${hasSmsConfig ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {hasSmsConfig ? 'Активен' : 'Изключен'}
              </span>
            </div>
            <div className="mb-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              Ако ще ползваш SMS, регистрирай акаунт в{' '}
              <a
                href="https://www.smsapi.bg"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold underline"
              >
                smsapi.bg <ExternalLink className="h-3 w-3" />
              </a>
              .
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="SMS API Token"
                type="password"
                placeholder="Оставете празно ако не се сменя"
                {...register('smsApiKey')}
                className="font-mono"
              />
              <Input
                label="SMS Sender ID"
                placeholder="SalonIQ"
                maxLength={11}
                {...register('smsSenderId')}
              />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Шаблони за съобщения">
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
            Шаблоните са групирани по тип. Отвори само секцията, която редактираш. Напомнянията се показват само ако съответният trigger е включен.
          </div>

          <TemplateSectionTitle
            title="Клиентски flow"
            description="Основните съобщения към клиента при заявка, потвърждение и отмяна."
          />

          <TemplateAccordion
            id="booking-pending"
            label="Клиент: нова заявка"
            hint="Използва се когато резервацията чака ръчно потвърждение."
            openTemplateId={openTemplateId}
            setOpenTemplateId={setOpenTemplateId}
          >
            <TemplateEditor
              label="Клиент: нова заявка"
              hint="Използва се когато резервацията чака ръчно потвърждение."
              value={bookingPendingTemplate}
              onChange={(value) => setValue('bookingPendingTemplate', value, { shouldDirty: true })}
              preview={renderTemplatePreview(bookingPendingTemplate || DEFAULT_NOTIFICATION_TEMPLATES.bookingPending, {
                Бизнес: tenant.businessName,
                Име: 'Мария',
                ПълноИме: 'Мария Иванова',
                Телефон: '0888123456',
                Услуга: 'Подстригване',
                Специалист: 'Елена',
                Дата: '12 април',
                Час: '14:30',
                Адрес: tenant.address || 'ул. Витоша 42',
                Цена: '35 €',
                Причина: 'По преценка на салона',
              })}
            />
          </TemplateAccordion>

          <TemplateAccordion
            id="booking-confirmed"
            label="Клиент: потвърден час"
            hint="Използва се когато резервацията е вече потвърдена."
            openTemplateId={openTemplateId}
            setOpenTemplateId={setOpenTemplateId}
          >
            <TemplateEditor
              label="Клиент: потвърден час"
              hint="Използва се когато резервацията е вече потвърдена."
              value={bookingConfirmedTemplate}
              onChange={(value) => setValue('bookingConfirmedTemplate', value, { shouldDirty: true })}
              preview={renderTemplatePreview(bookingConfirmedTemplate || DEFAULT_NOTIFICATION_TEMPLATES.bookingConfirmed, {
                Бизнес: tenant.businessName,
                Име: 'Мария',
                ПълноИме: 'Мария Иванова',
                Телефон: '0888123456',
                Услуга: 'Подстригване',
                Специалист: 'Елена',
                Дата: '12 април',
                Час: '14:30',
                Адрес: tenant.address || 'ул. Витоша 42',
                Цена: '35 €',
                Причина: 'По преценка на салона',
              })}
            />
          </TemplateAccordion>

          {(reminder24h || reminder2h) && (
            <TemplateSectionTitle
              title="Напомняния"
              description="Появяват се само за активните reminder-и и не зависят от това дали използваш SMS."
            />
          )}

          {reminder24h && (
            <>
              <TemplateAccordion
                id="reminder-24h"
                label="Клиент: напомняне 24 часа"
                hint="Използва се само ако е включено напомняне 24 часа по-рано."
                openTemplateId={openTemplateId}
                setOpenTemplateId={setOpenTemplateId}
              >
                <TemplateEditor
                  label="Клиент: напомняне 24 часа"
                  hint="Използва се само ако е включено напомняне 24 часа по-рано."
                  value={reminder24hTemplate}
                  onChange={(value) => setValue('reminder24hTemplate', value, { shouldDirty: true })}
                  preview={renderTemplatePreview(reminder24hTemplate || DEFAULT_NOTIFICATION_TEMPLATES.reminder24h, {
                    Бизнес: tenant.businessName,
                    Име: 'Мария',
                    ПълноИме: 'Мария Иванова',
                    Телефон: '0888123456',
                    Услуга: 'Подстригване',
                    Специалист: 'Елена',
                    Дата: '12 април',
                    Час: '14:30',
                    Адрес: tenant.address || 'ул. Витоша 42',
                    Цена: '35 €',
                    Причина: 'По преценка на салона',
                  })}
                />
              </TemplateAccordion>
            </>
          )}

          {reminder2h && (
            <TemplateAccordion
              id="reminder-2h"
              label="Клиент: напомняне 2 часа"
              hint="Използва се само ако е включено напомняне 2 часа по-рано."
              openTemplateId={openTemplateId}
              setOpenTemplateId={setOpenTemplateId}
            >
              <TemplateEditor
                label="Клиент: напомняне 2 часа"
                hint="Използва се само ако е включено напомняне 2 часа по-рано."
                value={reminder2hTemplate}
                onChange={(value) => setValue('reminder2hTemplate', value, { shouldDirty: true })}
                preview={renderTemplatePreview(reminder2hTemplate || DEFAULT_NOTIFICATION_TEMPLATES.reminder2h, {
                  Бизнес: tenant.businessName,
                  Име: 'Мария',
                  ПълноИме: 'Мария Иванова',
                  Телефон: '0888123456',
                  Услуга: 'Подстригване',
                  Специалист: 'Елена',
                  Дата: '12 април',
                  Час: '14:30',
                  Адрес: tenant.address || 'ул. Витоша 42',
                  Цена: '35 €',
                  Причина: 'По преценка на салона',
                })}
              />
            </TemplateAccordion>
          )}

          <TemplateAccordion
            id="cancellation"
            label="Клиент: отменен час"
            hint="Използва се при отказ или отмяна."
            openTemplateId={openTemplateId}
            setOpenTemplateId={setOpenTemplateId}
          >
            <TemplateEditor
              label="Клиент: отменен час"
              hint="Използва се при отказ или отмяна."
              value={cancellationTemplate}
              onChange={(value) => setValue('cancellationTemplate', value, { shouldDirty: true })}
              preview={renderTemplatePreview(cancellationTemplate || DEFAULT_NOTIFICATION_TEMPLATES.cancellation, {
                Бизнес: tenant.businessName,
                Име: 'Мария',
                ПълноИме: 'Мария Иванова',
                Телефон: '0888123456',
                Услуга: 'Подстригване',
                Специалист: 'Елена',
                Дата: '12 април',
                Час: '14:30',
                Адрес: tenant.address || 'ул. Витоша 42',
                Цена: '35 €',
                Причина: 'Салонът няма свободен слот',
              })}
            />
          </TemplateAccordion>

          <TemplateSectionTitle
            title="Собственик"
            description="Известията, които получаваш ти при нови резервации."
          />

          <TemplateAccordion
            id="owner-booking"
            label="Собственик: нова резервация"
            hint="Известие, което получава собственикът при нов запис."
            openTemplateId={openTemplateId}
            setOpenTemplateId={setOpenTemplateId}
          >
            <TemplateEditor
              label="Собственик: нова резервация"
              hint="Известие, което получава собственикът при нов запис."
              value={ownerNewBookingTemplate}
              onChange={(value) => setValue('ownerNewBookingTemplate', value, { shouldDirty: true })}
              preview={renderTemplatePreview(ownerNewBookingTemplate || DEFAULT_NOTIFICATION_TEMPLATES.ownerNewBooking, {
                Бизнес: tenant.businessName,
                Име: 'Мария',
                ПълноИме: 'Мария Иванова',
                Телефон: '0888123456',
                Услуга: 'Подстригване',
                Специалист: 'Елена',
                Дата: '12 април',
                Час: '14:30',
                Адрес: tenant.address || 'ул. Витоша 42',
                Цена: '35 €',
                Причина: '',
              })}
            />
          </TemplateAccordion>
        </div>
      </Card>

      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}

function TemplateAccordion({
  id,
  label,
  hint,
  openTemplateId,
  setOpenTemplateId,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  openTemplateId: string | null;
  setOpenTemplateId: (id: string | null) => void;
  children: React.ReactNode;
}) {
  const open = openTemplateId === id;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpenTemplateId(open ? null : id)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="mt-1 text-xs text-gray-500">{hint}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="border-t border-gray-100 p-4">{children}</div>}
    </div>
  );
}

function TemplateSectionTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
    </div>
  );
}

function TemplateEditor({
  label,
  hint,
  value,
  onChange,
  preview,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  preview: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertToken = (token: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}${token}`);
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + token.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 p-4">
      <div className="mb-2">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {TEMPLATE_TOKENS.map((item) => (
          <button
            key={item.token}
            type="button"
            onClick={() => insertToken(item.token)}
            className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            {item.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-[var(--color-primary)]"
      />

      <div className="mt-3 rounded-2xl bg-gray-50 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Преглед</p>
        <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">{preview}</p>
      </div>
    </div>
  );
}

function BookingSettings() {
  const tenant = useTenant();
  const { updateTenant } = useTenantActions();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isDirty, isSubmitting },
  } = useForm({
    defaultValues: {
      requiresConfirmation: tenant.requiresConfirmation,
      cancellationHours: tenant.cancellationHours,
      minAdvanceBookingHours: tenant.minAdvanceBookingHours,
      maxAdvanceBookingDays: tenant.maxAdvanceBookingDays,
      allowRandomStaffSelection: tenant.allowRandomStaffSelection,
      allowClientCancellation: tenant.allowClientCancellation,
      collectClientEmail: tenant.collectClientEmail,
    },
  });

  useEffect(() => {
    reset({
      requiresConfirmation: tenant.requiresConfirmation,
      cancellationHours: tenant.cancellationHours,
      minAdvanceBookingHours: tenant.minAdvanceBookingHours,
      maxAdvanceBookingDays: tenant.maxAdvanceBookingDays,
      allowRandomStaffSelection: tenant.allowRandomStaffSelection,
      allowClientCancellation: tenant.allowClientCancellation,
      collectClientEmail: tenant.collectClientEmail,
    });
  }, [tenant, reset]);

  const allowClientCancellation = watch('allowClientCancellation');

  const onSubmit = async (values: any) => {
    const payload = {
      requiresConfirmation: Boolean(values.requiresConfirmation),
      cancellationHours: parseOptionalNumber(values.cancellationHours) ?? 0,
      minAdvanceBookingHours: parseOptionalNumber(values.minAdvanceBookingHours) ?? 0,
      maxAdvanceBookingDays: parseOptionalNumber(values.maxAdvanceBookingDays) ?? tenant.maxAdvanceBookingDays,
      allowRandomStaffSelection: Boolean(values.allowRandomStaffSelection),
      allowClientCancellation: Boolean(values.allowClientCancellation),
      collectClientEmail: Boolean(values.collectClientEmail),
    };

    try {
      await apiClient.patch('/tenants/settings/booking', payload);
      updateTenant(payload);
      reset(payload);
      toast.success('Booking правилата са запазени.');
    } catch (error: any) {
      toast.error(getBookingSettingsErrorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-28">
      <Card title="Правила за резервации">
        <div className="space-y-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
            <input
              {...register('requiresConfirmation')}
              type="checkbox"
              className="mt-0.5 h-5 w-5 rounded accent-[var(--color-primary)]"
            />
            <div>
              <p className="font-semibold text-gray-800">Изисква ръчно потвърждение</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Резервациите остават „изчаква“, докато не ги потвърдите от календара или Telegram.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
            <input
              {...register('allowRandomStaffSelection')}
              type="checkbox"
              className="mt-0.5 h-5 w-5 rounded accent-[var(--color-primary)]"
            />
            <div>
              <p className="font-semibold text-gray-800">Показвай „Без предпочитание“ за майстор</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Ако е изключено, клиентът трябва изрично да избере конкретен специалист.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
            <input
              {...register('allowClientCancellation')}
              type="checkbox"
              className="mt-0.5 h-5 w-5 rounded accent-[var(--color-primary)]"
            />
            <div>
              <p className="font-semibold text-gray-800">Позволявай клиентска отмяна</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Ако е изключено, в клиентските известия и потвърждения няма да има бутон за отмяна.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 p-4">
            <input
              {...register('collectClientEmail')}
              type="checkbox"
              className="mt-0.5 h-5 w-5 rounded accent-[var(--color-primary)]"
            />
            <div>
              <p className="font-semibold text-gray-800">Събирай email от клиенти</p>
              <p className="mt-0.5 text-sm text-gray-500">
                Ако е изключено, клиентският email не се показва и не се събира в booking и admin формите.
              </p>
            </div>
          </label>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label="Отмяна до (ч. преди)"
              type="number"
              min="0"
              max="168"
              disabled={!allowClientCancellation}
              {...register('cancellationHours')}
              hint={allowClientCancellation ? '0 = не се позволява' : 'Няма да се използва, докато опцията е изключена.'}
            />
            <Input
              label="Мин. предварително (ч.)"
              type="number"
              min="0"
              max="72"
              {...register('minAdvanceBookingHours')}
            />
            <Input
              label="Макс. напред (дни)"
              type="number"
              min="1"
              max="365"
              {...register('maxAdvanceBookingDays')}
            />
          </div>
        </div>
      </Card>
      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}

function ThemeSettings() {
  const tenant = useTenant();
  const { updateTenant } = useTenantActions();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);
  const [readingAsset, setReadingAsset] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm({
    defaultValues: {
      primaryColor: tenant.theme.primaryColor,
      secondaryColor: tenant.theme.secondaryColor,
      accentColor: tenant.theme.accentColor || tenant.theme.primaryColor,
      borderRadius: tenant.theme.borderRadius,
      surfaceStyle: tenant.theme.surfaceStyle || 'light',
      logoUrl: tenant.theme.logoUrl || '',
      coverImageUrl: tenant.theme.coverImageUrl || '',
      faviconUrl: tenant.theme.faviconUrl || '',
    },
  });

  useEffect(() => {
    reset({
      primaryColor: tenant.theme.primaryColor,
      secondaryColor: tenant.theme.secondaryColor,
      accentColor: tenant.theme.accentColor || tenant.theme.primaryColor,
      borderRadius: tenant.theme.borderRadius,
      surfaceStyle: tenant.theme.surfaceStyle || 'light',
      logoUrl: tenant.theme.logoUrl || '',
      coverImageUrl: tenant.theme.coverImageUrl || '',
      faviconUrl: tenant.theme.faviconUrl || '',
    });
  }, [tenant.theme, reset]);

  const primaryColor = watch('primaryColor');
  const secondaryColor = watch('secondaryColor');
  const accentColor = watch('accentColor');
  const borderRadius = watch('borderRadius');
  const surfaceStyle = watch('surfaceStyle');
  const logoUrl = watch('logoUrl');
  const coverImageUrl = watch('coverImageUrl');
  const faviconUrl = watch('faviconUrl');

  const selectedPreset = useMemo(
    () =>
      THEME_PRESETS.find(
        (preset) =>
          preset.primaryColor === primaryColor &&
          preset.secondaryColor === secondaryColor &&
          preset.accentColor === accentColor &&
          preset.borderRadius === borderRadius &&
          preset.surfaceStyle === surfaceStyle,
      )?.id || null,
    [accentColor, borderRadius, primaryColor, secondaryColor, surfaceStyle],
  );

  const handlePresetSelect = (preset: ThemePreset) => {
    setValue('primaryColor', preset.primaryColor, { shouldDirty: true });
    setValue('secondaryColor', preset.secondaryColor, { shouldDirty: true });
    setValue('accentColor', preset.accentColor, { shouldDirty: true });
    setValue('borderRadius', preset.borderRadius, { shouldDirty: true });
    setValue('surfaceStyle', preset.surfaceStyle, { shouldDirty: true });
  };

  const readAsset = async (file: File, field: 'logoUrl' | 'coverImageUrl' | 'faviconUrl') => {
    setReadingAsset(field);

    try {
      const result = await resizeImageForThemeAsset(file, field);
      setValue(field, result, { shouldDirty: true });
    } catch {
      toast.error('Грешка при обработка на изображението.');
    } finally {
      setReadingAsset(null);
    }
  };

  const onSubmit = async (values: any) => {
    try {
      const result = await apiClient.patch<{ updated: boolean; theme: any }>('/tenants/settings/theme', values);
      updateTenant({ theme: result.theme });
      reset({
        primaryColor: result.theme.primaryColor,
        secondaryColor: result.theme.secondaryColor,
        accentColor: result.theme.accentColor,
        borderRadius: result.theme.borderRadius,
        surfaceStyle: result.theme.surfaceStyle || 'light',
        logoUrl: result.theme.logoUrl || '',
        coverImageUrl: result.theme.coverImageUrl || '',
        faviconUrl: result.theme.faviconUrl || '',
      });
      toast.success('Обликът е запазен.');
    } catch (error: any) {
      toast.error(getApiErrorMessage(error));
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pb-28">
      <Card title="Облик">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Готови теми</label>
            <div className="grid grid-cols-2 gap-3">
              {THEME_PRESETS.map((preset) => {
                const isSelected = preset.id === selectedPreset;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetSelect(preset)}
                    className={`rounded-2xl p-3 text-left transition-all ${
                      isSelected
                        ? 'border-2 border-gray-900 bg-gray-50 shadow-md'
                        : 'border border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="mb-3 flex gap-2">
                      <span className="h-6 flex-1 rounded-xl" style={{ background: preset.primaryColor }} />
                      <span className="h-6 flex-1 rounded-xl" style={{ background: preset.secondaryColor }} />
                      <span
                        className="h-6 w-8 rounded-xl border border-white/20"
                        style={{
                          background:
                            preset.surfaceStyle === 'dark'
                              ? '#0b1020'
                              : preset.surfaceStyle === 'graphite'
                                ? '#e7ecf3'
                                : '#ffffff',
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{preset.label}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {preset.borderRadius === 'sharp'
                            ? 'Остри'
                            : preset.borderRadius === 'pill'
                              ? 'Капсула'
                              : 'Заоблени'}
                        </div>
                        <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                          {preset.surfaceStyle === 'dark'
                            ? 'Тъмна'
                            : preset.surfaceStyle === 'graphite'
                              ? 'Графит'
                              : 'Светла'}
                        </div>
                      </div>
                      {isSelected && (
                        <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                          Избрана
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AssetUpload
              label="Лого"
              value={logoUrl}
              hint="Празно = буквеният аватар остава."
              loading={readingAsset === 'logoUrl'}
              onUpload={() => logoInputRef.current?.click()}
              onClear={() => setValue('logoUrl', '', { shouldDirty: true })}
            />
            <AssetUpload
              label="Корица"
              value={coverImageUrl}
              hint="Голямата корица в клиентския портал."
              loading={readingAsset === 'coverImageUrl'}
              onUpload={() => coverInputRef.current?.click()}
              onClear={() => setValue('coverImageUrl', '', { shouldDirty: true })}
            />
            <AssetUpload
              label="Favicon"
              value={faviconUrl}
              hint="Малката иконка в таба на браузъра."
              loading={readingAsset === 'faviconUrl'}
              onUpload={() => faviconInputRef.current?.click()}
              onClear={() => setValue('faviconUrl', '', { shouldDirty: true })}
            />
          </div>

          <input type="hidden" {...register('primaryColor')} />
          <input type="hidden" {...register('secondaryColor')} />
          <input type="hidden" {...register('accentColor')} />
          <input type="hidden" {...register('borderRadius')} />
          <input type="hidden" {...register('surfaceStyle')} />
          <input type="hidden" {...register('logoUrl')} />
          <input type="hidden" {...register('coverImageUrl')} />
          <input type="hidden" {...register('faviconUrl')} />

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readAsset(file, 'logoUrl');
              e.target.value = '';
            }}
          />
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readAsset(file, 'coverImageUrl');
              e.target.value = '';
            }}
          />
          <input
            ref={faviconInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readAsset(file, 'faviconUrl');
              e.target.value = '';
            }}
          />

          <div className="rounded-xl bg-gray-50 p-4">
            <p className="mb-2 text-xs font-semibold text-gray-500">Преглед</p>
            <div
              className="rounded-3xl p-4"
              style={{
                background:
                  surfaceStyle === 'dark'
                    ? `radial-gradient(circle at top left, rgba(255,255,255,0.08), transparent 24%), linear-gradient(135deg, #0b1020, #111827 52%, ${primaryColor})`
                    : surfaceStyle === 'graphite'
                      ? `radial-gradient(circle at top left, rgba(255,255,255,0.62), transparent 28%), linear-gradient(135deg, #f8fafc, #e7ecf3 48%, ${secondaryColor})`
                      : `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
              }}
            >
              <button
                type="button"
                className="px-5 py-2.5 text-sm font-semibold text-white"
                style={{
                  borderRadius: borderRadius === 'sharp' ? 0 : borderRadius === 'pill' ? 999 : 14,
                  backgroundColor: surfaceStyle === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.18)',
                  color: surfaceStyle === 'graphite' ? '#111827' : '#fff',
                  backdropFilter: 'blur(18px)',
                  WebkitBackdropFilter: 'blur(18px)',
                }}
              >
                Запиши час
              </button>
            </div>
          </div>
        </div>
      </Card>
      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}

function AssetUpload({
  label,
  value,
  hint,
  loading,
  onUpload,
  onClear,
}: {
  label: string;
  value: string;
  hint: string;
  loading: boolean;
  onUpload: () => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="mt-1 text-xs text-gray-500">{hint}</p>
        </div>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-gray-100">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-gray-400" />
          )}
        </div>
        <button
          type="button"
          onClick={onUpload}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {value ? 'Смени файл' : 'Качи файл'}
        </button>
      </div>
    </div>
  );
}

async function resizeImageForThemeAsset(
  file: File,
  field: 'logoUrl' | 'coverImageUrl' | 'faviconUrl',
): Promise<string> {
  const imageBitmap = await loadImageBitmap(file);
  const limits =
    field === 'coverImageUrl'
      ? { maxWidth: 1280, maxHeight: 720 }
      : field === 'faviconUrl'
        ? { maxWidth: 96, maxHeight: 96 }
        : { maxWidth: 320, maxHeight: 320 };

  const ratio = Math.min(
    1,
    limits.maxWidth / imageBitmap.width,
    limits.maxHeight / imageBitmap.height,
  );

  const width = Math.max(1, Math.round(imageBitmap.width * ratio));
  const height = Math.max(1, Math.round(imageBitmap.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context unavailable');
  }

  ctx.drawImage(imageBitmap, 0, 0, width, height);

  const mimeType = field === 'faviconUrl' ? 'image/png' : 'image/webp';
  const quality = field === 'coverImageUrl' ? 0.68 : 0.76;

  return canvas.toDataURL(mimeType, quality);
}

function loadImageBitmap(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
