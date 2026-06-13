import type { OutputFile } from '@/components/shared/OutputFiles';

export type ToolStatus = 'idle' | 'loading' | 'processing' | 'done' | 'error';

export interface ToolOp {
  status: ToolStatus;
  progress: number;
  output: OutputFile[];
  error: string;
}

export const IDLE_OP: ToolOp = { status: 'idle', progress: 0, output: [], error: '' };
