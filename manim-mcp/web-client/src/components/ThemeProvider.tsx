'use client';

import { useEffect } from 'react';
import { getThemeConfig } from '@/lib/config';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = getThemeConfig();
    const root = document.documentElement;
    
    // Apply theme colors as CSS variables
    Object.entries(theme.colors).forEach(([key, value]) => {
      const cssVarName = `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      root.style.setProperty(cssVarName, value);
    });
  }, []);
  
  return <>{children}</>;
}

