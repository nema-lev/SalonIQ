'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, ChevronRight, Loader2, Users, CalendarDays } from 'lucide-react';
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
  booking_mode?: 'standard' | 'group';
  slot_capacity?: number;
  group_days?: string[];
  group_time_slots?: string[];
}

interface ServicesByCategory {
  [category: string]: Service[];
}

interface StepServiceProps {
  onNext: (data: Partial<BookingFormData>) => void;
}

const GROUP_DAY_LABELS: Record<string, string> = {
  mon: 'Пон',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чет',
  fri: 'Пет',
  sat: 'Съб',
  sun: 'Нед',
};

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

  const resolvedServices = error || !services ? null : services;

  if (!resolvedServices) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Неуспешно зареждане на услугите. Моля, опитайте отново.</p>
      </div>
    );
  }

  // Групирай по категория
  const byCategory = resolvedServices.reduce<ServicesByCategory>((acc, svc) => {
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
      <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ margin: '0 0 8px', fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 900, color: 'var(--text-strong)', letterSpacing: '-0.05em' }}>
        Изберете {copy.serviceLabel}
      </h2>
      <p className="text-gray-500 mb-6" style={{ margin: '0 0 28px', fontSize: 16, lineHeight: 1.5, color: 'var(--text-soft)', maxWidth: 580 }}>
        Изберете {copy.serviceLabel}, за да продължите към свободните часове и наличните {copy.providerLabelPlural}
      </p>

      <div className="space-y-6" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {Object.entries(byCategory).map(([category, svcs]) => (
          <div key={category}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3 px-1" style={{ margin: '0 0 12px', padding: '0 4px', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--text-soft)' }}>
              {category}
            </h3>
            <div
              className="space-y-2"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 360px))',
                gap: 18,
                justifyContent: 'start',
                alignItems: 'stretch',
              }}
            >
              {svcs.map((service) => (
                <button
                  key={service.id}
                  onClick={() => handleSelect(service)}
                  className="
                    w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100
                    hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5
                    active:scale-[0.99] transition-all duration-150 text-left group
                  "
                  style={{
                    width: '100%',
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'stretch',
                    gap: 14,
                    padding: 18,
                    borderRadius: 24,
                    border: '1px solid var(--line-soft)',
                    background:
                      'var(--bg-card)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-soft)',
                    minHeight: 132,
                    position: 'relative',
                    overflow: 'hidden',
                    backdropFilter: 'blur(24px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'radial-gradient(circle at top right, rgba(255,255,255,0.65), transparent 30%)',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Цветен индикатор */}
                  <div
                    className="w-3 h-10 rounded-full flex-shrink-0"
                    style={{
                      width: 8,
                      minHeight: '100%',
                      borderRadius: 999,
                      flexShrink: 0,
                      background: `linear-gradient(180deg, ${service.color}, color-mix(in srgb, ${service.color} 72%, white))`,
                      boxShadow: `0 10px 18px color-mix(in srgb, ${service.color} 34%, transparent)`,
                    }}
                  />

                  <div className="flex-1 min-w-0" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                    <p className="font-semibold text-gray-900 group-hover:text-[var(--color-primary)] transition-colors" style={{ margin: 0, fontSize: 21, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.03em' }}>
                      {service.name}
                    </p>
                    <div style={{ minHeight: service.booking_mode === 'group' ? 56 : 46 }}>
                      {service.description ? (
                        <p className="text-sm text-gray-500 mt-0.5 truncate" style={{ margin: '10px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--text-soft)' }}>
                          {service.description}
                        </p>
                      ) : (
                        <div style={{ height: 22 }} />
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5" style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                      <span className="flex items-center gap-1 text-xs text-gray-400" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-soft)', padding: '8px 10px', borderRadius: 999, background: 'var(--surface-accent-soft)', border: '1px solid var(--line-soft)' }}>
                        <Clock className="w-3.5 h-3.5" />
                        {service.duration_minutes} мин.
                      </span>
                      {service.booking_mode === 'group' && (
                        <span className="flex items-center gap-1 text-xs text-gray-400" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-soft)', padding: '8px 10px', borderRadius: 999, background: 'var(--surface-secondary-soft)', border: '1px solid var(--line-soft)' }}>
                          <Users className="w-3.5 h-3.5" />
                          {service.slot_capacity ?? 1} места
                        </span>
                      )}
                    </div>
                    {service.booking_mode === 'group' && (
                      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                        <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-soft)' }}>
                          <CalendarDays className="w-3.5 h-3.5" />
                          {(service.group_days ?? []).map((day) => GROUP_DAY_LABELS[day] || day).join(', ') || 'Без зададени дни'}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-soft)' }}>
                          {(service.group_time_slots ?? []).join(', ') || 'Без зададени часове'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0" style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                    {service.price != null ? (
                      <p className="font-bold text-gray-900" style={{ margin: 0, fontSize: 26, fontWeight: 900, color: 'var(--text-strong)', letterSpacing: '-0.04em' }}>
                        {service.price} <span className="text-sm font-semibold text-gray-500" style={{ color: 'var(--text-soft)' }}>€</span>
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--text-soft)' }}>По договаряне</p>
                    )}
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 999,
                        background: 'var(--surface-accent-soft)',
                        border: '1px solid var(--line-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: 'auto',
                        marginTop: 8,
                      }}
                    >
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--color-primary)] ml-auto mt-1 transition-colors" style={{ margin: 0, color: 'var(--text-strong)' }} />
                    </div>
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
