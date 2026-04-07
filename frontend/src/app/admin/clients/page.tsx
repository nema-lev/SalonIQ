'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, User, Phone, Mail, Ban, AlertTriangle, Loader2, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { format } from 'date-fns';
import { bg } from 'date-fns/locale';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  no_show_count: number;
  total_visits: number;
  total_spent: number;
  is_blocked: boolean;
  last_visit_at: string | null;
  created_at: string;
}

export default function AdminClientsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Client | null>(null);

  const { data: clients, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => apiClient.get<Client[]>('/clients', search ? { q: search } : {}),
    staleTime: 30 * 1000,
  });

  const filtered = clients?.filter((c) =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search),
  );

  return (
    <div className="flex gap-6 h-[calc(100vh-140px)]">
      {/* List panel */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-gray-100">
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

        {/* Client list */}
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
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                  client.is_blocked ? 'bg-red-100 text-red-500' : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                }`}>
                  {client.is_blocked ? <Ban className="w-4 h-4" /> : client.name.charAt(0)}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">{client.name}</p>
                  <p className="text-xs text-gray-500">{client.phone}</p>
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

      {/* Detail panel */}
      {selected ? (
        <ClientDetail client={selected} onClose={() => setSelected(null)} />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white rounded-2xl border border-gray-100">
          <div className="text-center text-gray-300">
            <User className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">Изберете клиент за да видите профила</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientDetail({ client, onClose }: { client: Client; onClose: () => void }) {
  const { data: history } = useQuery({
    queryKey: ['client-history', client.id],
    queryFn: () => apiClient.get<any[]>(`/clients/${client.id}/appointments`),
  });

  return (
    <div className="flex-1 bg-white rounded-2xl border border-gray-100 overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
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
                {client.phone}
              </a>
              {client.email && (
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

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-gray-900">{client.total_visits}</p>
            <p className="text-xs text-gray-400 mt-0.5">Посещения</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-2xl font-black text-gray-900">{client.total_spent} <span className="text-sm font-normal">лв.</span></p>
            <p className="text-xs text-gray-400 mt-0.5">Общо изхарчени</p>
          </div>
          <div className={`rounded-xl p-3 text-center ${client.no_show_count > 0 ? 'bg-amber-50' : 'bg-gray-50'}`}>
            <p className={`text-2xl font-black ${client.no_show_count > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
              {client.no_show_count}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">No-shows</p>
          </div>
        </div>

        {/* Last visit */}
        {client.last_visit_at && (
          <p className="text-sm text-gray-500 mb-6">
            Последно посещение:{' '}
            <span className="font-semibold text-gray-700">
              {format(new Date(client.last_visit_at), 'd MMMM yyyy', { locale: bg })}
            </span>
          </p>
        )}

        {/* History */}
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
                    {appt.price && <p className="text-sm font-bold text-gray-700">{appt.price} лв.</p>}
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
