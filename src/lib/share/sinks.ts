import { candidateNames } from './transfer';

/** Where one incoming file's bytes go, in order. */
export interface FileSink {
  write: (data: ArrayBuffer) => Promise<void>;
  /** The finished file, or null when it was written straight to disk. */
  close: () => Promise<File | null>;
  abort: () => Promise<void>;
}

export interface IncomingFileMeta {
  name: string;
  size: number;
  type: string;
}

export type SinkFactory = (file: IncomingFileMeta) => Promise<FileSink>;

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

export const memorySinks: SinkFactory = async ({ name, type }) => {
  let parts: ArrayBuffer[] = [];
  return {
    write: async data => { parts.push(data); },
    close: async () => new File(parts, name, { type }),
    abort: async () => { parts = []; },
  };
};

export const canSaveToDisk = (): boolean => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

export const isMobileDevice = (): boolean => {
  const nav = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  return nav.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobi/i.test(nav.userAgent);
};

async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask for a folder (must run inside a click handler), then stream each file
 * into it under a name that doesn't overwrite anything already there.
 */
export async function pickFolderSinks(): Promise<{ folderName: string; sinks: SinkFactory }> {
  const dir = await window.showDirectoryPicker!({ mode: 'readwrite', id: 'localkit-share' });
  const claimed = new Set<string>();
  return {
    folderName: dir.name,
    sinks: async ({ name }) => {
      let free = name;
      for (const candidate of candidateNames(name)) {
        if (!claimed.has(candidate) && !(await exists(dir, candidate))) { free = candidate; break; }
      }
      claimed.add(free);
      const stream = await (await dir.getFileHandle(free, { create: true })).createWritable();
      return {
        write: data => stream.write(data),
        close: async () => { await stream.close(); return null; },
        abort: async () => {
          await stream.abort();
          await dir.removeEntry(free).catch(() => {});
        },
      };
    },
  };
}
