import { useMemo, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';
import { ChartBarIcon, DownloadSimpleIcon, FileCsvIcon, XIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import DropZone from '@/components/shared/DropZone';
import { useToolVisit } from '@/stores/toolVisit';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { formatFileSize, stripExtension } from '@/lib/utils/fileUtils';
import { MAX_CSV_BYTES, columnLabel, headerNames, type Grid } from '@/lib/csv/csv';
import { readLargeCsvFile } from '@/lib/csv/largeCsv';
import {
  OTHER_LABEL, buildSeries, numericColumns, type Aggregation, type ChartType, type SeriesSort,
} from '@/lib/csv/chart';
import { pngBlob, serializeChart, svgBlob } from '@/components/csv/chartExport';

// Theme-aware series palette (light / dark), emerald brand first.
const PALETTE: { light: string; dark: string }[] = [
  { light: '#059669', dark: '#10b981' },
  { light: '#2563eb', dark: '#60a5fa' },
  { light: '#d97706', dark: '#fbbf24' },
  { light: '#db2777', dark: '#f472b6' },
  { light: '#7c3aed', dark: '#a78bfa' },
  { light: '#0891b2', dark: '#22d3ee' },
  { light: '#65a30d', dark: '#a3e635' },
  { light: '#dc2626', dark: '#f87171' },
];
const OTHER_COLOR = { light: '#a3a3a3', dark: '#525252' };

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'horizontal-bar', label: 'Horizontal bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
];
const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: 'none', label: 'None (one point per row)' },
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
  { value: 'count', label: 'Count rows' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];
const SORTS: { value: SeriesSort; label: string }[] = [
  { value: 'original', label: 'File order' },
  { value: 'value-desc', label: 'Value, high → low' },
  { value: 'value-asc', label: 'Value, low → high' },
  { value: 'label', label: 'Label A → Z' },
];

const DEFAULT_TOP_N = 20;

