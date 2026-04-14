'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Bell, Calendar, MessageCircle } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import type { BookingFormData } from '@/types/booking';

interface BookingSuccessProps {
  appointment: { id: string; status: string };
  formData: BookingFormData;
  onNewBooking: () => void;
}

export function BookingSuccess({ appointment, formData, onNewBooking }: BookingSuccessProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
  const isPending = appointment.status === 'pending';
  const [telegramBotLink, setTelegramBotLink] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const reminderText =
    tenant.reminderHours.length > 0
      ? tenant.reminderHours
          .slice()
          .sort((a, b) => b - a)
          .map((hours) => `${hours} ${hours === 1 ? 'час' : 'часа'}`)
          .join(' и ')
      : null;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = `saloniq_recent_phones_${tenant.slug}`;
    try {
      const existing = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
      const normalized = String(formData.clientPhone || '');
      const next = [
        normalized,
        ...(Array.isArray(existing) ? existing.filter((value) => value !== normalized) : []),
      ].slice(0, 5);
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore device cache failures
    }
  }, [formData.clientPhone, tenant.slug]);

  useEffect(() => {
    if (!tenant.enableTelegramNotifications) {
      setTelegramBotLink(null);
      setTelegramLinked(false);
      return;
    }

    let mounted = true;

    fetch('/api/v1/tenants/telegram/client-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantSlug: tenant.slug,
        clientPhone: formData.clientPhone,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        return response.json() as Promise<{
          success?: boolean;
          data?: { botLink?: string; linkedChatId?: string | null };
          botLink?: string;
          linkedChatId?: string | null;
        }>;
      })
      .then((data) => {
        if (!mounted) return;
        const payload = data?.data ?? data;
        setTelegramBotLink(payload?.botLink || null);
        setTelegramLinked(Boolean(payload?.linkedChatId));
      })
      .catch(() => {
        if (!mounted) return;
        setTelegramBotLink(null);
        setTelegramLinked(false);
      });

    return () => {
      mounted = false;
    };
  }, [formData.clientPhone, tenant.enableTelegramNotifications, tenant.slug]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="text-center py-8"
    >
      {/* Success icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 15 }}
        className="flex justify-center mb-6"
      >
        <div className="w-24 h-24 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center">
          <CheckCircle2 className="w-14 h-14 text-[var(--color-primary)]" />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-strong)' }}>
          {isPending ? '⏳ Заявката е изпратена!' : '✅ Резервацията е потвърдена!'}
        </h2>
        <p className="mb-8 leading-relaxed" style={{ color: 'var(--text-soft)' }}>
          {isPending
            ? `Заявката Ви за ${copy.bookingLabel} в ${tenant.businessName} е получена и очаква потвърждение от нашия екип. Ще получите известяване скоро.`
            : `${copy.bookingLabel.charAt(0).toUpperCase() + copy.bookingLabel.slice(1)}ът Ви в ${tenant.businessName} е потвърден. Ще получите потвърждение чрез Telegram.`
          }
        </p>

        {/* Booking summary */}
        <div className="rounded-2xl p-5 mb-6 text-left" style={{ background: 'linear-gradient(135deg, var(--surface-accent-soft), var(--surface-secondary-soft))', border: '1px solid var(--line-soft)' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-soft)' }}>{copy.serviceLabel.charAt(0).toUpperCase() + copy.serviceLabel.slice(1)}</p>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>{formData.serviceName}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-soft)' }}>
                {copy.providerLabel.charAt(0).toUpperCase() + copy.providerLabel.slice(1)}
              </p>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>{formData.staffName}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-soft)' }}>Дата</p>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>{formData.displayDate}</p>
            </div>
            <div>
              <p className="text-xs mb-0.5" style={{ color: 'var(--text-soft)' }}>Час</p>
              <p className="font-semibold text-sm" style={{ color: 'var(--text-strong)' }}>{formData.timeSlot}</p>
            </div>
          </div>
        </div>

        {(tenant.enableTelegramNotifications || tenant.enableSmsNotifications) && (
          <div className="space-y-3 mb-6 text-left">
            {tenant.enableTelegramNotifications && (
              <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4">
                <MessageCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800 mb-1">
                    Известявания чрез Telegram
                  </p>
                  <p className="text-xs text-blue-600 leading-relaxed">
                    {telegramLinked
                      ? `Telegram вече е активен за този номер. Потвърждението${reminderText ? ` и напомнянията ${reminderText} преди часа` : ''} ще идват там.`
                      : `Ще получите потвърждение${reminderText ? ` и напомняне ${reminderText} преди часа` : ''}. За да идват в Telegram, трябва да стартирате бота.`}
                  </p>
                  {!telegramLinked && telegramBotLink && (
                    <a
                      href={telegramBotLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="
                        inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-blue-700
                        bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors
                      "
                    >
                      <Bell className="w-3.5 h-3.5" />
                      Отвори бота и натисни Start
                    </a>
                  )}
                </div>
              </div>
            )}

            {tenant.enableSmsNotifications && (
              <div className="flex items-start gap-3 bg-amber-50 rounded-xl p-4">
                <Bell className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 mb-1">
                    Резервни SMS известия
                  </p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Ако за този номер няма свързан Telegram чат, системата може да използва SMS като резервен канал.
                    {tenant.enableTelegramNotifications ? ' Приоритетът е Telegram.' : ''}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* New booking button */}
        <button
          onClick={onNewBooking}
          className="
            flex items-center gap-2 mx-auto px-6 py-3 rounded-xl
            border-2 border-[var(--color-primary)] text-[var(--color-primary)]
            hover:bg-[var(--color-primary)] hover:text-white
            font-semibold transition-all duration-150
          "
        >
          <Calendar className="w-4 h-4" />
          Нова резервация
        </button>
      </motion.div>
    </motion.div>
  );
}
