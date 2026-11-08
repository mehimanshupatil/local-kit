import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { Grid } from '@/lib/csv/csv';

interface Props {
  rows: Grid;
  /** Render the first row as a table header */
  header?: boolean;
  maxRows?: number;
}

/** Read-only preview of the first few rows of a grid, with a row count caption. */
export default function CsvPreviewTable({ rows, header = true, maxRows = 10 }: Props) {
  const head = header ? rows[0] : undefined;
  const body = (header ? rows.slice(1) : rows);
  const dataCount = body.length;

  if (rows.length === 0 || (header && dataCount === 0 && !head?.some(Boolean))) {
    return <p className="text-sm text-muted-foreground px-3 py-6 text-center rounded-xl border border-border">No rows.</p>;
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">
        Preview · {dataCount} {dataCount === 1 ? 'row' : 'rows'}{header && ' + header'}
        {dataCount > maxRows && ` (showing first ${maxRows})`}
      </p>
      <div className="rounded-xl border border-border max-h-80 overflow-auto">
        <Table>
          {head && (
            <TableHeader>
              <TableRow>
                {head.map((v, c) => <TableHead key={c} className="max-w-60 truncate">{v}</TableHead>)}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {body.slice(0, maxRows).map((row, r) => (
              <TableRow key={r}>
                {row.map((v, c) => <TableCell key={c} className="max-w-60 truncate">{v}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
