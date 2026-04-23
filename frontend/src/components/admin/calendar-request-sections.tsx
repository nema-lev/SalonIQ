'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, ChevronRight, Clock3, GripVertical, Loader2 } from 'lucide-react';
import type { Appointment, Service, WaitlistEntry } from './calendar-model';
import {
  formatAppointmentDay,
  formatTimeLabel,
  getRequestWindowLabel,
  getStatusTone,
  getWaitlistStatusPresentation,
} from './calendar-model';

type CalendarRequestSectionsProps = {
  waitlist: WaitlistEntry[];
  pendingAppointments: Appointment[];
  serviceMap: Map<string, Service>;
  firstAvailableId: string | null;
  onOpenRequest: (requestId: string) => void;
  onFirstAvailable: (request: WaitlistEntry) => void;
  onStartRequestDrag: (event: ReactPointerEvent<HTMLButtonElement>, request: WaitlistEntry) => void;
  onOpenAppointment: (appointmentId: string) => void;
  onConfirmAppointment: (appointmentId: string) => void;
  compact?: boolean;
};

export function CalendarRequestSections({
  waitlist,
  pendingAppointments,
  serviceMap,
  firstAvailableId,
  onOpenRequest,
  onFirstAvailable,
  onStartRequestDrag,
  onOpenAppointment,
  onConfirmAppointment,
  compact = false,
}: CalendarRequestSectionsProps) {
  const hasWaitlist = waitlist.length > 0;
  const hasPendingAppointments = pendingAppointments.length > 0;

  if (!hasWaitlist && !hasPendingAppointments) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        Няма чакащи заявки или потвърждения.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {hasWaitlist && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Без избран час</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              {waitlist.length}
            </span>
          </div>
          <div className="space-y-3">
            {waitlist.map((request) => {
              const duration = serviceMap.get(request.service_id)?.duration_minutes ?? 60;
              return (
                <article
                  key={request.id}
                  className="rounded-[26px] border border-slate-200 bg-white px-3 py-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onPointerDown={(event) => onStartRequestDrag(event, request)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 touch-none"
                      aria-label={`Плъзни заявката на ${request.client_name}`}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenRequest(request.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{request.client_name}</p>
                            <p className="mt-1 truncate text-sm text-slate-600">{request.service_name}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${getWaitlistStatusPresentation(request.status).cls}`}
                          >
                            {duration} мин
                          </span>
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                          <p>{request.staff_name || 'Всеки специалист'}</p>
                          <p>{getRequestWindowLabel(request)}</p>
                        </div>
                      </button>

                      <div className={`mt-3 flex items-center gap-2 ${compact ? 'flex-wrap' : ''}`}>
                        <button
                          type="button"
                          onClick={() => onFirstAvailable(request)}
                          disabled={firstAvailableId === request.id}
                          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        >
                          {firstAvailableId === request.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Първи свободен
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenRequest(request.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          Отвори
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {hasPendingAppointments && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Чакат потвърждение</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              {pendingAppointments.length}
            </span>
          </div>
          <div className="space-y-3">
            {pendingAppointments.map((appointment) => {
              const tone = getStatusTone(appointment);
              return (
                <article
                  key={appointment.id}
                  className="rounded-[26px] border border-amber-200/70 bg-amber-50/70 px-3 py-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-700">
                      <Clock3 className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onOpenAppointment(appointment.id)}
                        className="w-full text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-900">{appointment.client_name}</p>
                            <p className="mt-1 truncate text-sm text-slate-700">{appointment.service_name}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone.chip}`}>
                            {formatTimeLabel(appointment.start_at)}
                          </span>
                        </div>
                        <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                          <p>{appointment.staff_name}</p>
                          <p>{formatAppointmentDay(appointment.start_at)}</p>
                        </div>
                      </button>

                      <div className={`mt-3 flex items-center gap-2 ${compact ? 'flex-wrap' : ''}`}>
                        <button
                          type="button"
                          onClick={() => onConfirmAppointment(appointment.id)}
                          className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                          Потвърди
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenAppointment(appointment.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          Детайли
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
