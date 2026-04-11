'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import {
  AlertTriangle,
  Ban,
  Download,
  Loader2,
  Mail,
  Phone,
  Search,
  Upload,
  User,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/lib/api-client';
import { formatBulgarianPhoneForDisplay } from '@/lib/phone';
import { useTenant } from '@/lib/tenant-context';

interface Client {
  id: string;
  name: string;
  salutation: string;
  phone: string;
  email: string | null;
  no_show_count: number;
  total_visits: number;
  total_spent: number;
  is_blocked: boolean;
  last_visit_at: string | null;
  created_at: string;
}

interface ImportedClient {
  name?: string;
  phone: string;
  email?: string;
}

type ContactPickerNavigator = Navigator & {
  contacts?: {
    select(
      properties: Array<'name' | 'tel' | 'email'>,
      options: { multiple: boolean },
    ): Promise<Array<{ name?: string[]; tel?: string[]; email?: string[] }>>;
  };
};

function parseCsv(text: string): ImportedClient[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const rows = lines.map((line) => parseCsvLine(line, delimiter));
  const headers = rows[0].map((header) => header.trim().toLowerCase());

  const nameIndex = headers.findIndex((header) => ['name', 'име', 'full name', 'display name'].includes(header));
  const phoneIndex = headers.findIndex((header) => ['phone', 'телефон', 'mobile', 'number', 'номер'].includes(header));
  const emailIndex = headers.findIndex((header) => ['email', 'e-mail', 'имейл'].includes(header));

  if (phoneIndex === -1) return [];

  return rows.slice(1).map((row) => ({
    name: nameIndex >= 0 ? row[nameIndex]?.trim() : undefined,
    phone: row[phoneIndex]?.trim(),
    email: emailIndex >= 0 ? row[emailIndex]?.trim() : undefined,
  })).filter((row) => row.phone);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function isContactPickerSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as ContactPickerNavigator;
  return Boolean(window.isSecureContext && nav.contacts?.select);
}

