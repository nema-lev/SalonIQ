export const SUBSCRIPTION_PLANS = ['BASIC', 'PRO', 'ENTERPRISE'] as const;

export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLANS)[number];

export type SubscriptionPlanProfile = {
  label: string;
  priceLabel: string;
  description: string;
  staffLimit: number | null;
  bookingLimitLabel: string;
  multiLocation: boolean;
  supportLabel: string;
};

export const PLAN_LABELS: Record<SubscriptionPlanKey, string> = {
  BASIC: 'Basic',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
};

export const PLAN_CONFIG: Record<SubscriptionPlanKey, SubscriptionPlanProfile> = {
  BASIC: {
    label: 'Basic',
    priceLabel: '29 лв/м',
    description: 'Подходящ за малък обект с един до двама специалисти и базова автоматизация.',
    staffLimit: 2,
    bookingLimitLabel: 'До 200 резервации',
    multiLocation: false,
    supportLabel: 'Стандартна поддръжка',
  },
  PRO: {
    label: 'Pro',
    priceLabel: '59 лв/м',
    description: 'Подходящ за развиващ се екип с повече специалисти и неограничени резервации.',
    staffLimit: 8,
    bookingLimitLabel: 'Неограничени резервации',
    multiLocation: false,
    supportLabel: 'Приоритетна поддръжка',
  },
  ENTERPRISE: {
    label: 'Enterprise',
    priceLabel: '99 лв/м',
    description: 'За по-големи бизнеси с неограничени специалисти и нужда от multi-location.',
    staffLimit: null,
    bookingLimitLabel: 'Неограничени резервации',
    multiLocation: true,
    supportLabel: 'Разширена поддръжка',
  },
};

export function getSubscriptionPlanConfig(plan: string | null | undefined): SubscriptionPlanProfile {
  const key = (plan || 'BASIC') as SubscriptionPlanKey;
  return PLAN_CONFIG[key] || PLAN_CONFIG.BASIC;
}
