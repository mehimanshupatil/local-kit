import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PrefsStore {
  toolPrefs: Record<string, Record<string, unknown>>;
  recentTools: string[];
  mergeToolPrefs: (toolKey: string, updates: Record<string, unknown>) => void;
  recordVisit: (href: string) => void;
}

export const usePrefsStore = create<PrefsStore>()(
  persist(
    (set) => ({
      toolPrefs: {},
      recentTools: [],
      mergeToolPrefs: (toolKey, updates) =>
        set(s => ({
          toolPrefs: {
            ...s.toolPrefs,
            [toolKey]: { ...s.toolPrefs[toolKey], ...updates },
          },
        })),
      recordVisit: (href) =>
        set(s => ({
          recentTools: [href, ...s.recentTools.filter(h => h !== href)].slice(0, 6),
        })),
    }),
    { name: 'localkit-prefs' }
  )
);

export function useToolPrefs<T extends Record<string, unknown>>(
  toolKey: string,
  defaults: T
): [T, (updates: Partial<T>) => void] {
  const { toolPrefs, mergeToolPrefs } = usePrefsStore();
  const prefs = { ...defaults, ...(toolPrefs[toolKey] ?? {}) } as T;
  const update = (updates: Partial<T>) => mergeToolPrefs(toolKey, updates as Record<string, unknown>);
  return [prefs, update];
}

export function useRecentTools() {
  const { recentTools, recordVisit } = usePrefsStore();
  return { recentTools, recordVisit };
}
