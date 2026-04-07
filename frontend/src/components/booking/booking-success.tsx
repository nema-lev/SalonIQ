'use client';

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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {isPending ? '⏳ Заявката е изпратена!' : '✅ Резервацията е потвърдена!'}
        </h2>
        <p className="text-gray-500 mb-8 leading-relaxed">
          {isPending
            ? `Заявката Ви за ${copy.bookingLabel} в ${tenant.businessName} е получена и очаква потвърждение от нашия екип. Ще получите известяване скоро.`
            : `Резервацията Ви в ${tenant.businessName} е потвърдена. Ще получите потвърждение чрез Telegram.`
          }
        </p>

        {/* Booking summary */}
        <div className="bg-gradient-to-br from-[var(--color-primary)]/5 to-[var(--color-secondary)]/5 rounded-2xl p-5 mb-6 text-left">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Услуга</p>
              <p className="font-semibold text-gray-800 text-sm">{formData.serviceName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">
                {copy.providerLabel.charAt(0).toUpperCase() + copy.providerLabel.slice(1)}
              </p>
              <p className="font-semibold text-gray-800 text-sm">{formData.staffName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Дата</p>
              <p className="font-semibold text-gray-800 text-sm">{formData.displayDate}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Час</p>
              <p className="font-semibold text-gray-800 text-sm">{formData.timeSlot}</p>
            </div>
          </div>
        </div>

        {/* Telegram reminder info */}
        <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 mb-6 text-left">
          <MessageCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">
              Известявания чрез Telegram
            </p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Ще получите потвърждение и напомняне 24 часа преди часа.
              За да получавате съобщения, стартирайте бота в Telegram.
            </p>
            {tenant.slug && (
              <a
                href={`https://t.me/${tenant.slug}_bot?start=${formData.clientPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-blue-700
                  bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors
                "
              >
                <Bell className="w-3.5 h-3.5" />
                Активирай Telegram известявания
              </a>
            )}
          </div>
        </div>

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
          {copy.bookingAction}
        </button>
      </motion.div>
    </motion.div>
  );
}
