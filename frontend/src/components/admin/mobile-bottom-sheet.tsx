'use client';

import { useEffect, useRef, useState } from 'react';

type MobileBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

type LockedNodeState = {
  node: HTMLElement;
  overflow: string;
  overscrollBehavior: string;
  touchAction: string;
};

function collectLockableNodes() {
  if (typeof document === 'undefined') {
    return [];
  }

  const nodes = [
    document.documentElement,
    document.body,
    document.querySelector<HTMLElement>('[data-admin-scroll-root]'),
  ].filter((node): node is HTMLElement => Boolean(node));

  return nodes.map((node) => ({
    node,
    overflow: node.style.getPropertyValue('overflow'),
    overscrollBehavior: node.style.getPropertyValue('overscroll-behavior'),
    touchAction: node.style.getPropertyValue('touch-action'),
  }));
}

export function MobileBottomSheet({ open, onClose, children }: MobileBottomSheetProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    lastY: number;
    lastTime: number;
    velocity: number;
    dragging: boolean;
  } | null>(null);
  const lockedNodesRef = useRef<LockedNodeState[]>([]);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }

    lockedNodesRef.current = collectLockableNodes();

    for (const entry of lockedNodesRef.current) {
      entry.node.style.setProperty('overflow', 'hidden');
      entry.node.style.setProperty('overscroll-behavior', 'none');
      entry.node.style.setProperty('touch-action', 'none');
    }

    return () => {
      for (const entry of lockedNodesRef.current) {
        entry.node.style.setProperty('overflow', entry.overflow);
        entry.node.style.setProperty('overscroll-behavior', entry.overscrollBehavior);
        entry.node.style.setProperty('touch-action', entry.touchAction);
      }
      lockedNodesRef.current = [];
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDragOffset(0);
      dragStateRef.current = null;
    }
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0" onClick={(event) => event.stopPropagation()}>
        <div
          ref={contentRef}
          className="max-h-[82vh] overflow-y-auto rounded-t-[32px] bg-white px-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3 shadow-2xl"
          style={{
            transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
            transition: dragStateRef.current?.dragging ? 'none' : 'transform 180ms ease-out',
            willChange: 'transform',
            touchAction: dragStateRef.current?.dragging ? 'none' : 'pan-y',
            overscrollBehavior: 'contain',
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== 'touch') {
              return;
            }

            dragStateRef.current = {
              pointerId: event.pointerId,
              startY: event.clientY,
              lastY: event.clientY,
              lastTime: performance.now(),
              velocity: 0,
              dragging: false,
            };

            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const dragState = dragStateRef.current;
            if (!dragState || dragState.pointerId !== event.pointerId) {
              return;
            }

            const deltaY = event.clientY - dragState.startY;
            const scrollTop = contentRef.current?.scrollTop ?? 0;

            if (!dragState.dragging) {
              if (deltaY <= 0 || scrollTop > 0) {
                return;
              }
              dragState.dragging = true;
            }

            const now = performance.now();
            const elapsed = Math.max(now - dragState.lastTime, 1);
            dragState.velocity = (event.clientY - dragState.lastY) / elapsed;
            dragState.lastY = event.clientY;
            dragState.lastTime = now;

            setDragOffset(Math.max(deltaY, 0));
          }}
          onPointerUp={(event) => {
            const dragState = dragStateRef.current;
            if (!dragState || dragState.pointerId !== event.pointerId) {
              return;
            }

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }

            const shouldClose = dragState.dragging && (dragOffset > 120 || dragState.velocity > 0.7);
            dragStateRef.current = null;
            setDragOffset(0);

            if (shouldClose) {
              onClose();
            }
          }}
          onPointerCancel={(event) => {
            const dragState = dragStateRef.current;
            if (!dragState || dragState.pointerId !== event.pointerId) {
              return;
            }

            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }

            dragStateRef.current = null;
            setDragOffset(0);
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
