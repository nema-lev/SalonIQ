'use client';

import Image from 'next/image';
import { MapPin, Phone, Globe } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';

export function BusinessHeader() {
  const tenant = useTenant();
  const { theme, businessName, address, city, phone, website } = tenant;

  return (
    <div className="relative">
      {/* Cover image или gradient */}
      <div
        className="h-48 sm:h-56 w-full relative overflow-hidden"
        style={{
          background: theme.coverImageUrl
            ? undefined
            : `linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
        }}
      >
        {theme.coverImageUrl && (
          <Image
            src={theme.coverImageUrl}
            alt={businessName}
            fill
            className="object-cover"
            priority
          />
        )}
        {/* Overlay за четимост */}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Logo + info */}
      <div className="max-w-2xl mx-auto px-4">
        <div className="relative -mt-12 mb-4 flex items-end gap-4">
          {/* Logo */}
          <div
            className="w-24 h-24 rounded-2xl border-4 border-white shadow-lg flex-shrink-0 overflow-hidden"
            style={{ backgroundColor: theme.primaryColor }}
          >
            {theme.logoUrl ? (
              <Image
                src={theme.logoUrl}
                alt={`${businessName} лого`}
                width={96}
                height={96}
                className="object-cover w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <span className="text-3xl font-black text-white">
                  {businessName.charAt(0)}
                </span>
              </div>
            )}
          </div>

          {/* Бизнес информация */}
          <div className="pb-1">
            <h1 className="text-2xl font-black text-gray-900 leading-tight">
              {businessName}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              {(address || city) && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="w-3.5 h-3.5" />
                  {[address, city].filter(Boolean).join(', ')}
                </span>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
                >
                  <Phone className="w-3.5 h-3.5" />
                  {phone}
                </a>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-gray-500 hover:text-[var(--color-primary)]"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Уебсайт
                </a>
              )}
            </div>
          </div>
        </div>

        {/* CTA separator */}
        <div
          className="h-1 rounded-full mb-0"
          style={{
            background: `linear-gradient(90deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
          }}
        />
      </div>
    </div>
  );
}
