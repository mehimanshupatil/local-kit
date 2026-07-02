'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useImmer } from 'use-immer';
import { useClipboard, useInterval } from '@mantine/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToolVisit } from '@/stores/toolVisit';
import {
  CheckIcon, CopyIcon, ClockIcon, ArrowsClockwiseIcon,
  CalendarIcon, MagnifyingGlassIcon, CaretDownIcon,
} from '@phosphor-icons/react';
import {
  detectPrecision, toMs, fromMs, formatEpoch, dateToEpoch, getIanaTimezones,
  type Precision, type EpochFormats,
} from '@/lib/dev/epochConverter';
import dayjs from 'dayjs';

const PRECISION_OPTIONS: { label: string; value: Precision | 'auto' }[] = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'Seconds (s)', value: 's' },
  { label: 'Milliseconds (ms)', value: 'ms' },
  { label: 'Microseconds (µs)', value: 'µs' },
  { label: 'Nanoseconds (ns)', value: 'ns' },
];

const CUSTOM_TZ_KEY = 'localkit-epoch-tz';
const DEFAULT_TZ = 'America/New_York';

// ─── helpers ───────────────────────────────────────────────────────────────

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const clipboard = useClipboard({ timeout: 1500 });
  return (
    <button
      onClick={() => clipboard.copy(value)}
      className="flex items-center justify-between w-full rounded border border-border px-3 py-2.5 hover:bg-secondary transition-colors group text-left"
      title={`Copy ${label}`}
    >
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-0.5">{label}</p>
        <p className={`text-sm text-foreground truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
      <span className="text-muted-foreground group-hover:text-foreground transition-colors ml-3 shrink-0">
        {clipboard.copied
          ? <CheckIcon className="size-4 text-brand-500" />
          : <CopyIcon className="size-4" />}
      </span>
    </button>
  );
}

function ClockButton({ value, label }: { value: string; label: string }) {
  const clipboard = useClipboard({ timeout: 1500 });
  return (
    <button
      onClick={() => clipboard.copy(value)}
      className="flex items-center gap-2 rounded border border-border px-3 py-2 hover:bg-secondary transition-colors group"
      title={`Copy epoch in ${label}`}
    >
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold w-5">{label}</span>
      <span className="font-mono text-sm text-foreground">{value}</span>
      <span className="text-muted-foreground group-hover:text-foreground transition-colors ml-1 shrink-0">
        {clipboard.copied ? <CheckIcon className="size-3.5 text-brand-500" /> : <CopyIcon className="size-3.5" />}
      </span>
    </button>
  );
}

function LiveClock() {
  const [now, setNow] = useState<number>(Date.now());
  useInterval(() => setNow(Date.now()), 1000);
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <ClockIcon className="size-4 text-brand-500" />
          <span className="text-sm font-semibold">Current Epoch</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['s', 'ms', 'µs', 'ns'] as Precision[]).map(p => (
            <ClockButton key={p} value={String(fromMs(now, p))} label={p} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Searchable timezone picker ─────────────────────────────────────────────

function TimezoneSelect({
  value,
  onChange,
  label = 'Timezone',
}: {
  value: string;
  onChange: (tz: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const allZones = useMemo(() => getIanaTimezones(), []);

  const filtered = useMemo(() =>
    search
      ? allZones.filter(z => z.toLowerCase().includes(search.toLowerCase())).slice(0, 150)
      : allZones.slice(0, 300),
    [search, allZones]
  );

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  function select(tz: string) {
    onChange(tz);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <PopoverTrigger
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2.5 py-2 text-sm shadow-xs hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate text-left">{value}</span>
          <CaretDownIcon className="size-4 text-muted-foreground shrink-0 ml-2" />
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-72 p-0" side="bottom" align="start">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <MagnifyingGlassIcon className="size-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder="Search timezone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">No results</p>
          )}
          {filtered.map(tz => (
            <button
              key={tz}
              onClick={() => select(tz)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-accent transition-colors ${tz === value ? 'text-brand-500 font-medium' : ''}`}
            >
              {tz === value && <CheckIcon className="size-3.5 shrink-0" />}
              <span className={tz === value ? '' : 'pl-5'}>{tz}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Date + time picker ─────────────────────────────────────────────────────

function DateTimePicker({
  value,
  onChange,
}: {
  value: { date: Date | undefined; hour: string; minute: string; second: string };
  onChange: (v: { date: Date | undefined; hour: string; minute: string; second: string }) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = value.date
    ? `${dayjs(value.date).format('MMM D, YYYY')} ${value.hour.padStart(2, '0')}:${value.minute.padStart(2, '0')}:${value.second.padStart(2, '0')}`
    : 'Pick a date…';

  function clamp(v: string, max: number) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return '0';
    return String(Math.min(max, Math.max(0, n)));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="space-y-1.5 flex-1 min-w-48">
        <Label>Date &amp; Time</Label>
        <PopoverTrigger className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-2.5 py-2 text-sm font-mono shadow-xs hover:bg-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className={value.date ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          <CalendarIcon className="size-4 text-muted-foreground shrink-0 ml-2" />
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0" side="bottom" align="start">
        <Calendar
          mode="single"
          selected={value.date}
          onSelect={date => onChange({ ...value, date: date ?? undefined })}
        />
        <div className="border-t border-border px-3 py-3 flex items-center gap-2">
          <Label className="text-xs shrink-0 text-muted-foreground">Time</Label>
          <Input
            className="h-8 w-14 text-center font-mono text-sm px-1"
            placeholder="HH"
            value={value.hour}
            maxLength={2}
            onChange={e => onChange({ ...value, hour: e.target.value })}
            onBlur={e => onChange({ ...value, hour: clamp(e.target.value, 23) })}
          />
          <span className="text-muted-foreground">:</span>
          <Input
            className="h-8 w-14 text-center font-mono text-sm px-1"
            placeholder="MM"
            value={value.minute}
            maxLength={2}
            onChange={e => onChange({ ...value, minute: e.target.value })}
            onBlur={e => onChange({ ...value, minute: clamp(e.target.value, 59) })}
          />
          <span className="text-muted-foreground">:</span>
          <Input
            className="h-8 w-14 text-center font-mono text-sm px-1"
            placeholder="SS"
            value={value.second}
            maxLength={2}
            onChange={e => onChange({ ...value, second: e.target.value })}
            onBlur={e => onChange({ ...value, second: clamp(e.target.value, 59) })}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main tool ──────────────────────────────────────────────────────────────

interface State {
  epochInput: string;
  precisionMode: Precision | 'auto';
  customTz: string;
  formats: EpochFormats | null;
  parseError: string;

  datePicker: { date: Date | undefined; hour: string; minute: string; second: string };
  dateTz: string;
  dateResult: number | null;
  dateError: string;
}

export default function EpochConverterTool() {
  useToolVisit('dev', '/dev/epoch-converter');

  const epochCardRef = useRef<HTMLDivElement>(null);
  const dateCardRef = useRef<HTMLDivElement>(null);

  const localTzName = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [state, update] = useImmer<State>({
    epochInput: '',
    precisionMode: 'auto',
    customTz: DEFAULT_TZ,
    formats: null,
    parseError: '',
    datePicker: { date: undefined, hour: '0', minute: '0', second: '0' },
    dateTz: 'UTC',
    dateResult: null,
    dateError: '',
  });

  useEffect(() => {
    const saved = localStorage.getItem(CUSTOM_TZ_KEY);
    if (saved) update(d => { d.customTz = saved; });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t');
    if (t) {
      update(d => { d.epochInput = t; });
      parseEpoch(t, 'auto', state.customTz);
    }
  }, []);

  // ── epoch → date ──

  function parseEpoch(raw: string, mode: Precision | 'auto', tz: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      update(d => { d.formats = null; d.parseError = ''; });
      return;
    }
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      update(d => { d.parseError = 'Enter a numeric epoch value'; d.formats = null; });
      return;
    }
    const precision = mode === 'auto' ? detectPrecision(trimmed) : mode;
    const ms = toMs(trimmed, precision);
    try {
      const formats = formatEpoch(ms, tz);
      update(d => { d.formats = formats; d.parseError = ''; });
    } catch {
      update(d => { d.parseError = 'Invalid epoch or timezone'; d.formats = null; });
    }
  }

  function handleEpochInput(val: string) {
    update(d => { d.epochInput = val; });
    const url = new URL(window.location.href);
    if (val.trim()) url.searchParams.set('t', val.trim());
    else url.searchParams.delete('t');
    window.history.replaceState(null, '', url.toString());
    parseEpoch(val, state.precisionMode, state.customTz);
    epochCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handlePrecisionChange(val: Precision | 'auto') {
    update(d => { d.precisionMode = val; });
    parseEpoch(state.epochInput, val, state.customTz);
  }

  function handleCustomTzChange(tz: string) {
    update(d => { d.customTz = tz; });
    localStorage.setItem(CUSTOM_TZ_KEY, tz);
    parseEpoch(state.epochInput, state.precisionMode, tz);
  }

  // ── date → epoch ──

  function computeDateResult(
    picker: State['datePicker'],
    tz: string,
  ): { ms: number | null; error: string } {
    if (!picker.date) return { ms: null, error: '' };
    const h = parseInt(picker.hour, 10) || 0;
    const m = parseInt(picker.minute, 10) || 0;
    const s = parseInt(picker.second, 10) || 0;
    const isoStr = dayjs(picker.date).format('YYYY-MM-DD') + `T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const ms = dateToEpoch(isoStr, tz);
    if (ms === null) return { ms: null, error: 'Could not parse date/time' };
    return { ms, error: '' };
  }

  function handleDatePickerChange(picker: State['datePicker']) {
    update(d => { d.datePicker = picker; });
    const { ms, error } = computeDateResult(picker, state.dateTz);
    update(d => { d.dateResult = ms; d.dateError = error; });
    dateCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function handleDateTzChange(tz: string) {
    update(d => { d.dateTz = tz; });
    const { ms, error } = computeDateResult(state.datePicker, tz);
    update(d => { d.dateResult = ms; d.dateError = error; });
  }

  function useEpochFromDate() {
    if (state.dateResult === null) return;
    const val = String(state.dateResult);
    update(d => { d.epochInput = val; });
    const url = new URL(window.location.href);
    url.searchParams.set('t', val);
    window.history.replaceState(null, '', url.toString());
    parseEpoch(val, state.precisionMode, state.customTz);
  }

  const activePrecision =
    state.precisionMode === 'auto' && state.epochInput.trim()
      ? detectPrecision(state.epochInput.trim())
      : state.precisionMode === 'auto' ? null : state.precisionMode;

  return (
    <div className="space-y-4">
      <LiveClock />

      {/* Epoch → Date */}
      <div ref={epochCardRef}>
        <Card>
          <CardContent className="pt-5 pb-4 space-y-4">
            <p className="text-sm font-semibold">Epoch → Date</p>

            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-48 space-y-1.5">
                <Label htmlFor="epoch-input">Epoch value</Label>
                <Input
                  id="epoch-input"
                  className="font-mono"
                  placeholder="1751462400000"
                  value={state.epochInput}
                  onChange={e => handleEpochInput(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 w-52">
                <Label>Precision</Label>
                <Select value={state.precisionMode} onValueChange={v => v && handlePrecisionChange(v as Precision | 'auto')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRECISION_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {state.precisionMode === 'auto' && activePrecision && (
              <p className="text-xs text-muted-foreground">Detected: <span className="font-mono text-foreground">{activePrecision}</span></p>
            )}
            {state.parseError && (
              <p className="text-xs text-destructive">{state.parseError}</p>
            )}

            {state.formats && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">UTC</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CopyRow label="ISO 8601" value={state.formats.utcIso} />
                    <CopyRow label="Locale" value={state.formats.utcLocale} mono={false} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Local ({localTzName})</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CopyRow label="ISO 8601" value={state.formats.localIso} />
                    <CopyRow label="Locale" value={state.formats.localLocale} mono={false} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <TimezoneSelect value={state.customTz} onChange={handleCustomTzChange} label="Custom timezone" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    <CopyRow label="ISO 8601" value={state.formats.customIso} />
                    <CopyRow label="Locale" value={state.formats.customLocale} mono={false} />
                  </div>
                </div>

                <Separator />

                <CopyRow label="Relative time" value={state.formats.relative} mono={false} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Date → Epoch */}
      <div ref={dateCardRef}>
        <Card>
          <CardContent className="pt-5 pb-4 space-y-4">
            <p className="text-sm font-semibold">Date → Epoch</p>

            <div className="flex flex-wrap gap-3 items-end">
              <DateTimePicker
                value={state.datePicker}
                onChange={handleDatePickerChange}
              />
              <div className="w-56">
                <TimezoneSelect value={state.dateTz} onChange={handleDateTzChange} label="Interpret as" />
              </div>
            </div>

            {state.dateError && (
              <p className="text-xs text-destructive">{state.dateError}</p>
            )}

            {state.dateResult !== null && (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(['s', 'ms', 'µs', 'ns'] as Precision[]).map(p => (
                    <CopyRow key={p} label={`Epoch (${p})`} value={String(fromMs(state.dateResult!, p))} />
                  ))}
                </div>
                <Button variant="outline" size="sm" onClick={useEpochFromDate} className="gap-2">
                  <ArrowsClockwiseIcon className="size-4" />
                  Use this epoch above
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
