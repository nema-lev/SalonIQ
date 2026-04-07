'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTenant } from '@/lib/tenant-context';
import { StepService } from './step-service';
import { StepStaff } from './step-staff';
import { StepDateTime } from './step-date-time';
import { StepDetails } from './step-details';
import { StepConfirmation } from './step-confirmation';
import { BookingSuccess } from './booking-success';
import type { BookingFormData } from '@/types/booking';

export type BookingStep = 'service' | 'staff' | 'datetime' | 'details' | 'confirm' | 'success';

const STEPS: BookingStep[] = ['service', 'staff', 'datetime', 'details', 'confirm'];

const STEP_LABELS: Record<BookingStep, string> = {
  service: 'Услуга',
  staff: 'Специалист',
  datetime: 'Дата & Час',
  details: 'Данни',
  confirm: 'Потвърждение',
  success: '',
};

export function BookingWizard() {
  const tenant = useTenant();
  const [step, setStep] = useState<BookingStep>('service');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [formData, setFormData] = useState<Partial<BookingFormData>>({});
  const [createdAppointment, setCreatedAppointment] = useState<{ id: string; status: string } | null>(null);

  const currentIndex = STEPS.indexOf(step);

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
    <div className="mt-8">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
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
                  style={{ width: '40px' }}
                />
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-sm font-medium text-gray-500">
          Стъпка {currentIndex + 1} от {STEPS.length} —{' '}
          <span className="text-[var(--color-primary)]">{STEP_LABELS[step]}</span>
        </p>
      </div>

      {/* Step content with slide animation */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ x: direction * 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: direction * -60, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
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
