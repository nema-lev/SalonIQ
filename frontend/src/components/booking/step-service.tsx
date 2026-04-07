'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, ChevronRight, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy } from '@/lib/business-copy';
import type { BookingFormData } from '@/types/booking';

interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  price: number | null;
  color: string;
}

interface ServicesByCategory {
  [category: string]: Service[];
}

interface StepServiceProps {
  onNext: (data: Partial<BookingFormData>) => void;
}

export function StepService({ onNext }: StepServiceProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
  const { data: services, isLoading, error } = useQuery({
    queryKey: ['services'],
    queryFn: () => apiClient.get<Service[]>('/services'),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (error || !services) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Неуспешно зареждане на услугите. Моля, опитайте отново.</p>
      </div>
    );
  }

  // Групирай по категория
  const byCategory = services.reduce<ServicesByCategory>((acc, svc) => {
    const cat = svc.category || copy.serviceLabelPlural;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(svc);
    return acc;
  }, {});

  const handleSelect = (service: Service) => {
    onNext({
      serviceId: service.id,
      serviceName: service.name,
      serviceDuration: service.duration_minutes,
      servicePrice: service.price,
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Изберете {copy.serviceLabel}
      </h2>
      <p className="text-gray-500 mb-6">
        Изберете {copy.serviceLabel}та, за която искате да {copy.bookingAction.toLowerCase()}
      </p>

      <div className="space-y-6">
        {Object.entries(byCategory).map(([category, svcs]) => (
          <div key={category}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">
              {category}
            </h3>
            <div className="space-y-2">
              {svcs.map((service) => (
                <button
                  key={service.id}
                  onClick={() => handleSelect(service)}
                  className="
                    w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100
                    hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5
                    active:scale-[0.99] transition-all duration-150 text-left group
                  "
                >
                  {/* Цветен индикатор */}
                  <div
                    className="w-3 h-10 rounded-full flex-shrink-0"
                    style={{ backgroundColor: service.color }}
                  />

                  {/* Съдържание */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 group-hover:text-[var(--color-primary)] transition-colors">
                      {service.name}
                    </p>
                    {service.description && (
                      <p className="text-sm text-gray-500 mt-0.5 truncate">{service.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3.5 h-3.5" />
                        {service.duration_minutes} мин.
                      </span>
                    </div>
                  </div>

                  {/* Цена */}
                  <div className="text-right flex-shrink-0">
                    {service.price != null ? (
                      <p className="font-bold text-gray-900">
                        {service.price} <span className="text-sm font-normal text-gray-500">лв.</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400">По договаряне</p>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--color-primary)] ml-auto mt-1 transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
