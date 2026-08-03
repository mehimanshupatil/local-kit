import { diffLines, type Change } from 'diff';

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const changes: Change[] = diffLines(oldText, newText);
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const type = change.added ? 'added' : change.removed ? 'removed' : 'unchanged';
    const parts = change.value.split('\n');
    if (parts[parts.length - 1] === '') parts.pop();
    for (const content of parts) {
      lines.push({ type, content });
    }
  }

  return lines;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export function computeStats(lines: DiffLine[]): DiffStats {
  return {
    additions: lines.filter(l => l.type === 'added').length,
    deletions: lines.filter(l => l.type === 'removed').length,
  };
}
