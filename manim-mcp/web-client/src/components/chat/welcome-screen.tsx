'use client';

import { getAppConfig, getUIConfig } from '@/lib/config';
import { Compass } from 'lucide-react';

interface WelcomeScreenProps {
  onPromptClick: (prompt: string) => void;
}

export function WelcomeScreen({ onPromptClick }: WelcomeScreenProps) {
  const appConfig = getAppConfig();
  const uiConfig = getUIConfig();

  return (
    <div className="text-center space-y-8 py-12">
      <div className="space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
          <Compass size={32} className="text-primary-foreground" />
        </div>
        <h2 className="text-3xl font-bold text-foreground tracking-tight">
          {uiConfig.welcomeTitle}
        </h2>
        <p className="text-foreground-muted max-w-lg mx-auto text-lg leading-relaxed">
          <span className="hidden sm:inline">{appConfig.tagline}</span>
          <span className="sm:hidden">{appConfig.taglineShort}</span>
        </p>
      </div>

      {/* Quick Start Prompts */}
      <div className="space-y-4 max-w-2xl mx-auto hidden sm:block">
        <p className="text-sm font-medium text-foreground-muted text-center">Get started with these questions:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {uiConfig.quickPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => onPromptClick(prompt)}
              className="group p-3 text-left rounded-xl bg-background-secondary/50 hover:bg-background-secondary border border-border/30 hover:border-primary/30 transition-all duration-200 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-primary group-hover:bg-primary transition-colors"></div>
                <span className="text-sm text-foreground group-hover:text-foreground font-medium">{prompt}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
