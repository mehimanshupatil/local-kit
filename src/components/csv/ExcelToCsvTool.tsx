import { useState } from 'react';
import { useImmer } from 'use-immer';
import { FileXlsIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DropZone from '@/components/shared/DropZone';
import OutputFiles from '@/components/shared/OutputFiles';
import CsvOptionsFields from '@/components/csv/CsvOptionsFields';
import CsvPreviewTable from '@/components/csv/CsvPreviewTable';
import { useToolVisit } from '@/stores/toolVisit';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { DEFAULT_CSV_OPTIONS, csvOutputFile, trimGrid, type CsvOptions } from '@/lib/csv/csv';
import { readWorkbook, sheetFileName, type SheetGrid } from '@/lib/csv/excelToCsv';

const PREVIEW_ROWS = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export default function ExcelToCsvTool() {
  useToolVisit('csv', '/csv/excel-to-csv');

  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetGrid[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [options, setOptions] = useState<CsvOptions>(DEFAULT_CSV_OPTIONS);
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, output, error } = op;

  const sheet = sheets[sheetIndex];
  const baseName = file ? stripExtension(file.name) : 'sheet';

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setSheets([]);
    setSheetIndex(0);
    if (f.size > MAX_FILE_BYTES) {
      updateOp(() => ({ ...IDLE_OP, status: 'error', error: `File is ${formatFileSize(f.size)} — the limit is ${formatFileSize(MAX_FILE_BYTES)}.` }));
      return;
    }
    updateOp(() => ({ ...IDLE_OP, status: 'loading' }));
    try {
      setSheets(await readWorkbook(f));
      updateOp(() => ({ ...IDLE_OP }));
    } catch (e) {
      updateOp(() => ({ ...IDLE_OP, status: 'error', error: e instanceof Error ? e.message : 'Failed to read workbook' }));
    }
  };

  const convert = (targets: SheetGrid[]) => {
    const multi = sheets.length > 1;
    const files = targets.map(s =>
      csvOutputFile(sheetFileName(baseName, s.name, multi), trimGrid(s.rows.length ? s.rows : [['']]), options));
    updateOp(d => { d.output = files; d.status = 'done'; });
  };

  const clearOutput = () => updateOp(d => { d.output = []; d.status = 'idle'; });

  const reset = () => {
    setFile(null);
    setSheets([]);
    updateOp(() => ({ ...IDLE_OP }));
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFile}
          accept=".xlsx"
          multiple={false}
          label="Drop an Excel workbook"
          sublabel="Accepts .xlsx · every sheet can be exported"
        />
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="flex items-center gap-3">
              <FileXlsIcon className="size-6 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                  {sheets.length > 0 && ` · ${sheets.length} ${sheets.length === 1 ? 'sheet' : 'sheets'}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Remove file" onClick={reset}
                className="shrink-0 text-muted-foreground hover:text-red-500">
                <XIcon className="size-4" />
              </Button>
            </div>

            {status === 'loading' && <p className="text-sm text-muted-foreground">Reading workbook…</p>}
            {status === 'error' && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            {sheet && (
              <>
                {sheets.length > 1 && (
                  <div className="space-y-1.5">
                    <Label>Sheet</Label>
                    <Select value={String(sheetIndex)} onValueChange={v => { if (v) { setSheetIndex(Number(v)); clearOutput(); } }}>
                      <SelectTrigger className="w-full sm:w-72">
                        <SelectValue>{(v: string) => sheets[Number(v)]?.name}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {sheets.map((s, i) => (
                          <SelectItem key={i} value={String(i)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <CsvPreviewTable rows={sheet.rows} header={false} maxRows={PREVIEW_ROWS} />

                <CsvOptionsFields options={options} onChange={o => { setOptions(o); clearOutput(); }} />

                <div className="flex flex-wrap gap-3">
                  <Button onClick={() => convert([sheet])}>
                    {sheets.length > 1 ? `Convert “${sheet.name}”` : 'Convert to CSV'}
                  </Button>
                  {sheets.length > 1 && (
                    <Button variant="secondary" onClick={() => convert(sheets)}>
                      Convert all {sheets.length} sheets
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}
