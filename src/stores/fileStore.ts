import { create } from 'zustand';

export type CategoryId = 'pdf' | 'image' | 'video' | 'audio' | 'dev' | 'archive';

interface FileStore {
  sessions: Partial<Record<CategoryId, File[]>>;
  setFiles: (category: CategoryId, files: File[]) => void;
  clearFiles: (category: CategoryId) => void;
}

export const useFileStore = create<FileStore>((set) => ({
  sessions: {},
  setFiles: (category, files) =>
    set(s => ({ sessions: { ...s.sessions, [category]: files } })),
  clearFiles: (category) =>
    set(s => ({ sessions: { ...s.sessions, [category]: [] } })),
}));

export function useFileSession(category: CategoryId) {
  const { sessions, setFiles, clearFiles } = useFileStore();
  return {
    sessionFiles: sessions[category] ?? [],
    setSessionFiles: (files: File[]) => setFiles(category, files),
    clearSession: () => clearFiles(category),
  };
}
