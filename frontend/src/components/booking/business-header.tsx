'use client';

import Image from 'next/image';
import { MapPin, Phone, Globe, ExternalLink } from 'lucide-react';
import { useTenant } from '@/lib/tenant-context';
import { formatBulgarianPhoneForDisplay } from '@/lib/phone';
import { getBusinessProfile } from '@/lib/business-copy';

export function BusinessHeader() {
  const tenant = useTenant();
  const { theme, businessName, address, city, phone, website, googleMapsUrl, showBusinessNameInPortal } = tenant;
  const profile = getBusinessProfile(tenant.businessType);
  const location = [address, city].filter(Boolean).join(', ');

  return (
    <div className="relative" style={{ position: 'relative', padding: '20px 12px 0' }}>
      <div
        className="h-48 sm:h-56 w-full relative overflow-hidden"
        style={{
          height: 260,
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 28,
          background: theme.coverImageUrl
            ? undefined
            : `
              radial-gradient(circle at top left, rgba(255,255,255,0.28), transparent 24%),
              radial-gradient(circle at bottom right, rgba(255,255,255,0.16), transparent 28%),
              linear-gradient(135deg, ${theme.primaryColor}, ${theme.secondaryColor})
            `,
          boxShadow: '0 28px 90px rgba(124,58,237,0.28)',
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
        <div
          className="absolute inset-0 bg-black/20"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(10,10,20,0.18) 0%, rgba(10,10,20,0.36) 100%)',
          }}
        />
      </div>

      <div
        className="max-w-2xl mx-auto px-4"
        style={{ maxWidth: 980, margin: '0 auto', padding: '0 4px' }}
      >
        <div
          className="relative -mt-12 mb-4 flex items-end gap-4"
          style={{
            position: 'relative',
            marginTop: -56,
            marginBottom: 12,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 16,
          }}
        >
          <div
            className="w-24 h-24 border-4 border-white shadow-lg flex-shrink-0 overflow-hidden"
            style={{
              width: 86,
              height: 86,
              borderRadius: theme.logoShape === 'circle' ? 999 : 26,
              border: '1px solid rgba(255,255,255,0.86)',
              boxShadow: '0 18px 38px rgba(15,23,42,0.18)',
              overflow: 'hidden',
              flexShrink: 0,
              background:
                theme.logoUrl
                  ? '#fff'
                  : `linear-gradient(145deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
              backdropFilter: 'blur(16px)',
            }}
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
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <span
                  className="text-3xl font-black text-white"
                  style={{ fontSize: 34, fontWeight: 900, color: '#fff' }}
                >
                  {businessName.charAt(0)}
                </span>
              </div>
            )}
          </div>

          <div
            className="pb-1"
            style={{
              paddingBottom: 4,
              flex: 1,
              minWidth: 0,
              background: 'var(--bg-card)',
              border: '1px solid var(--line-soft)',
              backdropFilter: 'blur(24px) saturate(140%)',
              WebkitBackdropFilter: 'blur(24px) saturate(140%)',
              borderRadius: 28,
              padding: '16px 18px 16px 18px',
              boxShadow: 'var(--shadow-soft)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 999,
                  background: 'color-mix(in srgb, var(--bg-card) 82%, transparent)',
                  border: '1px solid var(--line-soft)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: theme.primaryColor,
                }}
              >
                {profile.label}
              </span>
            </div>
            {theme.coverText && (
              <p
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.2rem, 3.4vw, 2rem)',
                  lineHeight: 1.1,
                  fontWeight: 900,
                  color: 'var(--text-strong)',
                  letterSpacing: '-0.04em',
                }}
              >
                {theme.coverText}
              </p>
            )}
            {showBusinessNameInPortal && (
              <h1
                className="text-2xl font-black text-gray-900 leading-tight"
                style={{
                  margin: theme.coverText ? '8px 0 0' : 0,
                  fontSize: theme.coverText ? 'clamp(1.35rem, 3.2vw, 2.2rem)' : 'clamp(2.1rem, 5vw, 3.75rem)',
                  lineHeight: 0.96,
                  fontWeight: 900,
                  color: 'var(--text-strong)',
                  letterSpacing: '-0.04em',
                }}
              >
                {businessName}
              </h1>
            )}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 10,
                marginTop: theme.coverText || showBusinessNameInPortal ? 14 : 0,
              }}
            >
              {location && (
                googleMapsUrl ? (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 999,
                      background: 'rgba(108,91,137,0.08)',
                      color: 'var(--text-soft)',
                      fontSize: 14,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                  >
                    <MapPin size={14} />
                    {location}
                    <ExternalLink size={13} />
                  </a>
                ) : (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 12px',
                      borderRadius: 999,
                      background: 'rgba(108,91,137,0.08)',
                      color: 'var(--text-soft)',
                      fontSize: 14,
                      fontWeight: 600,
                    }}
                  >
                    <MapPin size={14} />
                    {location}
                  </span>
                )
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 999,
                    background: 'rgba(124,58,237,0.1)',
                    color: theme.primaryColor,
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 700,
                  }}
                >
                  <Phone size={14} />
                  {formatBulgarianPhoneForDisplay(phone)}
                </a>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 12px',
                    borderRadius: 999,
                    background: 'color-mix(in srgb, var(--bg-card) 88%, transparent)',
                    color: 'var(--text-soft)',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <Globe size={14} />
                  Уебсайт
                </a>
              )}
            </div>
          </div>
        </div>

        <div
          className="h-1 rounded-full mb-0"
          style={{
            height: 10,
            borderRadius: 999,
            marginBottom: 0,
            background: `linear-gradient(90deg, ${theme.primaryColor}, ${theme.secondaryColor})`,
            opacity: 0.9,
            boxShadow: `0 10px 32px color-mix(in srgb, ${theme.primaryColor} 28%, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
