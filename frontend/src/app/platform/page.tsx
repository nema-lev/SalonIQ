'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, LogOut, ShieldOff, UserCog } from 'lucide-react';
import { apiClient, setAuthToken, setTenantSlug } from '@/lib/api-client';
import { BUSINESS_TYPES, BUSINESS_TYPE_LABELS, getBusinessTypeConfig, type BusinessTypeKey } from '@/lib/business-config';
import { PLAN_LABELS, SUBSCRIPTION_PLANS, getSubscriptionPlanConfig, type SubscriptionPlanKey } from '@/lib/plan-config';

type TenantCard = {
  id: string;
  slug: string;
  businessName: string;
  businessType: string;
  plan: string;
  planStatus: string;
  planRenewsAt: string | null;
  isActive: boolean;
  owner: { name: string | null; email: string | null };
  poweredByText: string;
  summary: {
    services: number;
    staff: number;
    clients: number;
    appointments: number;
    pending: number;
    nextAppointmentAt: string | null;
  };
  access: { blocked: boolean; reason: 'unpaid' | 'suspended' | null };
};

const PLAN_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED'] as const;

export default function PlatformDashboardPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, { businessType: string; plan: string; planStatus: string; planRenewsAt: string; isActive: boolean; tempPassword: string; poweredByText: string }>>({});
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'attention' | 'dueSoon' | 'blocked' | 'healthy'>('all');
  const [businessTypeFilter, setBusinessTypeFilter] = useState<'ALL' | BusinessTypeKey>('ALL');
  const [planFilter, setPlanFilter] = useState<'ALL' | SubscriptionPlanKey>('ALL');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => apiClient.get<TenantCard[]>('/platform/tenants'),
  });

  const tenants = data ?? [];

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { businessType: string; plan: string; planStatus: string; planRenewsAt: string | null; isActive: boolean; poweredByText: string } }) =>
      apiClient.patch(`/platform/tenants/${id}`, payload),
    onSuccess: () => {
      toast.success('Бизнесът е обновен.');
      qc.invalidateQueries({ queryKey: ['platform-tenants'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Грешка при запазване.');
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.post<{ accessToken: string; owner: { tenantSlug?: string } }>('/platform/tenants/' + tenantId + '/impersonate', {}),
    onSuccess: (data) => {
      setAuthToken(data.accessToken);
      if (data.owner.tenantSlug) {
        setTenantSlug(data.owner.tenantSlug);
      }
      router.push('/admin');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Неуспешно влизане като owner.');
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: ({ tenantId, newPassword }: { tenantId: string; newPassword: string }) =>
      apiClient.post(`/platform/tenants/${tenantId}/reset-owner-password`, { newPassword }),
    onSuccess: () => {
      toast.success('Временната парола е зададена.');
      qc.invalidateQueries({ queryKey: ['platform-tenants'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Неуспешна смяна на паролата.');
    },
  });

  const tenantCards = useMemo(() => {
    return tenants.map((tenant) => {
      const renewsAt = tenant.planRenewsAt ? new Date(tenant.planRenewsAt) : null;
      const planProfile = getSubscriptionPlanConfig(tenant.plan as SubscriptionPlanKey);
      const daysUntilRenewal = renewsAt
        ? Math.ceil((renewsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const dueSoon = daysUntilRenewal !== null && daysUntilRenewal >= 0 && daysUntilRenewal <= 7;
      const overdue = daysUntilRenewal !== null && daysUntilRenewal < 0;
      const overStaffLimit =
        planProfile.staffLimit !== null && tenant.summary.staff > planProfile.staffLimit;
      const attention =
        tenant.access.blocked ||
        dueSoon ||
        overdue ||
        overStaffLimit ||
        tenant.summary.pending > 0 ||
        tenant.planStatus === 'PAST_DUE' ||
        tenant.planStatus === 'CANCELLED';

      return {
        tenant,
        planProfile,
        renewsAt,
        daysUntilRenewal,
        dueSoon,
        overdue,
        overStaffLimit,
        attention,
      };
    });
  }, [tenants]);

  const filteredTenantCards = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tenantCards
      .filter(({ tenant, attention, dueSoon }) => {
        if (businessTypeFilter !== 'ALL' && tenant.businessType !== businessTypeFilter) {
          return false;
        }

        if (planFilter !== 'ALL' && tenant.plan !== planFilter) {
          return false;
        }

        if (statusFilter === 'attention' && !attention) {
          return false;
        }

        if (statusFilter === 'dueSoon' && !dueSoon) {
          return false;
        }

        if (statusFilter === 'blocked' && !tenant.access.blocked) {
          return false;
        }

        if (statusFilter === 'healthy' && (attention || tenant.access.blocked)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        return [
          tenant.businessName,
          tenant.slug,
          tenant.owner.name || '',
          tenant.owner.email || '',
          BUSINESS_TYPE_LABELS[(tenant.businessType as BusinessTypeKey) || 'OTHER'] || tenant.businessType,
          PLAN_LABELS[(tenant.plan as SubscriptionPlanKey) || 'BASIC'] || tenant.plan,
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        const attentionDelta = Number(b.attention) - Number(a.attention);
        if (attentionDelta !== 0) return attentionDelta;

        const pendingDelta = b.tenant.summary.pending - a.tenant.summary.pending;
        if (pendingDelta !== 0) return pendingDelta;

        const renewalA = a.renewsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const renewalB = b.renewsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (renewalA !== renewalB) return renewalA - renewalB;

        return a.tenant.businessName.localeCompare(b.tenant.businessName, 'bg');
      });
  }, [businessTypeFilter, planFilter, query, statusFilter, tenantCards]);

  const totals = useMemo(() => {
    return tenantCards.reduce(
      (acc, card) => {
        acc.tenants += 1;
        acc.blocked += card.tenant.access.blocked ? 1 : 0;
        acc.pending += card.tenant.summary.pending;
        acc.dueSoon += card.dueSoon ? 1 : 0;
        acc.unpaid += card.overdue || card.tenant.planStatus === 'PAST_DUE' || card.tenant.planStatus === 'CANCELLED' ? 1 : 0;
        acc.overStaffLimit += card.overStaffLimit ? 1 : 0;
        return acc;
      },
      { tenants: 0, blocked: 0, pending: 0, dueSoon: 0, unpaid: 0, overStaffLimit: 0 },
    );
  }, [tenantCards]);

  const updateDraft = (tenant: TenantCard, patch: Partial<{ businessType: string; plan: string; planStatus: string; planRenewsAt: string; isActive: boolean; tempPassword: string; poweredByText: string }>) => {
    setDrafts((current) => ({
      ...current,
      [tenant.id]: {
        businessType: current[tenant.id]?.businessType ?? tenant.businessType,
        plan: current[tenant.id]?.plan ?? tenant.plan,
        planStatus: current[tenant.id]?.planStatus ?? tenant.planStatus,
        planRenewsAt: current[tenant.id]?.planRenewsAt ?? (tenant.planRenewsAt ? tenant.planRenewsAt.slice(0, 10) : ''),
        isActive: current[tenant.id]?.isActive ?? tenant.isActive,
        tempPassword: current[tenant.id]?.tempPassword ?? '',
        poweredByText: current[tenant.id]?.poweredByText ?? tenant.poweredByText,
        ...patch,
      },
    }));
  };

  const signOut = () => {
    localStorage.removeItem('saloniq_platform_token');
    router.replace('/platform/login');
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f6fb' }}>
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
      </div>
    );
  }

  if (isError) {
    const message =
      typeof (error as any)?.response?.data?.message === 'string'
        ? (error as any).response.data.message
        : 'Неуспешно зареждане на бизнесите.';

    return (
      <div style={{ minHeight: '100vh', background: '#f5f6fb', padding: 20 }}>
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 24, padding: 24, boxShadow: '0 18px 42px rgba(15,23,42,0.06)' }}>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#111827', letterSpacing: '-0.04em' }}>Platform Admin</h1>
            <p style={{ margin: '12px 0 0', color: '#dc2626', fontWeight: 700 }}>{message}</p>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              Това вече не е login екранът. Проблемът е в зареждането на списъка с бизнеси от backend-а.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fb', padding: 20 }}>
      <div style={{ maxWidth: 1320, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900, color: '#111827', letterSpacing: '-0.04em' }}>Platform Admin</h1>
            <p style={{ margin: '8px 0 0', color: '#6b7280' }}>
              Бизнеси: {totals.tenants} · Блокирани: {totals.blocked} · Плащане скоро: {totals.dueSoon} · Чакащи заявки: {totals.pending} · Над staff лимит: {totals.overStaffLimit}
            </p>
          </div>
          <button
            type="button"
            onClick={signOut}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderRadius: 14, border: '1px solid #e5e7eb', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            <LogOut className="h-4 w-4" />
            Изход
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <DashboardKpi label="Всички бизнеси" value={String(totals.tenants)} tone="neutral" />
          <DashboardKpi label="Блокирани" value={String(totals.blocked)} tone={totals.blocked ? 'danger' : 'neutral'} />
          <DashboardKpi label="Плащане до 7 дни" value={String(totals.dueSoon)} tone={totals.dueSoon ? 'warning' : 'neutral'} />
          <DashboardKpi label="Неплатени / overdue" value={String(totals.unpaid)} tone={totals.unpaid ? 'danger' : 'neutral'} />
          <DashboardKpi label="Чакащи заявки" value={String(totals.pending)} tone={totals.pending ? 'warning' : 'neutral'} />
          <DashboardKpi label="Над staff лимит" value={String(totals.overStaffLimit)} tone={totals.overStaffLimit ? 'warning' : 'neutral'} />
        </div>

        <div style={{ marginBottom: 16, display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Търси по име, slug, owner или email..."
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 16, padding: '12px 14px', fontSize: 14, background: '#fff' }}
            />
            <select
              value={businessTypeFilter}
              onChange={(e) => setBusinessTypeFilter(e.target.value as 'ALL' | BusinessTypeKey)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 16, padding: '12px 14px', fontSize: 14, background: '#fff' }}
            >
              <option value="ALL">Всички типове бизнес</option>
              {BUSINESS_TYPES.map((value) => (
                <option key={value} value={value}>
                  {BUSINESS_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value as 'ALL' | SubscriptionPlanKey)}
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 16, padding: '12px 14px', fontSize: 14, background: '#fff' }}
            >
              <option value="ALL">Всички планове</option>
              {SUBSCRIPTION_PLANS.map((value) => (
                <option key={value} value={value}>
                  {PLAN_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <FilterChip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="Всички" />
            <FilterChip active={statusFilter === 'attention'} onClick={() => setStatusFilter('attention')} label="Искат внимание" />
            <FilterChip active={statusFilter === 'dueSoon'} onClick={() => setStatusFilter('dueSoon')} label="Плащане скоро" />
            <FilterChip active={statusFilter === 'blocked'} onClick={() => setStatusFilter('blocked')} label="Блокирани" />
            <FilterChip active={statusFilter === 'healthy'} onClick={() => setStatusFilter('healthy')} label="Без проблеми" />
          </div>
        </div>

        {tenants.length === 0 && (
          <div style={{ marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 24, padding: 20, boxShadow: '0 18px 42px rgba(15,23,42,0.06)', color: '#6b7280' }}>
            Няма заредени бизнеси. Ако очакваш да виждаш бизнеси тук, провери дали таблицата <code>public.tenants</code> в базата съдържа записи.
          </div>
        )}

        {tenants.length > 0 && filteredTenantCards.length === 0 && (
          <div style={{ marginBottom: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 24, padding: 20, boxShadow: '0 18px 42px rgba(15,23,42,0.06)', color: '#6b7280' }}>
            Няма бизнеси по текущите филтри.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {filteredTenantCards.map(({ tenant, dueSoon, overdue, daysUntilRenewal, attention, overStaffLimit, planProfile }) => {
            const draft = drafts[tenant.id] ?? {
              businessType: tenant.businessType,
              plan: tenant.plan,
              planStatus: tenant.planStatus,
              planRenewsAt: tenant.planRenewsAt ? tenant.planRenewsAt.slice(0, 10) : '',
              isActive: tenant.isActive,
              tempPassword: '',
              poweredByText: tenant.poweredByText,
            };
            const profile = getBusinessTypeConfig(draft.businessType as BusinessTypeKey);
            const draftPlanProfile = getSubscriptionPlanConfig(draft.plan as SubscriptionPlanKey);

            return (
              <section
                key={tenant.id}
                style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 24, padding: 20, boxShadow: '0 18px 42px rgba(15,23,42,0.06)' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#111827', letterSpacing: '-0.03em' }}>{tenant.businessName}</h2>
                    <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 14 }}>
                      {tenant.slug} · {PLAN_LABELS[(tenant.plan as SubscriptionPlanKey) || 'BASIC'] || tenant.plan}
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    <span
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 800,
                        background: tenant.access.blocked ? 'rgba(220,38,38,0.1)' : attention ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                        color: tenant.access.blocked ? '#dc2626' : attention ? '#b45309' : '#047857',
                      }}
                    >
                      {tenant.access.blocked ? (tenant.access.reason === 'suspended' ? 'Спрян' : 'Неплатен') : attention ? 'Иска внимание' : 'Активен'}
                    </span>
                    {daysUntilRenewal !== null && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? '#dc2626' : dueSoon ? '#b45309' : '#64748b' }}>
                        {overdue
                          ? `Просрочен с ${Math.abs(daysUntilRenewal)} дни`
                          : dueSoon
                            ? `Платено до ${daysUntilRenewal} дни`
                            : `Платено още ${daysUntilRenewal} дни`}
                      </span>
                    )}
                    {overStaffLimit && (
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#b45309' }}>
                        Над staff лимита на {planProfile.label}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                  <Stat label="Услуги" value={tenant.summary.services} />
                  <Stat label="Персонал" value={tenant.summary.staff} />
                  <Stat label="Клиенти" value={tenant.summary.clients} />
                  <Stat label="Резервации" value={tenant.summary.appointments} />
                  <Stat label="Чакащи" value={tenant.summary.pending} />
                  <Stat label="Следващ час" value={tenant.summary.nextAppointmentAt ? new Date(tenant.summary.nextAppointmentAt).toLocaleDateString('bg-BG') : 'няма'} />
                </div>

                <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Owner</label>
                    <div style={{ fontSize: 14, color: '#111827' }}>{tenant.owner.name || 'няма име'}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{tenant.owner.email || 'няма email'}</div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Абонаментен план</label>
                    <select
                      value={draft.plan}
                      onChange={(e) => updateDraft(tenant, { plan: e.target.value })}
                      style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 14 }}
                    >
                      {SUBSCRIPTION_PLANS.map((value) => (
                        <option key={value} value={value}>
                          {PLAN_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Тип бизнес</label>
                    <select
                      value={draft.businessType}
                      onChange={(e) => updateDraft(tenant, { businessType: e.target.value })}
                      style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 14 }}
                    >
                      {BUSINESS_TYPES.map((value) => <option key={value} value={value}>{BUSINESS_TYPE_LABELS[value]}</option>)}
                    </select>
                  </div>

                  <div style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 14, background: '#fafbff' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>{profile.label}</div>
                    <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: '#6b7280' }}>{profile.description}</p>
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                      <ProfileMeta label="Термин за услуга" value={profile.copy.serviceLabelPlural} />
                      <ProfileMeta label="Персонал" value={profile.copy.providerLabelPlural} />
                      <ProfileMeta label="Онлайн flow" value={profile.operations.onlineFlowLabel} />
                      <ProfileMeta label="Избор на персонал" value={profile.operations.staffSelectionLabel} />
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: 12, color: '#6b7280' }}>
                      Admin фокус: {profile.operations.adminFocusLabel}
                    </p>
                  </div>

                  <div style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 14, background: '#fafbff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#111827' }}>
                        {draftPlanProfile.label} · {draftPlanProfile.priceLabel}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: overStaffLimit ? '#b45309' : '#047857' }}>
                        {draftPlanProfile.staffLimit === null
                          ? 'Без staff лимит'
                          : `До ${draftPlanProfile.staffLimit} служители`}
                      </span>
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: '#6b7280' }}>{draftPlanProfile.description}</p>
                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                      <ProfileMeta label="Резервации" value={draftPlanProfile.bookingLimitLabel} />
                      <ProfileMeta label="Локации" value={draftPlanProfile.multiLocation ? 'Multi-location' : 'Една локация'} />
                      <ProfileMeta label="Поддръжка" value={draftPlanProfile.supportLabel} />
                      <ProfileMeta label="Текущ staff" value={String(tenant.summary.staff)} />
                    </div>
                    {overStaffLimit && draftPlanProfile.staffLimit !== null && (
                      <p style={{ margin: '10px 0 0', fontSize: 12, color: '#b45309' }}>
                        Текущият брой служители ({tenant.summary.staff}) е над лимита на плана ({draftPlanProfile.staffLimit}).
                      </p>
                    )}
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Статус</label>
                      <select
                        value={draft.planStatus}
                        onChange={(e) => updateDraft(tenant, { planStatus: e.target.value })}
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 14 }}
                      >
                        {PLAN_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Платено до</label>
                      <input
                        type="date"
                        value={draft.planRenewsAt}
                        onChange={(e) => updateDraft(tenant, { planRenewsAt: e.target.value })}
                        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 14 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Текст под клиентския портал</label>
                    <input
                      type="text"
                      value={draft.poweredByText}
                      onChange={(e) => updateDraft(tenant, { poweredByText: e.target.value })}
                      placeholder="Powered by ..."
                      style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 14 }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#111827' }}>
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => updateDraft(tenant, { isActive: e.target.checked })}
                    />
                    Активен бизнес
                  </label>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() =>
                        updateMutation.mutate({
                          id: tenant.id,
                          payload: {
                            businessType: draft.businessType,
                            plan: draft.plan,
                            planStatus: draft.planStatus,
                            planRenewsAt: draft.planRenewsAt || null,
                            isActive: draft.isActive,
                            poweredByText: draft.poweredByText,
                          },
                        })
                      }
                      style={{ padding: '10px 14px', borderRadius: 12, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Запази
                    </button>
                    <button
                      type="button"
                      onClick={() => impersonateMutation.mutate(tenant.id)}
                      style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#111827', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <UserCog className="h-4 w-4" />
                      Влез като owner
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateMutation.mutate({
                          id: tenant.id,
                          payload: {
                            businessType: draft.businessType,
                            plan: draft.plan,
                            planStatus: draft.planStatus,
                            planRenewsAt: draft.planRenewsAt || null,
                            isActive: false,
                            poweredByText: draft.poweredByText,
                          },
                        })
                      }
                      style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #fecaca', background: '#fff5f5', color: '#b91c1c', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <ShieldOff className="h-4 w-4" />
                      Спри веднага
                    </button>
                  </div>

                  <div style={{ marginTop: 6, borderTop: '1px solid #f0f2f6', paddingTop: 14 }}>
                    <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#374151' }}>Нова временна парола</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={draft.tempPassword}
                        onChange={(e) => updateDraft(tenant, { tempPassword: e.target.value })}
                        placeholder="мин. 6 символа"
                        style={{ flex: 1, minWidth: 180, border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 12px', fontSize: 14 }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!draft.tempPassword || draft.tempPassword.length < 6) {
                            toast.error('Въведи временна парола поне 6 символа.');
                            return;
                          }
                          resetPasswordMutation.mutate({ tenantId: tenant.id, newPassword: draft.tempPassword });
                        }}
                        style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #d1d5db', background: '#fff', color: '#111827', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Задай парола
                      </button>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280' }}>
                      Текущата парола не може да се показва. В базата се пази само hash, не plaintext.
                    </p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid #eef2f7', borderRadius: 16, padding: 12, background: '#fafbff' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 20, fontWeight: 900, color: '#111827' }}>{value}</div>
    </div>
  );
}

function DashboardKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'warning' | 'danger';
}) {
  const colors =
    tone === 'danger'
      ? { border: '#fecaca', background: '#fff5f5', text: '#b91c1c', sub: '#ef4444' }
      : tone === 'warning'
        ? { border: '#fde68a', background: '#fffbeb', text: '#b45309', sub: '#f59e0b' }
        : { border: '#e5e7eb', background: '#ffffff', text: '#111827', sub: '#6b7280' };

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 24, padding: 16, background: colors.background, boxShadow: '0 18px 42px rgba(15,23,42,0.04)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.sub }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, color: colors.text }}>{value}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderRadius: 999,
        border: active ? '1px solid rgba(15,23,42,0.12)' : '1px solid #e5e7eb',
        background: active ? '#111827' : '#fff',
        color: active ? '#fff' : '#374151',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function ProfileMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: '#111827' }}>
        {value}
      </div>
    </div>
  );
}