const truncate = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function CsvChartTool() {
  useToolVisit('csv', '/csv/chart');

  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Grid>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [chartType, setChartType] = useState<ChartType>('bar');
  const [labelCol, setLabelCol] = useState(0);
  const [valueCols, setValueCols] = useState<number[]>([]);
  const [aggregation, setAggregation] = useState<Aggregation>('none');
  const [sort, setSort] = useState<SeriesSort>('original');
  const [topN, setTopN] = useState(String(DEFAULT_TOP_N));
  const [other, setOther] = useState(true);
  const [title, setTitle] = useState('');
  const [exportError, setExportError] = useState('');
  const chartRef = useRef<HTMLDivElement>(null);

  const header = useMemo(
    () => (hasHeader ? headerNames(rows) : (rows[0] ?? []).map((_, i) => `Column ${columnLabel(i)}`)),
    [rows, hasHeader],
  );
  const body = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const numeric = useMemo(() => numericColumns(body), [body]);

  /** Pick a text label column and the first numeric value column. */
  const applyDefaults = (data: Grid) => {
    const nums = numericColumns(data);
    const width = data[0]?.length ?? 0;
    const label = Array.from({ length: width }, (_, i) => i).find(i => !nums.includes(i)) ?? 0;
    setLabelCol(label);
    setValueCols(nums.filter(c => c !== label).slice(0, 1));
  };

  const handleFile = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setRows([]);
    setError('');
    setExportError('');
    setLoading(true);
    try {
      const { rows: parsed } = await readLargeCsvFile(f, MAX_CSV_BYTES);
      setRows(parsed);
      applyDefaults(hasHeader ? parsed.slice(1) : parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this file.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setRows([]);
    setError('');
  };

  const toggleHeader = (checked: boolean) => {
    setHasHeader(checked);
    applyDefaults(checked ? rows.slice(1) : rows);
  };

  const isPie = chartType === 'pie';
  const isCount = aggregation === 'count';
  const valueChoices = numeric.filter(c => c !== labelCol);
  const activeValues = useMemo(() => {
    const cols = valueCols.filter(c => c !== labelCol && numeric.includes(c));
    return isPie ? cols.slice(0, 1) : cols;
  }, [valueCols, labelCol, numeric, isPie]);

  const limit = Math.max(0, Math.floor(Number(topN))) || DEFAULT_TOP_N;

  const series = useMemo(() => {
    if (body.length === 0 || (!isCount && activeValues.length === 0)) return null;
    return buildSeries(body, {
      labelCol,
      valueCols: activeValues,
      aggregation,
      sort,
      topN: limit,
      other: isPie && other,
      positiveOnly: isPie,
    });
  }, [body, labelCol, activeValues, aggregation, sort, limit, isPie, other, isCount]);

  const seriesNames = useMemo(
    () => (isCount ? ['Count'] : activeValues.map(c => header[c])),
    [isCount, activeValues, header],
  );

  const config = useMemo<ChartConfig>(() => {
    if (!series) return {};
    if (isPie) {
      return Object.fromEntries(series.points.map((p, i) => [
        `s${i}`,
        { label: p.label, theme: p.label === OTHER_LABEL && i === series.points.length - 1 && series.truncated > 0 ? OTHER_COLOR : PALETTE[i % PALETTE.length] },
      ]));
    }
    return Object.fromEntries(series.keys.map((k, i) => [k, { label: seriesNames[i], theme: PALETTE[i % PALETTE.length] }]));
  }, [series, isPie, seriesNames]);

  const pieData = useMemo(
    () => (isPie && series ? series.points.map((p, i) => ({ ...p, fill: `var(--color-s${i})` })) : []),
    [isPie, series],
  );

  const toggleValue = (col: number, checked: boolean) => {
    if (isPie) setValueCols(checked ? [col] : []);
    else setValueCols(cols => (checked ? [...cols.filter(c => c !== col), col].sort((a, b) => a - b) : cols.filter(c => c !== col)));
  };

  const baseName = (title.trim() || (file ? `${stripExtension(file.name)}-chart` : 'chart'))
    .replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'chart';

  const exportChart = async (format: 'png' | 'svg') => {
    setExportError('');
    const svg = chartRef.current?.querySelector<SVGSVGElement>('.recharts-wrapper > svg');
    if (!svg || !series) return;
    const styles = getComputedStyle(chartRef.current!);
    const legend = !isPie && series.keys.length > 1
      ? series.keys.map((k, i) => ({ label: seriesNames[i], color: styles.getPropertyValue(`--color-${k}`).trim() }))
      : undefined;
    try {
      const out = serializeChart(svg, { title: title.trim() || undefined, legend });
      const blob = format === 'svg' ? svgBlob(out) : await pngBlob(out, 2);
      downloadBlob(blob, `${baseName}.${format}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed.');
    }
  };

  const pointCount = series?.points.length ?? 0;
  const horizontal = chartType === 'horizontal-bar';
  const chartHeight = horizontal ? Math.max(320, pointCount * 28 + 60) : 360;
  const longestLabel = (series?.points ?? []).reduce((m, p) => Math.max(m, truncate(p.label).length), 0);

  return (
    <div className="space-y-5">
      {!file ? (
        <DropZone
          onFiles={handleFile}
          accept=".csv,.tsv,.txt"
          multiple={false}
          label="Drop a CSV file"
          sublabel="Accepts .csv, .tsv, .txt · stays on your device"
        />
      ) : (
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="flex items-center gap-3">
              <FileCsvIcon className="size-6 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                  {rows.length > 0 && ` · ${body.length.toLocaleString()} rows × ${header.length} columns`}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Remove file" onClick={reset}
                className="shrink-0 text-muted-foreground hover:text-red-500">
                <XIcon className="size-4" />
              </Button>
            </div>

            {loading && <p className="text-sm text-muted-foreground" role="status">Reading file…</p>}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">
                {error}
              </p>
            )}

            {rows.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Checkbox id="csv-chart-header" checked={hasHeader} onCheckedChange={toggleHeader} />
                  <Label htmlFor="csv-chart-header" className="font-normal cursor-pointer">First row is header</Label>
                </div>

                {numeric.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                    <ChartBarIcon className="size-8 text-muted-foreground" />
                    <p className="font-medium text-foreground">No numeric columns found</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Charts need at least one column whose values are numbers (like 42, 1,234.50 or $9.99).
                      {hasHeader ? '' : ' Try ticking “First row is header”.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Chart type">
                        <Select value={chartType} onValueChange={v => v && setChartType(v as ChartType)}>
                          <SelectTrigger aria-label="Chart type" className="w-full">
                            <SelectValue>{(v: ChartType) => CHART_TYPES.find(t => t.value === v)?.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {CHART_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label={isPie ? 'Slice labels' : 'Labels (X axis)'}>
                        <Select value={String(labelCol)} onValueChange={v => v && setLabelCol(Number(v))}>
                          <SelectTrigger aria-label="Label column" className="w-full">
                            <SelectValue>{(v: string) => header[Number(v)]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {header.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="When labels repeat">
                        <Select value={aggregation} onValueChange={v => v && setAggregation(v as Aggregation)}>
                          <SelectTrigger aria-label="Aggregation" className="w-full">
                            <SelectValue>{(v: Aggregation) => AGGREGATIONS.find(a => a.value === v)?.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {AGGREGATIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Sort">
                        <Select value={sort} onValueChange={v => v && setSort(v as SeriesSort)}>
                          <SelectTrigger aria-label="Sort" className="w-full">
                            <SelectValue>{(v: SeriesSort) => SORTS.find(s => s.value === v)?.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {SORTS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Show at most" htmlFor="csv-chart-topn">
                        <Input id="csv-chart-topn" type="number" min={1} inputMode="numeric" value={topN}
                          onChange={e => setTopN(e.target.value)} />
                      </Field>
                      <Field label="Chart title" htmlFor="csv-chart-title">
                        <Input id="csv-chart-title" value={title} placeholder="Optional" onChange={e => setTitle(e.target.value)} />
                      </Field>
                    </div>

                    {!isCount && (
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-foreground">
                          {isPie ? 'Value column (pick one)' : 'Value columns'}
                        </legend>
                        {valueChoices.length === 0 ? (
                          <p className="text-sm text-muted-foreground">The only numeric column is being used for labels.</p>
                        ) : (
                          <div className="flex flex-wrap gap-x-5 gap-y-2">
                            {valueChoices.map(c => (
                              <div key={c} className="flex items-center gap-2">
                                <Checkbox id={`csv-chart-value-${c}`} checked={activeValues.includes(c)}
                                  onCheckedChange={ch => toggleValue(c, ch)} />
                                <Label htmlFor={`csv-chart-value-${c}`} className="font-normal cursor-pointer">{header[c]}</Label>
                              </div>
                            ))}
                          </div>
                        )}
                      </fieldset>
                    )}

                    {isPie && (
                      <div className="flex items-center gap-2">
                        <Checkbox id="csv-chart-other" checked={other} onCheckedChange={setOther} />
                        <Label htmlFor="csv-chart-other" className="font-normal cursor-pointer">Group the rest as “Other”</Label>
                      </div>
                    )}

                    {!series || series.points.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-3 py-10 text-center rounded-xl border border-dashed border-border">
                        {!isCount && activeValues.length === 0 ? 'Pick a value column to draw the chart.' : 'Nothing to chart — no numeric values in the selected columns.'}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <figure className="space-y-2" aria-label={title.trim() || 'Chart'}>
                          {title.trim() && <figcaption className="text-center font-semibold text-foreground">{title.trim()}</figcaption>}
                          <ChartContainer ref={chartRef} config={config} className="aspect-auto w-full" style={{ height: chartHeight }}>
                            {isPie ? (
                              <PieChart>
                                <ChartTooltip content={<ChartTooltipContent nameKey="label" hideLabel />} />
                                <Pie data={pieData} dataKey={series.keys[0]} nameKey="label" outerRadius="70%"
                                  isAnimationActive={false} label={({ name }) => truncate(String(name))} />
                              </PieChart>
                            ) : chartType === 'line' ? (
                              <LineChart data={series.points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickLine={false} tickFormatter={v => truncate(String(v))} />
                                <YAxis tickLine={false} axisLine={false} width="auto" />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                {series.keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                                {series.keys.map(k => (
                                  <Line key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} strokeWidth={2}
                                    dot={pointCount <= 40} connectNulls isAnimationActive={false} />
                                ))}
                              </LineChart>
                            ) : chartType === 'area' ? (
                              <AreaChart data={series.points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                                <CartesianGrid vertical={false} />
                                <XAxis dataKey="label" tickLine={false} tickFormatter={v => truncate(String(v))} />
                                <YAxis tickLine={false} axisLine={false} width="auto" />
                                <ChartTooltip content={<ChartTooltipContent />} />
                                {series.keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                                {series.keys.map(k => (
                                  <Area key={k} dataKey={k} type="monotone" stroke={`var(--color-${k})`} fill={`var(--color-${k})`}
                                    fillOpacity={0.25} strokeWidth={2} connectNulls isAnimationActive={false} />
                                ))}
                              </AreaChart>
                            ) : (
                              <BarChart data={series.points} layout={horizontal ? 'vertical' : 'horizontal'}
                                margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                                <CartesianGrid vertical={horizontal} horizontal={!horizontal} />
                                {horizontal ? (
                                  <>
                                    <XAxis type="number" tickLine={false} />
                                    <YAxis type="category" dataKey="label" tickLine={false} axisLine={false}
                                      width={Math.min(140, longestLabel * 7 + 12)} interval={0}
                                      tickFormatter={v => truncate(String(v))} />
                                  </>
                                ) : (
                                  <>
                                    <XAxis dataKey="label" tickLine={false} tickFormatter={v => truncate(String(v))} />
                                    <YAxis tickLine={false} axisLine={false} width="auto" />
                                  </>
                                )}
                                <ChartTooltip content={<ChartTooltipContent />} />
                                {series.keys.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                                {series.keys.map(k => (
                                  <Bar key={k} dataKey={k} fill={`var(--color-${k})`} radius={3} isAnimationActive={false} />
                                ))}
                              </BarChart>
                            )}
                          </ChartContainer>
                        </figure>

                        <ul className="text-xs text-muted-foreground space-y-0.5">
                          <li>{pointCount.toLocaleString()} {pointCount === 1 ? 'point' : 'points'}{isPie ? ' (slices)' : ''} plotted.</li>
                          {series.skipped > 0 && (
                            <li>{series.skipped.toLocaleString()} {series.skipped === 1 ? 'value was' : 'values were'} skipped (empty or not a number).</li>
                          )}
                          {series.nonPositive > 0 && (
                            <li>{series.nonPositive.toLocaleString()} zero or negative {series.nonPositive === 1 ? 'value' : 'values'} left out of the pie.</li>
                          )}
                          {series.truncated > 0 && (
                            <li>
                              {isPie && other
                                ? `${series.truncated.toLocaleString()} more items grouped into “Other”.`
                                : `Showing the first ${fmt(limit)} — ${series.truncated.toLocaleString()} more hidden by the limit.`}
                            </li>
                          )}
                        </ul>

                        {exportError && (
                          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-4 py-3 rounded-xl">{exportError}</p>
                        )}

                        <div className="flex flex-wrap gap-3">
                          <Button onClick={() => exportChart('png')}>
                            <DownloadSimpleIcon className="size-3.5" />
                            Download PNG
                          </Button>
                          <Button variant="secondary" onClick={() => exportChart('svg')}>
                            <DownloadSimpleIcon className="size-3.5" />
                            Download SVG
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
