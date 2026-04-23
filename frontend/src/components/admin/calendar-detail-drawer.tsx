'use client';

import { Check, Loader2, X } from 'lucide-react';
import { formatBulgarianPhoneForDisplay } from '@/lib/phone';
import {
  type Appointment,
  type AppointmentContextResponse,
  type WaitlistEntry,
  formatAppointmentDay,
  getStatusTone,
  getWaitlistStatusPresentation,
  isCancelledCalendarItem,
  isRequestOwnerState,
  getRequestWindowLabel,
} from './calendar-model';

export type CalendarDetailState =
  | { type: 'appointment'; id: string }
  | { type: 'request'; id: string }
  | null;

type CalendarDetailDrawerProps = {
  detail: CalendarDetailState;
  appointment: Appointment | null;
  appointmentContext: AppointmentContextResponse | undefined;
  request: WaitlistEntry | null;
  requestDuration: number;
  onClose: () => void;
  onConfirm: (appointmentId: string) => void;
  onCancel: (appointmentId: string) => void;
  onMove: (appointment: Appointment) => void;
  onCall: (phone: string) => void;
  onFirstAvailable: (request: WaitlistEntry) => void;
  onArchiveRequest: (request: WaitlistEntry) => void;
  firstAvailableLoading: boolean;
};

export function CalendarDetailDrawer({
  detail,
  appointment,
  appointmentContext,
  request,
  requestDuration,
  onClose,
  onConfirm,
  onCancel,
  onMove,
  onCall,
  onFirstAvailable,
  onArchiveRequest,
  firstAvailableLoading,
}: CalendarDetailDrawerProps) {
  if (!detail) return null;

  const isAppointment = detail.type === 'appointment' && appointment;
  const tone = isAppointment && appointment ? getStatusTone(appointment) : null;

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/30 backdrop-blur-[1px]">
      <button type="button" aria-label="Затвори" className="absolute inset-0" onClick={onClose} />
      <div className="absolute bottom-0 right-0 top-0 z-[71] w-full border-l border-slate-200 bg-white shadow-2xl sm:max-w-[420px]">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                {isAppointment ? 'Детайли за час' : 'Заявка'}
              </p>
              <h3 className="mt-2 text-xl font-black text-slate-900">
                {isAppointment ? appointment?.client_name : request?.client_name}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {isAppointment ? appointment?.service_name : request?.service_name}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">
            {isAppointment && appointment ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone?.chip ?? ''}`}>
                      {appointment.owner_view_label || tone?.label}
                    </span>
                    <span className="text-sm font-semibold text-slate-500">
                      {formatAppointmentDay(appointment.start_at)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Специалист</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{appointment.staff_name}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Телефон</p>
                      <button
                        type="button"
                        onClick={() => onCall(appointment.client_phone)}
                        className="mt-1 text-left text-sm font-semibold text-slate-900 hover:text-[var(--color-primary)]"
                      >
                        {formatBulgarianPhoneForDisplay(appointment.client_phone)}
                      </button>
                    </div>
                    {appointmentContext?.appointment.client_email && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Имейл</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {appointmentContext.appointment.client_email}
                        </p>
                      </div>
                    )}
                    {(appointment.internal_notes || appointmentContext?.appointment.cancellation_reason) && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Бележки</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">
                          {appointment.internal_notes || appointmentContext?.appointment.cancellation_reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {appointmentContext && (
                  <div className="rounded-[28px] border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">История</p>
                    <div className="mt-3 grid gap-3 text-sm text-slate-600">
                      <div className="rounded-2xl bg-slate-50 px-4 py-3">
                        Известия: {appointmentContext.notification_summary.sent} изпратени /{' '}
                        {appointmentContext.notification_summary.failed} проблемни
                      </div>
                      {appointmentContext.notifications.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                          <p className="font-semibold text-slate-900">{entry.type}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.channel} · {entry.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : request ? (
              <div className="space-y-5">
                <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${getWaitlistStatusPresentation(request.status).cls}`}
                    >
                      {getWaitlistStatusPresentation(request.status).label}
                    </span>
                    <span className="text-sm font-semibold text-slate-500">{requestDuration} мин.</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Телефон</p>
                      <button
                        type="button"
                        onClick={() => onCall(request.client_phone)}
                        className="mt-1 text-left text-sm font-semibold text-slate-900 hover:text-[var(--color-primary)]"
                      >
                        {formatBulgarianPhoneForDisplay(request.client_phone)}
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Предпочитание</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {request.staff_name || 'Без предпочитан специалист'}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{getRequestWindowLabel(request)}</p>
                    </div>
                    {request.notes && (
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Бележка</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">{request.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-slate-200 px-5 py-4">
            {isAppointment && appointment ? (
              <div className="grid gap-2">
                {isRequestOwnerState(appointment) && (
                  <button
                    type="button"
                    onClick={() => onConfirm(appointment.id)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white"
                  >
                    <Check className="h-4 w-4" />
                    Потвърди
                  </button>
                )}
                {!isCancelledCalendarItem(appointment) && (
                  <button
                    type="button"
                    onClick={() => onMove(appointment)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                  >
                    Премести
                  </button>
                )}
                {!isCancelledCalendarItem(appointment) && (
                  <button
                    type="button"
                    onClick={() => onCancel(appointment.id)}
                    className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-semibold text-rose-700"
                  >
                    Откажи / отмени
                  </button>
                )}
              </div>
            ) : request ? (
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => onFirstAvailable(request)}
                  disabled={firstAvailableLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {firstAvailableLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Първи свободен
                </button>
                <button
                  type="button"
                  onClick={() => onArchiveRequest(request)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Архивирай
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
