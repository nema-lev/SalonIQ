export function normalizeBulgarianPhone(raw: string): string {
  const trimmed = `${raw || ''}`.trim();
  const cleaned = trimmed.replace(/[()\s-]+/g, '');

  if (!cleaned) return '';

  if (cleaned.startsWith('+')) {
    const digits = cleaned.slice(1).replace(/\D/g, '');
    if (digits.startsWith('359') && digits.length >= 11) {
      return `+${digits}`;
    }
    return `+${digits}`;
  }

  if (cleaned.startsWith('00')) {
    return normalizeBulgarianPhone(`+${cleaned.slice(2)}`);
  }

  const digits = cleaned.replace(/\D/g, '');

  if (digits.startsWith('08') && digits.length === 10) {
    return `+359${digits.slice(1)}`;
  }

  if (digits.startsWith('359') && digits.length >= 11) {
    return `+${digits}`;
  }

  if (digits.startsWith('9') && digits.length === 9) {
    return `+359${digits}`;
  }

  return digits ? `+${digits}` : '';
}

export function formatBulgarianPhoneForDisplay(raw: string): string {
  const normalized = normalizeBulgarianPhone(raw);
  if (/^\+359\d{9}$/.test(normalized)) {
    return `0${normalized.slice(4)}`;
  }
  return raw;
}

export function buildBulgarianPhoneVariants(raw: string): string[] {
  const normalized = normalizeBulgarianPhone(raw);
  if (!normalized) return [];

  const variants = new Set<string>([normalized]);

  if (/^\+359\d{9}$/.test(normalized)) {
    variants.add(`0${normalized.slice(4)}`);
    variants.add(normalized.slice(1));
  }

  return Array.from(variants);
}
