'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Save, Bot, Clock, Shield, Palette, Loader2, ExternalLink, Copy } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { apiClient } from '@/lib/api-client';

type Tab = 'general' | 'notifications' | 'booking' | 'theme';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const tenant = useTenant();

  const TABS = [
    { id: 'general' as Tab, label: 'Основни', icon: Shield },
    { id: 'notifications' as Tab, label: 'Известявания', icon: Bot },
    { id: 'booking' as Tab, label: 'Резервации', icon: Clock },
    { id: 'theme' as Tab, label: 'Облик', icon: Palette },
  ];

  return (
    <div className="max-w-3xl">
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {activeTab === 'general'       && <GeneralSettings tenant={tenant} />}
      {activeTab === 'notifications' && <NotificationSettings tenant={tenant} />}
      {activeTab === 'booking'       && <BookingSettings tenant={tenant} />}
      {activeTab === 'theme'         && <ThemeSettings tenant={tenant} />}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      <h3 className="font-bold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function SaveBtn({ isDirty, isSubmitting }: { isDirty: boolean; isSubmitting: boolean }) {
  return (
    <button type="submit" disabled={!isDirty || isSubmitting}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
    >
      {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
      {isSubmitting ? 'Запазване...' : 'Запази'}
    </button>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const { label, hint, ...rest } = props;
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <input {...rest} className={`w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors text-sm ${rest.className || ''}`} />
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function GeneralSettings({ tenant }: { tenant: any }) {
  const { register, handleSubmit, formState: { isDirty, isSubmitting } } = useForm({
    defaultValues: { businessName: tenant.businessName, description: tenant.description || '', address: tenant.address || '', city: tenant.city || '', phone: tenant.phone || '', email: tenant.email || '' },
  });
  const onSubmit = async (data: any) => {
    try { await apiClient.patch('/tenants/settings/general', data); toast.success('Запазено!'); }
    catch { toast.error('Грешка при запазване.'); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card title="Информация за бизнеса">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input label="Наименование" {...register('businessName')} /></div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Описание</label>
            <textarea {...register('description')} rows={3} className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors text-sm resize-none" />
          </div>
          <Input label="Адрес" {...register('address')} />
          <Input label="Град" {...register('city')} />
          <Input label="Телефон" type="tel" {...register('phone')} />
          <Input label="Email" type="email" {...register('email')} />
        </div>
      </Card>
      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}

function NotificationSettings({ tenant }: { tenant: any }) {
  const { register, handleSubmit, formState: { isDirty, isSubmitting } } = useForm({
    defaultValues: { telegramBotToken: '', telegramChatId: '', smsApiKey: '', smsSenderId: '' },
  });
  const webhookUrl = `https://saloniq.bg/api/v1/webhooks/telegram/${tenant.slug}`;
  const onSubmit = async (data: any) => {
    try {
      const payload = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== ''));
      await apiClient.patch('/tenants/settings/notifications', payload);
      toast.success('Запазено!');
    } catch { toast.error('Грешка при запазване.'); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card title="Telegram Bot">
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 rounded-xl text-sm text-blue-700 leading-relaxed">
            1. Отворете <strong>@BotFather</strong> → /newbot<br />
            2. Копирайте Bot Token по-долу<br />
            3. Задайте webhook URL (копирайте линка)
          </div>
          <Input label="Bot Token (оставете празно ако не се сменя)" type="password" placeholder="7123456789:AAxxxxx..." {...register('telegramBotToken')} className="font-mono" />
          <Input label="Chat ID на собственика" placeholder="123456789" {...register('telegramChatId')} hint="Пишете /start на бота, после проверете getUpdates" />
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="text-xs font-semibold text-gray-600 mb-1.5">Webhook URL:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-700 flex-1 break-all">{webhookUrl}</code>
              <button type="button" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success('Копирано!'); }}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex-shrink-0">
                <Copy className="w-3 h-3" /> Копирай
              </button>
            </div>
          </div>
        </div>
      </Card>
      <Card title="SMS — smsapi.bg (резервен канал)">
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 rounded-xl text-sm text-amber-700">
            SMS се изпраща автоматично когато клиентът няма Telegram. Регистрирайте се на{' '}
            <a href="https://www.smsapi.bg" target="_blank" rel="noopener noreferrer" className="font-semibold underline inline-flex items-center gap-1">smsapi.bg <ExternalLink className="w-3 h-3" /></a>
          </div>
          <Input label="API Token" type="password" placeholder="Оставете празно ако не се сменя" {...register('smsApiKey')} className="font-mono" />
          <Input label="Sender ID (до 11 символа, латиница)" placeholder="SalonIQ" maxLength={11} {...register('smsSenderId')} />
        </div>
      </Card>
      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}

function BookingSettings({ tenant }: { tenant: any }) {
  const { register, handleSubmit, formState: { isDirty, isSubmitting } } = useForm({
    defaultValues: {
      requiresConfirmation: tenant.requiresConfirmation,
      cancellationHours: tenant.cancellationHours,
      minAdvanceBookingHours: tenant.minAdvanceBookingHours,
      maxAdvanceBookingDays: tenant.maxAdvanceBookingDays,
    },
  });
  const onSubmit = async (data: any) => {
    try {
      await apiClient.patch('/tenants/settings/booking', { ...data, cancellationHours: +data.cancellationHours, minAdvanceBookingHours: +data.minAdvanceBookingHours, maxAdvanceBookingDays: +data.maxAdvanceBookingDays });
      toast.success('Запазено!');
    } catch { toast.error('Грешка при запазване.'); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card title="Правила за резервации">
        <div className="space-y-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input {...register('requiresConfirmation')} type="checkbox" className="w-5 h-5 mt-0.5 rounded accent-[var(--color-primary)]" />
            <div>
              <p className="font-semibold text-gray-800">Изисква ручно потвърждение</p>
              <p className="text-sm text-gray-500 mt-0.5">Резервациите остават "изчаква" докато не ги потвърдите. Получавате Telegram известяване с бутони.</p>
            </div>
          </label>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Отмяна до (ч. преди)" type="number" min="0" max="168" {...register('cancellationHours')} hint="0 = не се позволява" />
            <Input label="Мин. предварително (ч.)" type="number" min="0" max="72" {...register('minAdvanceBookingHours')} />
            <Input label="Макс. напред (дни)" type="number" min="1" max="365" {...register('maxAdvanceBookingDays')} />
          </div>
        </div>
      </Card>
      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}

function ThemeSettings({ tenant }: { tenant: any }) {
  const { register, handleSubmit, watch, formState: { isDirty, isSubmitting } } = useForm({
    defaultValues: { primaryColor: tenant.theme.primaryColor, secondaryColor: tenant.theme.secondaryColor, borderRadius: tenant.theme.borderRadius },
  });
  const primaryColor = watch('primaryColor');
  const onSubmit = async (data: any) => {
    try { await apiClient.patch('/tenants/settings/theme', data); toast.success('Темата е запазена! Презаредете страницата.'); }
    catch { toast.error('Грешка при запазване.'); }
  };
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <Card title="Цветова схема">
        <div className="space-y-5">
          <div className="flex gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Основен цвят</label>
              <div className="flex items-center gap-2">
                <input {...register('primaryColor')} type="color" className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer" />
                <input {...register('primaryColor')} type="text" className="w-28 px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Вторичен цвят</label>
              <div className="flex items-center gap-2">
                <input {...register('secondaryColor')} type="color" className="w-12 h-10 rounded-lg border border-gray-200 cursor-pointer" />
                <input {...register('secondaryColor')} type="text" className="w-28 px-3 py-2 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm font-mono" />
              </div>
            </div>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="text-xs font-semibold text-gray-500 mb-2">Преглед:</p>
            <button type="button" className="px-5 py-2.5 rounded-xl text-white font-semibold text-sm" style={{ backgroundColor: primaryColor }}>
              Запиши час
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Ъгли на елементите</label>
            <select {...register('borderRadius')} className="w-full px-4 py-2.5 rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none text-sm">
              <option value="sharp">Остри</option>
              <option value="rounded">Заоблени (препоръчано)</option>
              <option value="pill">Капсула</option>
            </select>
          </div>
        </div>
      </Card>
      <SaveBtn isDirty={isDirty} isSubmitting={isSubmitting} />
    </form>
  );
}
