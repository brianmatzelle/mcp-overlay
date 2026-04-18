'use client';

import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getAppConfig } from '@/lib/config';
import { Sparkles } from 'lucide-react';

interface ChatHeaderProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

export function ChatHeader({ onToggleSidebar, isSidebarOpen }: ChatHeaderProps) {
  const appConfig = getAppConfig();

  return (
    <div className="flex-shrink-0 border-b border-border bg-background-secondary/50 backdrop-blur-sm">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {/* Hamburger Menu Button */}
          {!isSidebarOpen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              title="Open chat history"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </Button>
          )}

          <Link href="/" className="w-8 h-8 rounded-lg overflow-hidden bg-primary/10 p-1 flex items-center justify-center">
            <Sparkles size={18} className="text-primary" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{appConfig.name}</h1>
            <p className="text-sm text-foreground-muted">{appConfig.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
