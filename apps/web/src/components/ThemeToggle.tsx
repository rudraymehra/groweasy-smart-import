'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <button
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className="flex size-9 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ember"
    >
      {mounted && (resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />)}
    </button>
  );
}
