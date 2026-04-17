import axios, { AxiosInstance, AxiosError } from 'axios';
import { resolveBrowserTenantSlug } from './tenant-resolution';

/**
 * API Client — всички заявки към backend-а.
 *
 * Автоматично добавя X-Tenant-Slug header само когато host-ът
 * не е достатъчен за tenant resolution (localhost / preview / admin с local session).
 */
class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api/v1', // Проксира се от Next.js към backend
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    // Добавяй tenant slug от хостнейма
    this.client.interceptors.request.use((config) => {
      if (typeof window !== 'undefined') {
        const pathname = window.location.pathname;
        const hostname = window.location.hostname;
        const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'saloniq.bg';
        const defaultTenantSlug = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG || '';
        const storedTenantSlug = getTenantSlug();
        const resolvedTenantSlug = resolveBrowserTenantSlug({
          pathname,
          hostname,
          appDomain,
          defaultTenantSlug,
          storedTenantSlug,
        });

        if (resolvedTenantSlug) {
          config.headers['X-Tenant-Slug'] = resolvedTenantSlug;
        } else {
          delete config.headers['X-Tenant-Slug'];
        }
      }

      // JWT token за admin endpoints
      const token = getAuthToken();
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }

      return config;
    });

    // Обработка на грешки
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const status = error.response?.status;
        if (status === 401) {
          clearAuthToken();
          if (typeof window !== 'undefined') {
            if (window.location.pathname.startsWith('/platform')) {
              window.location.href = '/platform/login';
            } else if (window.location.pathname.startsWith('/admin')) {
              window.location.href = '/admin/login';
            }
          }
        }

        if ((status === 402 || status === 403) && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
          clearOwnerAuthToken();
          const reason = status === 402 ? 'unpaid' : 'suspended';
          window.location.href = `/admin/billing-blocked?reason=${reason}`;
        }

        return Promise.reject(error);
      },
    );
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const res = await this.client.get<{ success: true; data: T }>(path, { params });
    return res.data.data;
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.client.post<{ success: true; data: T }>(path, body);
    return res.data.data;
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await this.client.put<{ success: true; data: T }>(path, body);
    return res.data.data;
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await this.client.patch<{ success: true; data: T }>(path, body);
    return res.data.data;
  }

  async delete<T>(path: string): Promise<T> {
    const res = await this.client.delete<{ success: true; data: T }>(path);
    return res.data.data;
  }
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  if (window.location.pathname.startsWith('/platform')) {
    return localStorage.getItem('saloniq_platform_token');
  }
  return localStorage.getItem('saloniq_token');
}

function getTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('saloniq_tenant_slug');
}

function clearAuthToken() {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith('/platform')) {
    clearPlatformAuthToken();
    return;
  }
  clearOwnerAuthToken();
}

function clearOwnerAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('saloniq_token');
  localStorage.removeItem('saloniq_tenant_slug');
}

function clearPlatformAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('saloniq_platform_token');
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('saloniq_token', token);
}

export function setTenantSlug(slug: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('saloniq_tenant_slug', slug);
}

export function setPlatformAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('saloniq_platform_token', token);
}

export function getOrCreatePublicDeviceToken(tenantSlug?: string) {
  if (typeof window === 'undefined') return '';
  const suffix = tenantSlug?.trim() ? `_${tenantSlug.trim()}` : '';
  const storageKey = `saloniq_public_device_token${suffix}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const next =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  localStorage.setItem(storageKey, next);
  return next;
}

export const apiClient = new ApiClient();
