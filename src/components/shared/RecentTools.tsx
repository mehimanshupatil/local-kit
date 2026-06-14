import { useRecentTools } from '@/stores/prefsStore';
import { allTools } from '@/data/tools';

export default function RecentTools() {
  const { recentTools } = useRecentTools();

  const tools = recentTools
    .map(href => allTools.find(t => t.href === href))
    .filter((t): t is NonNullable<typeof t> => t != null);

  if (tools.length === 0) return null;

  return (
    <section className="py-10 px-4 bg-brand-50 dark:bg-brand-950/20 border-y border-brand-100 dark:border-brand-900/40">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-sm font-semibold text-brand-700 dark:text-brand-400 uppercase tracking-wide mb-4">
          Recently used
        </h2>
        <div className="flex flex-wrap gap-3">
          {tools.map(tool => (
            <a
              key={tool.href}
              href={tool.href}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-card border border-border text-sm font-medium text-foreground hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-500 transition-all shadow-sm"
            >
              {tool.name}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
