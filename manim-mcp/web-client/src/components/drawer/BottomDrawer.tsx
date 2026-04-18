'use client';

import { useRef, useCallback, useEffect } from 'react';
import type { DrawerState, Message } from '@/components/chat/types';
import { DrawerMessageList } from './DrawerMessageList';
import { DrawerInput } from './DrawerInput';

interface BottomDrawerProps {
  drawerState: DrawerState;
  onDrawerStateChange: (state: DrawerState) => void;
  messages: Message[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  isLoading: boolean;
}

const PEEK_HEIGHT = 72;
const PARTIAL_VH = 40;
const FULL_VH = 85;

function getTranslateY(state: DrawerState): string {
  switch (state) {
    case 'collapsed':
      return 'calc(100% - 0px)';
    case 'peek':
      return `calc(100% - ${PEEK_HEIGHT}px)`;
    case 'partial':
      return `calc(100% - ${PARTIAL_VH}vh)`;
    case 'full':
      return `calc(100% - ${FULL_VH}vh)`;
  }
}

export function BottomDrawer({
  drawerState,
  onDrawerStateChange,
  messages,
  input,
  onInputChange,
  onSubmit,
  onStop,
  isLoading,
}: BottomDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragStartState = useRef<DrawerState>(drawerState);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll messages in drawer when new messages arrive
  useEffect(() => {
    if (drawerState !== 'peek') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, drawerState]);

  const cycleState = useCallback(() => {
    const order: DrawerState[] = ['peek', 'partial', 'full'];
    const idx = order.indexOf(drawerState);
    const next = order[(idx + 1) % order.length];
    onDrawerStateChange(next);
  }, [drawerState, onDrawerStateChange]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      dragStartY.current = e.touches[0].clientY;
      dragStartState.current = drawerState;
    },
    [drawerState]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (dragStartY.current === null) return;
      const deltaY = dragStartY.current - e.changedTouches[0].clientY;
      dragStartY.current = null;

      // Threshold for swipe
      if (Math.abs(deltaY) < 30) {
        return; // Ignore tiny drags
      }

      if (deltaY > 0) {
        // Swiped up — expand
        if (dragStartState.current === 'peek') onDrawerStateChange('partial');
        else if (dragStartState.current === 'partial') onDrawerStateChange('full');
      } else {
        // Swiped down — collapse
        if (dragStartState.current === 'full') onDrawerStateChange('partial');
        else if (dragStartState.current === 'partial') onDrawerStateChange('peek');
      }
    },
    [onDrawerStateChange]
  );

  return (
    <>
      {/* Backdrop for partial/full */}
      {(drawerState === 'partial' || drawerState === 'full') && (
        <div
          className="drawer-backdrop fixed inset-0 bg-black/40 z-40"
          onClick={() => onDrawerStateChange('peek')}
        />
      )}

      <div
        ref={drawerRef}
        className="fixed inset-x-0 bottom-0 z-50 drawer-transition bg-[var(--background)] border-t border-white/10 rounded-t-2xl"
        style={{
          transform: `translateY(${getTranslateY(drawerState)})`,
          height: `${FULL_VH}vh`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle — larger touch target on mobile */}
        <div
          className="flex justify-center pt-3 pb-2 sm:pt-2 sm:pb-1 cursor-grab active:cursor-grabbing"
          onClick={cycleState}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Input (always visible in peek) */}
        <DrawerInput
          value={input}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onStop={onStop}
          isLoading={isLoading}
        />

        {/* Scrollable messages (visible in partial/full) */}
        <div className="flex-1 overflow-y-auto" style={{ height: `calc(${FULL_VH}vh - ${PEEK_HEIGHT}px)` }}>
          <DrawerMessageList messages={messages} />
          <div ref={messagesEndRef} />
        </div>
      </div>
    </>
  );
}
