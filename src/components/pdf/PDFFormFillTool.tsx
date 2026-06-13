import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useFileSession } from '@/stores/fileStore';
import { Loader2, FileText } from 'lucide-react';
import DropZone from '@/components/shared/DropZone';
import ProgressBar from '@/components/shared/ProgressBar';
import OutputFiles, { type OutputFile } from '@/components/shared/OutputFiles';
import { loadFormFields, fillAndFlattenForm, type FormField } from '@/lib/pdf/pdfFormFill';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { cn } from '@/lib/utils/cn';
import PDFFileBar from './PDFFileBar';

type Status = 'idle' | 'loading' | 'processing' | 'done' | 'error';

export default function PDFFormFillTool() {
  const { sessionFiles, setSessionFiles, clearSession } = useFileSession('pdf');
  const [file, setFile] = useState<{ name: string; size: number; buffer: ArrayBuffer } | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState<OutputFile[]>([]);
  const [error, setError] = useState('');
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
    setOutput([]);
    setError('');
    setStatus('idle');
  };

  // Auto-load fields when file changes
  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    const load = async () => {
      setStatus('loading');
      setError('');
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
        setStatus('idle');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to read form fields');
        setStatus('error');
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
    setStatus('processing');
    setProgress(0);
    setError('');
    try {
      const blob = await fillAndFlattenForm(file.buffer, values, flatten, setProgress);
      const suffix = flatten ? '_filled_flat' : '_filled';
      setOutput([{ name: `${stripExtension(file.name)}${suffix}.pdf`, blob, size: blob.size }]);
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fill form');
      setStatus('error');
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
        <PDFFileBar file={file} onClear={() => { setFile(null); setFields([]); setValues({}); setOutput([]); setStatus('idle'); clearSession(); }} />
      )}

      {/* Loading spinner while reading fields */}
      {status === 'loading' && (
        <div className="card p-6 flex items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin text-brand-500" />
          <span className="text-sm">Reading form fields…</span>
        </div>
      )}

      {/* Error state */}
      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
          {error}
        </p>
      )}

      {/* No fields found */}
      {file && status === 'idle' && fields.length === 0 && (
        <div className="card p-6 flex flex-col items-center gap-3 text-center">
          <FileText className="size-10 text-gray-300 dark:text-gray-600" />
          <div>
            <p className="font-medium text-gray-700 dark:text-gray-300">No form fields found</p>
            <p className="text-sm text-muted-foreground mt-1">
              This PDF does not contain any interactive AcroForm fields.
            </p>
          </div>
        </div>
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
              <details className="group">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-gray-700 dark:hover:text-gray-300 transition-colors select-none list-none flex items-center gap-1.5">
                  <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                  {readOnlyFields.length} read-only field{readOnlyFields.length !== 1 ? 's' : ''} (view only)
                </summary>
                <div className="mt-3 space-y-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
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
              </details>
            )}

            {/* Flatten toggle */}
            <label className="flex items-center gap-3 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={flatten}
                onChange={e => setFlatten(e.target.checked)}
                className="size-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Flatten form
                <span className="ml-1.5 font-normal text-muted-foreground">
                  (bakes fields into the PDF so they cannot be edited further)
                </span>
              </span>
            </label>

            {status === 'processing' && <ProgressBar progress={progress} label="Filling PDF…" />}

            <Button
              onClick={download}
              disabled={status === 'processing' || status === 'loading'}
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
      <label className="label flex items-baseline gap-1">
        <span>{labelText}</span>
        {field.required && (
          <span className="text-red-500 text-xs" title="Required">*</span>
        )}
        {disabled && (
          <span className="ml-auto text-xs font-normal text-muted-foreground italic">read-only</span>
        )}
      </label>

      {field.type === 'text' && field.multiline && (
        <textarea
          className={cn('input resize-y min-h-[80px]')}
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || field.readOnly}
          placeholder={`Enter ${labelText.toLowerCase()}…`}
          rows={3}
        />
      )}

      {field.type === 'text' && !field.multiline && (
        <input
          type="text"
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || field.readOnly}
          placeholder={`Enter ${labelText.toLowerCase()}…`}
        />
      )}

      {field.type === 'checkbox' && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={typeof value === 'boolean' ? value : value === 'true'}
            onChange={e => onChange(e.target.checked)}
            disabled={disabled || field.readOnly}
            className="size-4 rounded border-gray-300 dark:border-gray-600 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:cursor-not-allowed"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {typeof value === 'boolean' ? (value ? 'Checked' : 'Unchecked') : (value === 'true' ? 'Checked' : 'Unchecked')}
          </span>
        </label>
      )}

      {field.type === 'dropdown' && (
        <select
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || field.readOnly}
        >
          <option value="">— Select —</option>
          {field.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {field.type === 'radio' && (
        <div className="flex flex-wrap gap-3">
          {field.options?.map(opt => (
            <label
              key={opt}
              className={cn(
                'flex items-center gap-2 cursor-pointer px-3 py-2 rounded-xl border text-sm transition-all',
                (disabled || field.readOnly) && 'cursor-not-allowed opacity-60',
                value === opt
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
              )}
            >
              <input
                type="radio"
                name={field.name}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled || field.readOnly}
                className="sr-only"
              />
              <span className={cn(
                'size-3.5 rounded-full border-2 flex items-center justify-center',
                value === opt ? 'border-brand-500' : 'border-gray-300 dark:border-gray-600'
              )}>
                {value === opt && <span className="size-2 rounded-full bg-brand-500" />}
              </span>
              {opt}
            </label>
          ))}
        </div>
      )}

      {field.type === 'optionlist' && (
        <select
          className="input"
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
        <input
          type="text"
          className="input opacity-60"
          value={typeof value === 'string' ? value : ''}
          disabled
          placeholder="Unknown field type"
        />
      )}
    </div>
  );
}
