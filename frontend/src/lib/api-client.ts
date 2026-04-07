import axios, { AxiosInstance, AxiosError } from 'axios';

/**
 * API Client — всички заявки към backend-а.
 *
 * Автоматично добавя X-Tenant-Slug header от hostname-а,
 * за да знае backend-ът кой tenant прави заявката.
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
        const hostname = window.location.hostname;
        const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'saloniq.bg';

        if (hostname.endsWith(`.${appDomain}`)) {
          const slug = hostname.replace(`.${appDomain}`, '');
          config.headers['X-Tenant-Slug'] = slug;
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
        if (error.response?.status === 401) {
          // Изтрий токена и пренасочи към login
          clearAuthToken();
          if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) {
            window.location.href = '/admin/login';
          }
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
  return localStorage.getItem('saloniq_token');
}

function clearAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('saloniq_token');
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('saloniq_token', token);
}

export const apiClient = new ApiClient();
