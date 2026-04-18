'use client';

import { Plus } from 'lucide-react';
import type { Conversation } from '@/components/chat/types';

interface HistoryPopoverProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onClose: () => void;
}

function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function HistoryPopover({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onClose,
}: HistoryPopoverProps) {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover — full width on mobile, fixed width on desktop */}
      <div className="popover-enter fixed top-12 z-50 max-h-[60vh] bg-[var(--surface)] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col left-3 right-3 sm:left-auto sm:right-4 sm:w-72">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <span className="text-sm font-semibold text-foreground">History</span>
          <button
            onClick={() => {
              onNewConversation();
              onClose();
            }}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus size={14} />
            New
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-foreground-muted text-sm">
              No conversations yet
            </div>
          ) : (
            <div className="py-1">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group relative ${
                    currentConversationId === conversation.id
                      ? 'bg-primary/10'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <button
                    className="w-full text-left px-4 py-2.5 pr-10"
                    onClick={() => {
                      onSelectConversation(conversation.id);
                      onClose();
                    }}
                  >
                    <div className="text-sm text-foreground truncate">
                      {conversation.title}
                    </div>
                    <div className="text-xs text-foreground-muted mt-0.5">
                      {formatDate(conversation.updatedAt)}
                    </div>
                  </button>

                  {/* Delete */}
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 text-foreground-muted hover:text-destructive transition-all"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conversation.id);
                    }}
                    title="Delete"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
