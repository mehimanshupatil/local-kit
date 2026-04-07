import { Progress } from '@/components/ui/progress';

interface Props {
  progress: number; // 0-100
  label?: string;
}

export default function ProgressBar({ progress, label }: Props) {
  return (
    <div className="w-full space-y-2">
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-medium text-brand-600 dark:text-brand-400">{progress}%</span>
        </div>
      )}
      <Progress value={progress} className="h-2.5" />
    </div>
  );
}
