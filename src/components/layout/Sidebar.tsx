import { useState, useEffect } from 'react';
import { categories } from '@/data/tools';
import { cn } from '@/lib/utils/cn';
import Icon from '@/components/ui/Icon';
import ThemeToggle from './ThemeToggle';
import { LockIcon, ListIcon, XIcon } from '@phosphor-icons/react';

function NavContent({ currentPath, onNavigate }: { currentPath: string; onNavigate?: () => void }) {
  const activeCatId = categories.find(c => currentPath.startsWith(c.href))?.id ?? null;
  const [open, setOpen] = useState<string | null>(activeCatId);

  // sync when path changes (e.g. on client navigation)
  useEffect(() => {
    setOpen(activeCatId);
  }, [activeCatId]);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <a
        href="/"
        className="flex items-center gap-2.5 px-4 h-12 border-b border-border shrink-0 hover:bg-secondary transition-colors"
      >
        <img src="/icon.svg" alt="LocalKit" className="size-5 rounded-sm" />
        <span className="font-mono font-semibold text-sm text-foreground">LocalKit</span>
      </a>

      {/* Categories */}
      <nav className="flex-1 overflow-y-auto py-1">
        {categories.map(cat => {
          const isOpen = open === cat.id;
          const isCatActive = currentPath.startsWith(cat.href);

          return (
            <div key={cat.id}>
              <button
                onClick={() => setOpen(isOpen ? null : cat.id)}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm font-medium transition-colors',
                  isCatActive
                    ? 'text-brand-500 bg-brand-500/8'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon icon={cat.icon} size={16} />
                  {cat.title.replace(' Tools', '')}
                </span>
                <svg
                  className={cn('size-3 transition-transform duration-150', isOpen && 'rotate-180')}
                  viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
                >
                  <path d="M2 4l4 4 4-4" />
                </svg>
              </button>

              {isOpen && (
                <div className="pb-1">
                  {cat.tools.map(tool => {
                    const isActive = currentPath === tool.href;
                    return (
                      <a
                        key={tool.href}
                        href={tool.href}
                        onClick={onNavigate}
                        className={cn(
                          'block pl-9 pr-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'text-brand-500 bg-brand-500/8 font-medium'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                        )}
                      >
                        {tool.name}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 flex items-center justify-between shrink-0">
        <span className="flex items-center gap-1.5 text-[10px] text-brand-500 font-mono tracking-wide">
          <LockIcon className="size-2.5" />
          LOCAL
        </span>
        <ThemeToggle />
      </div>
    </div>
  );
}

export default function Sidebar() {
  const [currentPath, setCurrentPath] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setCurrentPath(window.location.pathname);
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 bottom-0 w-[220px] border-r border-border bg-background z-40">
        <NavContent currentPath={currentPath} />
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 h-12 flex items-center justify-between px-4 bg-background/90 backdrop-blur-md border-b border-border z-40">
        <a href="/" className="flex items-center gap-2 font-mono font-semibold text-sm text-foreground">
          <img src="/icon.svg" alt="LocalKit" className="size-5 rounded-sm" />
          LocalKit
        </a>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <ListIcon className="size-4" />
        </button>
      </header>

      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-50 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 w-[260px] bg-background border-r border-border z-50 flex flex-col animate-slide-up">
            <div className="absolute top-3 right-3">
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <XIcon className="size-4" />
              </button>
            </div>
            <NavContent currentPath={currentPath} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </>
      )}
    </>
  );
}
