import { useEffect, useRef } from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { allTools, categories } from '@/data/tools';
import { useUIStore } from '@/stores/uiStore';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command';

export default function CommandPalette() {
  const open = useUIStore(s => s.commandOpen);
  const setOpen = useUIStore(s => s.setCommandOpen);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function navigate(href: string) {
    setOpen(false);
    window.location.href = href;
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 bg-black/60 z-50 animate-fade-in" />
        <DialogPrimitive.Popup className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg z-50 rounded-xl border border-border shadow-2xl overflow-hidden animate-slide-up">
          <Command>
            <CommandInput ref={inputRef} placeholder="Search tools…" />
            <CommandList>
              <CommandEmpty>No tools found.</CommandEmpty>
              {categories.map((cat, i) => (
                <div key={cat.id}>
                  {i > 0 && <CommandSeparator />}
                  <CommandGroup heading={cat.title}>
                    {cat.tools.map(tool => {
                      const TIcon = tool.icon;
                      return (
                      <CommandItem
                        key={tool.href}
                        value={tool.name}
                        onSelect={() => navigate(tool.href)}
                      >
                        <span className="text-muted-foreground shrink-0">
                          <TIcon size={16} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium truncate">{tool.name}</span>
                          <span className="block text-xs text-muted-foreground truncate">{tool.desc}</span>
                        </span>
                      </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </div>
              ))}
            </CommandList>

            <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span><kbd className="font-mono border border-border rounded px-1 py-0.5">↑↓</kbd> navigate</span>
              <span><kbd className="font-mono border border-border rounded px-1 py-0.5">↵</kbd> open</span>
              <span><kbd className="font-mono border border-border rounded px-1 py-0.5">esc</kbd> close</span>
            </div>
          </Command>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
