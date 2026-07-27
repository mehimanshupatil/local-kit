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
import { PieChart, Pie } from 'recharts';
import { useToolVisit } from '@/stores/toolVisit';
import { downloadBlob } from '@/lib/utils/downloadUtils';
import { CaretDownIcon, CaretUpIcon, DownloadSimpleIcon } from '@phosphor-icons/react';
import { computeEmi, scheduleToCsv, scheduleToPdf, type EmiInput } from '@/lib/calculators/emiCalculator';

type TenureUnit = 'years' | 'months';

interface State {
  principal: string;
  rate: string;
  tenure: string;
  tenureUnit: TenureUnit;
}

const CHART_CONFIG = {
  principal: { label: 'Principal', color: '#10b981' },
  interest: { label: 'Interest', color: '#f59e0b' },
} satisfies ChartConfig;

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EmiCalculatorTool() {
  useToolVisit('calculators', '/calculators/emi-calculator');

  const [state, update] = useImmer<State>({
    principal: '1000000',
    rate: '9',
    tenure: '20',
    tenureUnit: 'years',
  });
  const [scheduleOpen, { toggle: toggleSchedule }] = useDisclosure(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

  const input: EmiInput | null = useMemo(() => {
    const principal = parseFloat(state.principal);
    const annualRatePercent = parseFloat(state.rate);
    const tenureRaw = parseFloat(state.tenure);
    if (!(principal > 0) || !(tenureRaw > 0) || isNaN(annualRatePercent) || annualRatePercent < 0) return null;
    const tenureMonths = Math.round(state.tenureUnit === 'years' ? tenureRaw * 12 : tenureRaw);
    if (tenureMonths < 1) return null;
    return { principal, annualRatePercent, tenureMonths };
  }, [state.principal, state.rate, state.tenure, state.tenureUnit]);

  const result = useMemo(() => (input ? computeEmi(input) : null), [input]);

  const chartData = useMemo(() => {
    if (!result || !input) return [];
    return [
      { key: 'principal', label: 'Principal', value: input.principal, fill: 'var(--color-principal)' },
      { key: 'interest', label: 'Interest', value: result.totalInterest, fill: 'var(--color-interest)' },
    ];
  }, [result, input]);

  async function handleExport(format: 'csv' | 'pdf') {
    if (!input || !result) return;
    setExporting(format);
    try {
      if (format === 'csv') {
        downloadBlob(scheduleToCsv(result), 'emi-schedule.csv');
      } else {
        const blob = await scheduleToPdf(input, result);
        downloadBlob(blob, 'emi-schedule.pdf');
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
              <Label htmlFor="principal">Principal</Label>
              <Input
                id="principal"
                type="number"
                inputMode="decimal"
                value={state.principal}
                onChange={e => update(d => { d.principal = e.target.value; })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rate">Annual Interest Rate (%)</Label>
              <Input
                id="rate"
                type="number"
                inputMode="decimal"
                value={state.rate}
                onChange={e => update(d => { d.rate = e.target.value; })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="tenure">Tenure</Label>
              <div className="flex gap-2">
                <Input
                  id="tenure"
                  type="number"
                  inputMode="decimal"
                  className="flex-1"
                  value={state.tenure}
                  onChange={e => update(d => { d.tenure = e.target.value; })}
                />
                <div className="flex rounded-md border border-input overflow-hidden shrink-0">
                  {(['years', 'months'] as TenureUnit[]).map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => update(d => { d.tenureUnit = unit; })}
                      className={`px-3 text-sm capitalize transition-colors ${
                        state.tenureUnit === unit
                          ? 'bg-brand-500 text-white'
                          : 'bg-transparent text-muted-foreground hover:bg-secondary'
                      }`}
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {result && input && (
        <>
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-6 items-center">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Monthly EMI</p>
                    <p className="text-xl font-semibold text-brand-500">{formatMoney(result.emi)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Interest</p>
                    <p className="text-xl font-semibold text-foreground">{formatMoney(result.totalInterest)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Payment</p>
                    <p className="text-xl font-semibold text-foreground">{formatMoney(result.totalPayment)}</p>
                  </div>
                </div>
                <ChartContainer config={CHART_CONFIG} className="w-45 h-45 mx-auto">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="label" />} />
                    <Pie data={chartData} dataKey="value" nameKey="label" innerRadius={45} outerRadius={70} strokeWidth={2} />
                  </PieChart>
                </ChartContainer>
              </div>
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
                  Amortization Schedule ({input.tenureMonths} months)
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
                        <TableHead className="text-muted-foreground">Month</TableHead>
                        <TableHead className="text-right text-muted-foreground">Payment</TableHead>
                        <TableHead className="text-right text-muted-foreground">Principal</TableHead>
                        <TableHead className="text-right text-muted-foreground">Interest</TableHead>
                        <TableHead className="text-right text-muted-foreground">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.schedule.map(row => (
                        <TableRow key={row.month}>
                          <TableCell className="text-muted-foreground font-mono">{row.month}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.payment)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.principalPaid)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.interestPaid)}</TableCell>
                          <TableCell className="text-right font-mono">{formatMoney(row.balance)}</TableCell>
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
