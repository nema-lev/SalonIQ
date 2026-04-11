'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { StepService } from './step-service';
import { StepStaff } from './step-staff';
import { StepDateTime } from './step-date-time';
import { StepDetails } from './step-details';
import { StepConfirmation } from './step-confirmation';
import { BookingSuccess } from './booking-success';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import type { BookingFormData } from '@/types/booking';

export type BookingStep = 'service' | 'staff' | 'datetime' | 'details' | 'confirm' | 'success';

const STEPS: BookingStep[] = ['service', 'staff', 'datetime', 'details', 'confirm'];

export function BookingWizard() {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
  const [step, setStep] = useState<BookingStep>('service');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [formData, setFormData] = useState<Partial<BookingFormData>>({});
  const [createdAppointment, setCreatedAppointment] = useState<{ id: string; status: string } | null>(null);

  const currentIndex = STEPS.indexOf(step);
  const stepLabels: Record<BookingStep, string> = {
    service: copy.serviceLabel.charAt(0).toUpperCase() + copy.serviceLabel.slice(1),
    staff: copy.providerLabel.charAt(0).toUpperCase() + copy.providerLabel.slice(1),
    datetime: 'Дата и час',
    details: 'Данни за контакт',
    confirm: 'Потвърждение',
    success: '',
  };

  const goNext = (data: Partial<BookingFormData>) => {
    setFormData((prev) => ({ ...prev, ...data }));
    setDirection(1);
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) {
      setStep(STEPS[nextIndex]);
    }
  };

  const goBack = () => {
    setDirection(-1);
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setStep(STEPS[prevIndex]);
    }
  };

  const handleSuccess = (appointment: { id: string; status: string }) => {
    setCreatedAppointment(appointment);
    setStep('success');
  };

  if (step === 'success' && createdAppointment) {
    return (
      <BookingSuccess
        appointment={createdAppointment}
        formData={formData as BookingFormData}
        onNewBooking={() => {
          setFormData({});
          setStep('service');
          setCreatedAppointment(null);
        }}
      />
    );
  }

  return (
    <div className="mt-8" style={{ marginTop: 28 }}>
      <div
        className="mb-8"
        style={{
          marginBottom: 28,
          padding: '18px 14px 14px',
          borderRadius: 26,
          background: 'var(--bg-card)',
          border: '1px solid var(--line-soft)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          boxShadow: 'var(--shadow-soft)',
        }}
      >
        <div
          className="flex items-center justify-between mb-3"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            gap: 6,
          }}
        >
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center" style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold
                  transition-all duration-300
                  ${i < currentIndex
                    ? 'bg-[var(--color-primary)] text-white'
                    : i === currentIndex
                    ? 'bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20'
                    : 'bg-gray-100 text-gray-400'
                  }
                `}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  fontSize: 13,
                  fontWeight: 700,
                  color: i <= currentIndex ? '#fff' : 'var(--text-soft)',
                  background: i <= currentIndex ? 'var(--color-primary)' : 'rgba(108,91,137,0.1)',
                  flexShrink: 0,
                  boxShadow: i === currentIndex ? '0 10px 26px rgba(124,58,237,0.24)' : 'none',
                }}
              >
                {i < currentIndex ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`
                    h-0.5 flex-1 mx-1 transition-all duration-500
                    ${i < currentIndex ? 'bg-[var(--color-primary)]' : 'bg-gray-200'}
                  `}
                  style={{ width: '100%', height: 4, borderRadius: 999, background: i < currentIndex ? 'var(--color-primary)' : '#e5e7eb', margin: '0 8px' }}
                />
              )}
            </div>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <p
            className="text-center text-sm font-medium text-gray-500"
            style={{ textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--text-soft)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em' }}
          >
            Стъпка {currentIndex + 1} от {STEPS.length}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--text-strong)',
              letterSpacing: '-0.03em',
            }}
          >
            {stepLabels[step]}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ x: direction * 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction * -60, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          style={{
            borderRadius: 30,
          }}
        >
          {step === 'service' && (
            <StepService onNext={goNext} />
          )}
          {step === 'staff' && (
            <StepStaff
              serviceId={formData.serviceId!}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 'datetime' && (
            <StepDateTime
              serviceId={formData.serviceId!}
              staffId={formData.staffId!}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 'details' && (
            <StepDetails
              formData={formData}
              onNext={goNext}
              onBack={goBack}
            />
          )}
          {step === 'confirm' && (
            <StepConfirmation
              formData={formData as BookingFormData}
              onBack={goBack}
              onSuccess={handleSuccess}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
