import { useEffect } from 'react';
import { useFileSession, type CategoryId } from '@/stores/fileStore';
import { useRecentTools } from '@/stores/prefsStore';

export function useToolVisit(category: CategoryId, href: string) {
  const { recordVisit } = useRecentTools();
  useEffect(() => { recordVisit(href); }, []);
  return useFileSession(category);
}
