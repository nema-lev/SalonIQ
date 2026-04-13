import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ResponsiveSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  side?: 'left' | 'right';
  children: React.ReactNode;
}

export function ResponsiveSheet({
  isOpen,
  onClose,
  title,
  side = 'right',
  children,
}: ResponsiveSheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 xl:bg-transparent transition-opacity" />

      {/* Sheet Content */}
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className={`absolute bg-white shadow-2xl transition-transform duration-300 ease-in-out
          flex flex-col
          /* Mobile: Bottom sheet */
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-[32px] translate-y-0
          /* Desktop: Side sheet */
          xl:top-0 xl:bottom-0 xl:max-h-none xl:w-[400px] xl:rounded-none
          ${side === 'left' ? 'xl:left-0' : 'xl:right-0'}
          ${isOpen ? 'translate-x-0 translate-y-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'}
        `}
      >
        <div className="flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3 xl:px-6 xl:py-6">
          {/* Mobile Handle */}
          <div className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-gray-200 xl:hidden" />

          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              {title && (
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
                  {title}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 shrink-0"
              aria-label="Затвори"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
