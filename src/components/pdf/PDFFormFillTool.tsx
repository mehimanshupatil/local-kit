import { useState, useEffect } from 'react';
import { useImmer } from 'use-immer';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToolVisit } from '@/stores/toolVisit';
import { CircleNotchIcon, FileTextIcon } from '@phosphor-icons/react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles from '@/components/shared/OutputFiles';
import { loadFormFields, fillAndFlattenForm, type FormField } from '@/lib/pdf/pdfFormFill';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import PDFFileBar from './PDFFileBar';
import { type ToolOp, IDLE_OP } from '@/lib/utils/toolState';

export default function PDFFormFillTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useToolVisit('pdf', '/pdf/fill-form');
  const [file, setFile] = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [op, updateOp] = useImmer<ToolOp>({ ...IDLE_OP });
  const { status, progress, output, error } = op;
  const [flatten, setFlatten] = useState(true);

  useEffect(() => {
    if (sessionFiles.length > 0 && !file) {
      try { addFile([sessionFiles[0]]); } catch {}
    }
  }, []);

  const addFile = async ([f]: File[]) => {
    const buffer = await f.arrayBuffer();
    setFile({ name: f.name, size: f.size, buffer });
    setSessionFiles([f]);
    setFields([]);
    setValues({});
    updateOp(() => ({ ...IDLE_OP }));
  };

  // Auto-load fields when file changes
  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    const load = async () => {
      updateOp(d => { d.status = 'loading'; d.error = ''; });
      try {
        const loadedFields = await loadFormFields(file.buffer);
        if (cancelled) return;
        setFields(loadedFields);

        // Initialise values from existing field values
        const initial: Record<string, string | boolean> = {};
        for (const field of loadedFields) {
          initial[field.name] = field.value;
        }
        setValues(initial);
        updateOp(d => { d.status = 'idle'; });
      } catch (e) {
        if (cancelled) return;
        updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to read form fields'; d.status = 'error'; });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [file]);

  const setValue = (name: string, val: string | boolean) => {
    setValues(prev => ({ ...prev, [name]: val }));
  };

  const download = async () => {
    if (!file) return;
    updateOp(d => { d.status = 'processing'; d.progress = 0; d.error = ''; });
    try {
      const blob = await fillAndFlattenForm(file.buffer, values, flatten, pct => updateOp(d => { d.progress = pct; }));
      const suffix = flatten ? '_filled_flat' : '_filled';
      updateOp(d => { d.output = [{ name: `${stripExtension(file.name)}${suffix}.pdf`, blob, size: blob.size }]; d.status = 'done'; });
    } catch (e) {
      updateOp(d => { d.error = e instanceof Error ? e.message : 'Failed to fill form'; d.status = 'error'; });
    }
  };

  const editableFields = fields.filter(f => !f.readOnly && f.type !== 'unknown');
  const readOnlyFields = fields.filter(f => f.readOnly && f.type !== 'unknown');

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={addFile}
          accept=".pdf,application/pdf"
          multiple={false}
          label="Drop a PDF form"
          sublabel="Fill interactive AcroForm fields and download"
        />
      ) : (
        <PDFFileBar file={file} onClear={() => { setFile(null); setFields([]); setValues({}); updateOp(() => ({ ...IDLE_OP })); clearSession(); }} />
      )}

      {/* Loading spinner while reading fields */}
      {status === 'loading' && (
        <Card className="p-6 flex items-center justify-center gap-3 text-muted-foreground">
          <CircleNotchIcon className="size-5 animate-spin text-brand-500" />
          <span className="text-sm">Reading form fields…</span>
        </Card>
      )}

      {/* Error state */}
      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {/* No fields found */}
      {file && status === 'idle' && fields.length === 0 && (
        <Card className="p-6 flex flex-col items-center gap-3 text-center">
          <FileTextIcon className="size-10 text-muted-foreground" />
          <div>
            <p className="font-medium text-foreground">No form fields found</p>
            <p className="text-sm text-muted-foreground mt-1">
              This PDF does not contain any interactive AcroForm fields.
            </p>
          </div>
        </Card>
      )}

      {/* Form fields */}
      {file && (status === 'idle' || status === 'processing' || status === 'done') && fields.length > 0 && (
        <Card>
          <CardContent className="pt-5 space-y-5">

            {/* Editable fields */}
            {editableFields.length > 0 && (
              <div className="space-y-4">
                {editableFields.map(field => (
                  <FieldInput
                    key={field.name}
                    field={field}
                    value={values[field.name] ?? field.value}
                    onChange={val => setValue(field.name, val)}
                  />
                ))}
              </div>
            )}

            {/* Read-only fields (collapsed, informational) */}
            {readOnlyFields.length > 0 && (
              <Accordion>
                <AccordionItem value="read-only">
                  <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:text-foreground hover:no-underline">
                    {readOnlyFields.length} read-only field{readOnlyFields.length !== 1 ? 's' : ''} (view only)
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 pl-4 border-l-2 border-border">
                      {readOnlyFields.map(field => (
                        <FieldInput
                          key={field.name}
                          field={field}
                          value={values[field.name] ?? field.value}
                          onChange={() => {}}
                          disabled
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Flatten toggle */}
            <div className="flex items-center gap-3 cursor-pointer select-none">
              <Checkbox
                checked={flatten}
                onCheckedChange={(checked) => setFlatten(checked === true)}
              />
              <span className="text-sm font-medium text-foreground">
                Flatten form
                <span className="ml-1.5 font-normal text-muted-foreground">
                  (bakes fields into the PDF so they cannot be edited further)
                </span>
              </span>
            </div>

            {status === 'processing' && <ProgressBar progress={progress} label="Filling PDF…" />}

            <Button
              onClick={download}
              disabled={status === 'processing'  }
              className="w-full"
            >
              {status === 'processing' ? 'Processing…' : 'Download Filled PDF'}
            </Button>
          </CardContent>
        </Card>
      )}

      {output.length > 0 && <OutputFiles files={output} />}
    </div>
  );
}

/* ---- Field renderer ---- */

interface FieldInputProps {
  field: FormField;
  value: string | boolean;
  onChange: (val: string | boolean) => void;
  disabled?: boolean;
}

function FieldInput({ field, value, onChange, disabled = false }: FieldInputProps) {
  const labelText = field.name.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-1">
      <Label className="flex items-baseline gap-1">
        <span>{labelText}</span>
        {field.required && (
          <span className="text-red-500 text-xs" title="Required">*</span>
        )}
        {disabled && (
          <span className="ml-auto text-xs font-normal text-muted-foreground italic">read-only</span>
        )}
      </Label>

      {field.type === 'text' && field.multiline && (
        <Textarea
          className={cn('resize-y min-h-[80px]')}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || field.readOnly}
          placeholder={`Enter ${labelText.toLowerCase()}…`}
          rows={3}
        />
      )}

      {field.type === 'text' && !field.multiline && (
        <Input
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || field.readOnly}
          placeholder={`Enter ${labelText.toLowerCase()}…`}
        />
      )}

      {field.type === 'checkbox' && (
        <div className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={typeof value === 'boolean' ? value : value === 'true'}
            onCheckedChange={(checked) => onChange(checked === true)}
            disabled={disabled || field.readOnly}
          />
          <span className="text-sm text-foreground">
            {typeof value === 'boolean' ? (value ? 'Checked' : 'Unchecked') : (value === 'true' ? 'Checked' : 'Unchecked')}
          </span>
        </div>
      )}

      {field.type === 'dropdown' && (
        <Select
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => { if (v !== null) onChange(v); }}
          disabled={disabled || field.readOnly}
        >
          <SelectTrigger>
            <SelectValue placeholder="— Select —" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map(opt => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.type === 'radio' && (
        <RadioGroup
          value={typeof value === 'string' ? value : ''}
          onValueChange={(v) => { if (v !== null) onChange(v); }}
          name={field.name}
          disabled={disabled || field.readOnly}
          readOnly={disabled || field.readOnly}
          className="flex flex-wrap gap-3"
        >
          {field.options?.map(opt => (
            <div
              key={opt}
              className={cn(
                'flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border text-sm transition-all',
                (disabled || field.readOnly) && 'cursor-not-allowed opacity-60',
                value === opt
                  ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                  : 'border-border text-foreground hover:border-border'
              )}
            >
              <RadioGroupItem value={opt} />
              {opt}
            </div>
          ))}
        </RadioGroup>
      )}

      {field.type === 'optionlist' && (
        <select
          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || field.readOnly}
          size={Math.min(5, field.options?.length ?? 1)}
        >
          {field.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {field.type === 'unknown' && (
        <Input
          type="text"
          className="opacity-60"
          value={typeof value === 'string' ? value : ''}
          disabled
          placeholder="Unknown field type"
        />
      )}
    </div>
  );
}