export default function AdminClientsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contactPickerSupported = isContactPickerSupported();

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => apiClient.get<Client[]>('/clients', search ? { q: search } : {}),
    staleTime: 30 * 1000,
  });

  const importMutation = useMutation({
    mutationFn: (contacts: ImportedClient[]) =>
      apiClient.post<{ created: number; updated: number; skipped: number; total: number }>('/clients/import', { contacts }),
    onSuccess: (data) => {
      toast.success(`Импорт: ${data.created} нови, ${data.updated} обновени, ${data.skipped} пропуснати.`);
      qc.invalidateQueries({ queryKey: ['clients'] });
      setShowImportModal(false);
    },
    onError: () => {
      toast.error('Грешка при импорт на клиенти.');
    },
  });

  const filtered = useMemo(() => clients?.filter((client) =>
    !search ||
    client.name.toLowerCase().includes(search.toLowerCase()) ||
    formatBulgarianPhoneForDisplay(client.phone).includes(search),
  ), [clients, search]);

  const handleDeviceContactsImport = async () => {
    const nav = navigator as ContactPickerNavigator;
    if (!nav.contacts?.select) return;

    try {
      const result = await nav.contacts.select(['name', 'tel', 'email'], { multiple: true });
      const contacts = result
        .map((entry) => ({
          name: entry.name?.[0],
          phone: entry.tel?.[0],
          email: entry.email?.[0],
        }))
        .filter((entry) => entry.phone);

      if (!contacts.length) {
        toast.error('Няма избрани контакти с телефон.');
        return;
      }

      importMutation.mutate(contacts as ImportedClient[]);
    } catch {
      toast.error('Достъпът до контактите беше отказан или прекъснат.');
    }
  };

  const handleCsvFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const contacts = parseCsv(text);
      if (!contacts.length) {
        toast.error('CSV файлът няма разпознаваеми колони за телефон.');
        return;
      }

      importMutation.mutate(contacts);
    } catch {
      toast.error('Грешка при прочитане на CSV файла.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <>
      <div
        className="flex flex-col gap-4 md:h-[calc(100dvh-140px)] md:flex-row md:gap-6"
        style={{ minHeight: 'calc(100dvh - 170px)' }}
      >
        <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-80 md:flex-shrink-0 flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden min-h-0`}>
          <div className="p-4 border-b border-gray-100">
            <div className="flex gap-2 mb-3">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-[var(--color-primary)] hover:opacity-90 transition-all"
              >
                <Upload className="w-4 h-4" />
                Импорт
              </button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Търси по име или телефон..."
                className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border-2 border-gray-200 focus:border-[var(--color-primary)] outline-none transition-colors"
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {filtered?.length ?? 0} клиента
            </p>
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
              </div>
            ) : filtered?.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Няма намерени клиенти</p>
              </div>
            ) : (
              filtered?.map((client) => (
                <button
                  key={client.id}
                  onClick={() => setSelected(client)}
                  className={`w-full flex items-center gap-3 p-4 border-b border-gray-50 text-left hover:bg-gray-50 transition-colors ${
                    selected?.id === client.id ? 'bg-[var(--color-primary)]/5' : ''
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    client.is_blocked ? 'bg-red-100 text-red-500' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  }`}>
                    {client.is_blocked ? <Ban className="w-4 h-4" /> : client.name.charAt(0)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{client.name}</p>
                    <p className="text-xs text-gray-500">{formatBulgarianPhoneForDisplay(client.phone)}</p>
                  </div>

                  <div className="text-right flex-shrink-0">
                    {client.no_show_count > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-amber-600 font-semibold">
                        <AlertTriangle className="w-3 h-3" />
                        {client.no_show_count}
                      </span>
                    )}
                    <p className="text-xs text-gray-400">{client.total_visits} посещ.</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {selected ? (
          <ClientDetail
            client={selected}
            onClose={() => setSelected(null)}
            onUpdated={(nextClient) => setSelected(nextClient)}
          />
        ) : (
          <div className="hidden min-h-0 md:flex flex-1 items-center justify-center bg-white rounded-2xl border border-gray-100">
            <div className="text-center text-gray-300">
              <User className="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">Изберете клиент за да видите профила</p>
            </div>
          </div>
        )}
      </div>

      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-gray-100 p-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-xl font-black text-gray-900">Импорт на клиенти</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Импортът обединява клиенти по телефон, така че `08...` и `+359...` да не се дублират.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {contactPickerSupported && (
                <button
                  type="button"
                  onClick={handleDeviceContactsImport}
                  disabled={importMutation.isPending}
                  className="w-full flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-gray-900">Импорт от контакти</p>
                    <p className="text-sm text-gray-500">Показва се само когато браузърът реално поддържа достъп до контактите.</p>
                  </div>
                  <Users className="w-5 h-5 text-[var(--color-primary)]" />
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={importMutation.isPending}
                className="w-full flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
              >
                <div>
                  <p className="font-semibold text-gray-900">Импорт от CSV</p>
                  <p className="text-sm text-gray-500">Поддържа колони `name/име`, `phone/телефон`, `email`.</p>
                </div>
                <Download className="w-5 h-5 text-[var(--color-primary)]" />
              </button>

              {!contactPickerSupported && (
                <div className="rounded-2xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
                  Директният импорт от контакти не е наличен в този браузър/устройство. CSV импортът остава наличен винаги.
                </div>
              )}
            </div>

            {importMutation.isPending && (
              <div className="mt-5 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                Импортът се обработва...
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvFile}
            />
          </div>
        </div>
      )}
    </>
  );
}

function ClientDetail({
  client,
  onClose,
  onUpdated,
}: {
  client: Client;
  onClose: () => void;
  onUpdated: (client: Client) => void;
}) {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const fallbackSalutation = client.salutation || client.name.split(/\s+/)[0] || client.name;
  const [name, setName] = useState(client.name);
  const [salutation, setSalutation] = useState(fallbackSalutation);
  const [email, setEmail] = useState(client.email ?? '');
  const [isBlocked, setIsBlocked] = useState(client.is_blocked);

  useEffect(() => {
    setName(client.name);
    setSalutation(client.salutation || client.name.split(/\s+/)[0] || client.name);
    setEmail(client.email ?? '');
    setIsBlocked(client.is_blocked);
  }, [client]);

  const { data: history } = useQuery({
    queryKey: ['client-history', client.id],
    queryFn: () => apiClient.get<any[]>(`/clients/${client.id}/appointments`),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/clients/${client.id}`, {
        name: name.trim(),
        salutation: salutation.trim(),
        email: email.trim() || undefined,
        is_blocked: isBlocked,
      }),
    onSuccess: () => {
      const nextClient: Client = {
        ...client,
        name: name.trim(),
        salutation: salutation.trim(),
        email: email.trim() || null,
        is_blocked: isBlocked,
      };
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      onUpdated(nextClient);
      toast.success('Профилът на клиента е обновен.');
    },
    onError: () => {
      toast.error('Грешка при запазване на клиента.');
    },
  });

  const formChanged =
    name.trim() !== client.name ||
    salutation.trim() !== fallbackSalutation ||
    (email.trim() || null) !== client.email ||
    isBlocked !== client.is_blocked;

  return (
    <div className="flex-1 w-full bg-white rounded-2xl border border-gray-100 overflow-y-auto">
      <div className="p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl flex-shrink-0 ${
              client.is_blocked
                ? 'bg-red-100 text-red-500'
                : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
            }`}>
              {client.is_blocked ? <Ban className="w-8 h-8" /> : client.name.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">{client.name}</h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline">
                  <Phone className="w-3.5 h-3.5" />
                  {formatBulgarianPhoneForDisplay(client.phone)}
                </a>
                {tenant.collectClientEmail && client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 text-sm text-gray-500 hover:underline">
                    <Mail className="w-3.5 h-3.5" />
                    {client.email}
                  </a>
                )}
              </div>
              {client.is_blocked && (
                <span className="inline-flex items-center gap-1 mt-2 text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                  <Ban className="w-3 h-3" />
                  Блокиран клиент
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-gray-900">{client.total_visits}</p>
            <p className="text-xs text-gray-400 mt-0.5">Посещения</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-gray-900">{client.total_spent} <span className="text-sm font-normal">€</span></p>
            <p className="text-xs text-gray-400 mt-0.5">Общо изхарчени</p>
          </div>
          <div className={`rounded-xl p-3 text-center ${client.no_show_count > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className={`text-2xl font-black ${client.no_show_count > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {client.no_show_count}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">No-shows</p>
          </div>
        </div>

        {client.last_visit_at && (
          <p className="text-sm text-gray-500 mb-6">
            Последно посещение:{' '}
            <span className="font-semibold text-gray-700">
              {format(new Date(client.last_visit_at), 'd MMMM yyyy', { locale: bg })}
            </span>
          </p>
        )}

        <div className="mb-6 rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Профил за известия</h3>
              <p className="mt-1 text-xs text-gray-500">
                Обръщението се ползва в потвържденията и напомнянията вместо пълното име.
              </p>
            </div>
            {client.is_blocked && (
              <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                Блокиран
              </span>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Пълно име</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Обръщение</label>
              <input
                value={salutation}
                onChange={(e) => setSalutation(e.target.value)}
                placeholder="Мария"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {tenant.collectClientEmail && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Имейл</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            )}
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <input
                checked={isBlocked}
                onChange={(e) => setIsBlocked(e.target.checked)}
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="text-sm text-gray-700">Блокиран клиент</span>
            </label>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => updateMutation.mutate()}
              disabled={!formChanged || !name.trim() || !salutation.trim() || updateMutation.isPending}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Записване...' : 'Запази профила'}
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-bold text-gray-900 mb-3">История на посещенията</h3>
          {!history?.length ? (
            <p className="text-sm text-gray-400">Няма история</p>
          ) : (
            <div className="space-y-2">
              {history.map((appt: any) => (
                <div key={appt.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <div
                    className="w-2 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: appt.service_color || '#6366f1' }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{appt.service_name}</p>
                    <p className="text-xs text-gray-400">
                      {format(new Date(appt.start_at), 'd MMM yyyy, HH:mm', { locale: bg })} · {appt.staff_name}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {appt.price && <p className="text-sm font-bold text-gray-700">{appt.price} €</p>}
                    <span className={`text-xs ${
                      appt.status === 'completed' ? 'text-green-600' :
                      appt.status === 'no_show' ? 'text-amber-600' :
                      appt.status === 'cancelled' ? 'text-red-500' : 'text-gray-500'
                    }`}>
                      {appt.status === 'completed' ? 'Завършен' :
                       appt.status === 'no_show' ? 'No-show' :
                       appt.status === 'cancelled' ? 'Отменен' : appt.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
