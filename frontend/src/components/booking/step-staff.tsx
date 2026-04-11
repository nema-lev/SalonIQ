'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, User, Loader2, Shuffle } from 'lucide-react';
import Image from 'next/image';
import { apiClient } from '@/lib/api-client';
import { useTenant } from '@/lib/tenant-context';
import { getBusinessCopy, getBusinessProfile } from '@/lib/business-copy';
import type { BookingFormData, StaffMember } from '@/types/booking';

interface StepStaffProps {
  serviceId: string;
  onNext: (data: Partial<BookingFormData>) => void;
  onBack: () => void;
}

export function StepStaff({ serviceId, onNext, onBack }: StepStaffProps) {
  const tenant = useTenant();
  const copy = getBusinessCopy(tenant.businessType);
  const profile = getBusinessProfile(tenant.businessType);
  const autoSkippedRef = useRef(false);
  const allowsAutoAssign =
    tenant.allowRandomStaffSelection && profile.operations.staffSelection === 'optional';
  const { data: staffList, isLoading, error } = useQuery({
    queryKey: ['staff', serviceId],
    queryFn: () => apiClient.get<StaffMember[]>('/staff', { serviceId }),
    staleTime: 5 * 60 * 1000,
  });
  const resolvedStaff = error || !staffList || staffList.length === 0 ? [] : staffList;

  useEffect(() => {
    if (
      tenant.businessType === 'GROUP_TRAINING' &&
      resolvedStaff.length === 1 &&
      !autoSkippedRef.current
    ) {
      autoSkippedRef.current = true;
      onNext({ staffId: resolvedStaff[0].id, staffName: resolvedStaff[0].name });
    }
  }, [onNext, resolvedStaff, tenant.businessType]);

  const handleSelect = (member: StaffMember | null) => {
    if (!member && resolvedStaff?.length) {
      // "Без предпочитание" — избери случаен
      const random = resolvedStaff[Math.floor(Math.random() * resolvedStaff.length)];
      onNext({ staffId: random.id, staffName: 'Без предпочитание' });
      return;
    }
    if (member) {
      onNext({ staffId: member.id, staffName: member.name });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Назад
      </button>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Изберете {copy.providerLabel}
      </h2>
      <p className="text-gray-500 mb-6">
        {resolvedStaff?.length
          ? profile.operations.staffSelection === 'required'
            ? `За този тип бизнес е нужен конкретен ${copy.providerLabel}.`
            : allowsAutoAssign
              ? `Изберете предпочитан ${copy.providerLabel} или оставете системата да разпредели автоматично.`
              : `Изберете предпочитан ${copy.providerLabel}.`
          : `Зареждане на ${copy.providerLabelPlural}...`}
      </p>

      <div className="space-y-3">
        {allowsAutoAssign && (
          <button
            onClick={() => handleSelect(null)}
            className="
              w-full flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-gray-200
              hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5
              active:scale-[0.99] transition-all duration-150 text-left group
            "
          >
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
              <Shuffle className="w-5 h-5 text-gray-400 group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-700 group-hover:text-[var(--color-primary)] transition-colors">
                Без предпочитание
              </p>
              <p className="text-sm text-gray-400">
                Системата ще избере {copy.providerAutoAssignLabel}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
          </button>
        )}

        {/* Списък специалисти */}
        {resolvedStaff?.map((member) => (
          <button
            key={member.id}
            onClick={() => handleSelect(member)}
            className="
              w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100
              hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5
              active:scale-[0.99] transition-all duration-150 text-left group
            "
          >
            {/* Аватар */}
            <div className="relative w-12 h-12 flex-shrink-0">
              {member.avatar_url ? (
                <Image
                  src={member.avatar_url}
                  alt={member.name}
                  fill
                  className="rounded-full object-cover"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: member.color }}
                >
                  {member.name.charAt(0)}
                </div>
              )}
            </div>

            {/* Информация */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 group-hover:text-[var(--color-primary)] transition-colors">
                {member.name}
              </p>
              {member.bio && (
                <p className="text-sm text-gray-500 mt-0.5 truncate">{member.bio}</p>
              )}
              {member.specialties?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {member.specialties.slice(0, 3).map((s) => (
                    <span
                      key={s}
                      className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[var(--color-primary)] transition-colors flex-shrink-0" />
          </button>
        ))}

        {!resolvedStaff?.length && !isLoading && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
            В момента няма налични {copy.providerLabelPlural}. Опитайте отново след малко.
          </div>
        )}
      </div>
    </div>
  );
}
