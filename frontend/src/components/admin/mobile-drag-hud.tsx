'use client';

import { format } from 'date-fns';
import { bg } from 'date-fns/locale';
import type { MobilePlacementPreview } from './use-mobile-calendar-drag';

type MoveTarget = {
  client_name: string;
  service_name: string;
  staff_name: string;
};

type MobileDragPoint = {
  clientX: number;
  clientY: number;
};

type MobileDragHudProps = {
  visible: boolean;
  target: MoveTarget | null;
  dragPoint: MobileDragPoint | null;
  preview: MobilePlacementPreview;
  candidateStartAt: string | null;
  candidateStaffName: string | null;
  invalidReason: string | null;
};

export function MobileDragHud({
  visible,
  target,
  dragPoint,
  preview,
  candidateStartAt,
  candidateStaffName,
  invalidReason,
}: MobileDragHudProps) {
  if (!visible || !target) {
    return null;
  }

  const resolvedDate = candidateStartAt ? new Date(candidateStartAt) : null;
  const timeLabel = resolvedDate ? format(resolvedDate, 'HH:mm') : 'Плъзнете към слот';
  const dayLabel = resolvedDate ? format(resolvedDate, 'EEE d MMM', { locale: bg }) : null;
  const statusLabel = preview
    ? 'Свободен слот'
    : invalidReason || 'Плъзнете към свободен 15-минутен слот.';
  const statusClass = preview
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';

  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+14px)] z-50 -translate-x-1/2">
        <div className="min-w-[220px] max-w-[calc(100vw-24px)] rounded-[22px] border border-white/80 bg-white/96 px-4 py-3 shadow-2xl shadow-black/10 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">Преместване</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <p className="text-lg font-black text-gray-900">{timeLabel}</p>
              {dayLabel && <p className="text-xs font-semibold text-gray-500">{dayLabel}</p>}
            </div>
            <div className="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--color-primary)]">
              {candidateStaffName || target.staff_name}
            </div>
          </div>
          <div className={`mt-3 rounded-2xl border px-3 py-2 text-xs font-semibold ${statusClass}`}>
            {statusLabel}
          </div>
        </div>
      </div>

      {dragPoint && (
        <div
          className="pointer-events-none fixed z-50 w-[min(264px,calc(100vw-32px))] -translate-x-1/2 -translate-y-[22%]"
          style={{
            left: `clamp(132px, ${dragPoint.clientX}px, calc(100vw - 132px))`,
            top: `clamp(calc(env(safe-area-inset-top,0px) + 112px), ${dragPoint.clientY}px, calc(100dvh - 112px))`,
          }}
        >
          <div
            className={`rounded-[26px] border px-4 py-3 shadow-2xl backdrop-blur ${
              preview
                ? 'border-[var(--color-primary)]/35 bg-white/96 text-gray-900'
                : 'border-rose-300/80 bg-white/96 text-rose-900'
            }`}
          >
            <p className="truncate text-sm font-black">{target.client_name}</p>
            <p className="mt-1 truncate text-xs font-semibold text-gray-600">{target.service_name}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">Цел</p>
                <p className="mt-1 text-sm font-bold">{timeLabel}</p>
              </div>
              <div
                className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  preview ? 'bg-[var(--color-primary)]/12 text-[var(--color-primary)]' : 'bg-rose-100 text-rose-700'
                }`}
              >
                {preview ? 'OK' : 'Невалидно'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
