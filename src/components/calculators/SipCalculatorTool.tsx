'use client';

import { useMemo, useState } from 'react';
import { useImmer } from 'use-immer';
import { useDisclosure } from '@mantine/hooks';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { AreaChart, Area, XAxis, CartesianGrid } from 'recharts';
import { useToolVisit } from '@/stores/toolVisit';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { CaretDownIcon, CaretUpIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { computeSip, scheduleToCsv, scheduleToPdf, type SipInput } from '@/lib/calculators/sipCalculator';

interface State {
  monthlyInvestment: string;
  rate: string;
  years: string;
  stepUp: string;
}

const CHART_CONFIG = {
  totalInvested: { label: 'Invested', color: '#f59e0b' },
  value: { label: 'Value', color: '#10b981' },
} satisfies ChartConfig;

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SipCalculatorTool() {
  useToolVisit('calculators', '/calculators/sip-calculator');

  const [state, update] = useImmer<State>({
    monthlyInvestment: '5000',
    rate: '12',
    years: '10',
    stepUp: '0',
  });
  const [scheduleOpen, { toggle: toggleSchedule }] = useDisclosure(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const input: SipInput | null = useMemo(() => {
    const monthlyInvestment = parseFloat(state.monthlyInvestment);
    const annualRatePercent = parseFloat(state.rate);
    const years = parseFloat(state.years);
    const stepUpPercent = parseFloat(state.stepUp || '0');
    if (!(monthlyInvestment > 0) || !(years > 0) || isNaN(annualRatePercent) || annualRatePercent < 0) return null;
    if (isNaN(stepUpPercent) || stepUpPercent < 0) return null;
    return { monthlyInvestment, annualRatePercent, years: Math.round(years), stepUpPercent };
  }, [state.monthlyInvestment, state.rate, state.years, state.stepUp]);

  const result = useMemo(() => (input ? computeSip(input) : null), [input]);

  const chartData = useMemo(() => {
    if (!result) return [];
    return result.schedule.map(row => ({
      year: `Y${row.year}`,
      totalInvested: row.totalInvested,
      value: row.value,
    }));
  }, [result]);

  async function handleExport(format: 'csv' | 'pdf') {
    if (!input || !result) return;
    setExporting(format);
    try {
      if (format === 'csv') {
        downloadBlob(scheduleToCsv(result), 'sip-schedule.csv');
      } else {
        const blob = await scheduleToPdf(input, result);
        downloadBlob(blob, 'sip-schedule.pdf');
      }
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5 pb-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="monthlyInvestment">Monthly Investment</Label>
              <Input
                id="monthlyInvestment"
                type="number"
                inputMode="decimal"
                value={state.monthlyInvestment}
                onChange={e => update(d => { d.monthlyInvestment = e.target.value; })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">Expected Annual Return (%)</Label>
              <Input
                id="rate"
                type="number"
                inputMode="decimal"
                value={state.rate}
                onChange={e => update(d => { d.rate = e.target.value; })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="years">Duration (years)</Label>
              <Input
                id="years"
                type="number"
                inputMode="decimal"
                value={state.years}
                onChange={e => update(d => { d.years = e.target.value; })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stepUp">Annual Step-Up (%)</Label>
              <Input
                id="stepUp"
                type="number"
                inputMode="decimal"
                value={state.stepUp}
                onChange={e => update(d => { d.stepUp = e.target.value; })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {result && input && (
        <>
          <Card>
            <CardContent className="pt-5 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Invested</p>
                  <p className="text-xl font-semibold text-foreground">{formatMoney(result.totalInvested)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Wealth Gained</p>
                  <p className="text-xl font-semibold text-foreground">{formatMoney(result.wealthGained)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Maturity Value</p>
                  <p className="text-xl font-semibold text-brand-500">{formatMoney(result.maturityValue)}</p>
                </div>
              </div>
              <ChartContainer config={CHART_CONFIG} className="w-full h-56">
                <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="year" tickLine={false} axisLine={false} tickMargin={8} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="totalInvested" type="monotone" fill="var(--color-totalInvested)" fillOpacity={0.2} stroke="var(--color-totalInvested)" strokeWidth={2} />
                  <Area dataKey="value" type="monotone" fill="var(--color-value)" fillOpacity={0.2} stroke="var(--color-value)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 pb-4 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <button
                  onClick={toggleSchedule}
                  className="flex items-center gap-1.5 text-sm font-semibold hover:text-brand-500 transition-colors"
                >
                  {scheduleOpen ? <CaretUpIcon className="size-4" /> : <CaretDownIcon className="size-4" />}
                  Year-wise Growth ({input.years} years)
                </button>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleExport('csv')} disabled={exporting !== null} className="gap-1.5">
                    <DownloadSimpleIcon className="size-3.5" />
                    {exporting === 'csv' ? 'Exporting…' : 'CSV'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleExport('pdf')} disabled={exporting !== null} className="gap-1.5">
                    <DownloadSimpleIcon className="size-3.5" />
                    {exporting === 'pdf' ? 'Exporting…' : 'PDF'}
                  </Button>
                </div>
              </div>

              {scheduleOpen && (
                <div className="max-h-96 overflow-y-auto rounded-md border border-border">
                  <Table className="text-xs">
                    <TableHeader className="bg-secondary sticky top-0">
                      <TableRow>
                        <TableHead className="text-muted-foreground">Year</TableHead>
                        <TableHead className="text-right text-muted-foreground">Invested This Year</TableHead>
                        <TableHead className="text-right text-muted-foreground">Total Invested</TableHead>
                        <TableHead className="text-right text-muted-foreground">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.schedule.map(row => (
                        <TableRow key={row.year}>
                          <TableCell className="text-muted-foreground font-mono">{row.year}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.invested)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.totalInvested)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
