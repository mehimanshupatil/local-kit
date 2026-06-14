import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SunIcon, MoonIcon } from '@phosphor-icons/react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const isDark = !dark;
    setDark(isDark);
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  return (
    <Button
      onClick={toggle}
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      className="size-7 text-muted-foreground hover:text-foreground hover:bg-secondary"
    >
      {dark ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
    </Button>
  );
}
