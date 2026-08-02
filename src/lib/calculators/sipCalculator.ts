import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

export interface SipInput {
  monthlyInvestment: number;
  annualRatePercent: number;
  years: number;
  stepUpPercent: number;
}

export interface YearRow {
  year: number;
  invested: number;
  totalInvested: number;
  value: number;
}

export interface SipResult {
  maturityValue: number;
  totalInvested: number;
  wealthGained: number;
  schedule: YearRow[];
}

export function computeSip({ monthlyInvestment, annualRatePercent, years, stepUpPercent }: SipInput): SipResult {
  const monthlyRate = annualRatePercent / 12 / 100;

  const schedule: YearRow[] = [];
  let balance = 0;
  let totalInvested = 0;
  let currentMonthly = monthlyInvestment;

  for (let year = 1; year <= years; year++) {
    let investedThisYear = 0;
    for (let m = 0; m < 12; m++) {
      balance = (balance + currentMonthly) * (1 + monthlyRate);
      investedThisYear += currentMonthly;
    }
    totalInvested += investedThisYear;

    schedule.push({
      year,
      invested: round2(investedThisYear),
      totalInvested: round2(totalInvested),
      value: round2(balance),
    });

    currentMonthly = currentMonthly * (1 + stepUpPercent / 100);
  }

  return {
    maturityValue: round2(balance),
    totalInvested: round2(totalInvested),
    wealthGained: round2(balance - totalInvested),
    schedule,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scheduleToCsv(result: SipResult): Blob {
  const header = 'Year,Invested This Year,Total Invested,Value';
  const rows = result.schedule.map(r =>
    `${r.year},${r.invested.toFixed(2)},${r.totalInvested.toFixed(2)},${r.value.toFixed(2)}`
  );
  return new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
}

const PAGE_SIZE: [number, number] = [595, 842]; // A4 in points
const COLUMNS = [
  { label: 'Year', x: 50, width: 80 },
  { label: 'Invested This Year', x: 150, width: 130 },
  { label: 'Total Invested', x: 300, width: 130 },
  { label: 'Value', x: 450, width: 100 },
] as const;
const ROWS_PER_PAGE = 34;

export async function scheduleToPdf(input: SipInput, result: SipResult): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  drawSummaryPage(doc, boldFont, font, input, result);

  const pageCount = Math.ceil(result.schedule.length / ROWS_PER_PAGE) || 1;
  for (let p = 0; p < pageCount; p++) {
    const rows = result.schedule.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE);
    drawSchedulePage(doc, boldFont, font, rows, p + 1, pageCount);
  }

  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

function drawSummaryPage(
  doc: PDFDocument,
  boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  input: SipInput,
  result: SipResult,
) {
  const page = doc.addPage(PAGE_SIZE);
  const [, height] = PAGE_SIZE;
  let y = height - 60;

  page.drawText('SIP Calculation Summary', { x: 50, y, size: 18, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  y -= 40;

  const lines: [string, string][] = [
    ['Monthly Investment', input.monthlyInvestment.toFixed(2)],
    ['Expected Annual Return', `${input.annualRatePercent}%`],
    ['Duration', `${input.years} years`],
    ['Annual Step-Up', `${input.stepUpPercent}%`],
    ['Total Invested', result.totalInvested.toFixed(2)],
    ['Wealth Gained', result.wealthGained.toFixed(2)],
    ['Maturity Value', result.maturityValue.toFixed(2)],
  ];

  for (const [label, value] of lines) {
    page.drawText(label, { x: 50, y, size: 12, font, color: rgb(0.3, 0.3, 0.3) });
    page.drawText(value, { x: 250, y, size: 12, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
    y -= 22;
  }
}

function drawSchedulePage(
  doc: PDFDocument,
  boldFont: Awaited<ReturnType<PDFDocument['embedFont']>>,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  rows: YearRow[],
  pageNum: number,
  pageCount: number,
) {
  const page = doc.addPage(PAGE_SIZE);
  const [, height] = PAGE_SIZE;
  let y = height - 50;

  page.drawText('Year-wise Growth', { x: 50, y, size: 14, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  y -= 30;

  for (const col of COLUMNS) {
    page.drawText(col.label, { x: col.x, y, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
  }
  y -= 16;

  for (const row of rows) {
    const values = [String(row.year), row.invested.toFixed(2), row.totalInvested.toFixed(2), row.value.toFixed(2)];
    values.forEach((v, i) => {
      page.drawText(v, { x: COLUMNS[i].x, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    });
    y -= 18;
  }

  page.drawText(`Page ${pageNum} of ${pageCount}`, {
    x: PAGE_SIZE[0] - 100, y: 30, size: 9, font, color: rgb(0.5, 0.5, 0.5),
  });
}
