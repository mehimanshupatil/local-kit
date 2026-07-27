import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib';

export interface EmiInput {
  principal: number;
  annualRatePercent: number;
  tenureMonths: number;
}

export interface ScheduleRow {
  month: number;
  payment: number;
  principalPaid: number;
  interestPaid: number;
  balance: number;
}

export interface EmiResult {
  emi: number;
  totalInterest: number;
  totalPayment: number;
  schedule: ScheduleRow[];
}

export function computeEmi({ principal, annualRatePercent, tenureMonths }: EmiInput): EmiResult {
  const monthlyRate = annualRatePercent / 12 / 100;

  const emi =
    monthlyRate === 0
      ? principal / tenureMonths
      : (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
        (Math.pow(1 + monthlyRate, tenureMonths) - 1);

  const schedule: ScheduleRow[] = [];
  let balance = principal;
  let totalPayment = 0;

  for (let month = 1; month <= tenureMonths; month++) {
    const interestPaid = balance * monthlyRate;
    const isLastMonth = month === tenureMonths;
    const principalPaid = isLastMonth ? balance : emi - interestPaid;
    const payment = principalPaid + interestPaid;
    balance = isLastMonth ? 0 : balance - principalPaid;

    schedule.push({
      month,
      payment: round2(payment),
      principalPaid: round2(principalPaid),
      interestPaid: round2(interestPaid),
      balance: round2(balance),
    });
    totalPayment += payment;
  }

  return {
    emi: round2(emi),
    totalInterest: round2(totalPayment - principal),
    totalPayment: round2(totalPayment),
    schedule,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function scheduleToCsv(result: EmiResult): Blob {
  const header = 'Month,Payment,Principal,Interest,Balance';
  const rows = result.schedule.map(r =>
    `${r.month},${r.payment.toFixed(2)},${r.principalPaid.toFixed(2)},${r.interestPaid.toFixed(2)},${r.balance.toFixed(2)}`
  );
  return new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
}

const ROWS_PER_PAGE = 38;
const PAGE_SIZE: [number, number] = [595, 842]; // A4 in points
const COLUMNS = [
  { label: 'Month', x: 50, width: 60 },
  { label: 'Payment', x: 150, width: 100 },
  { label: 'Principal', x: 270, width: 100 },
  { label: 'Interest', x: 390, width: 100 },
  { label: 'Balance', x: 490, width: 100 },
] as const;

export async function scheduleToPdf(input: EmiInput, result: EmiResult): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  drawSummaryPage(doc, boldFont, font, input, result);

  const pageCount = Math.ceil(result.schedule.length / ROWS_PER_PAGE);
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
  input: EmiInput,
  result: EmiResult,
) {
  const page = doc.addPage(PAGE_SIZE);
  const [, height] = PAGE_SIZE;
  let y = height - 60;

  page.drawText('EMI Calculation Summary', { x: 50, y, size: 18, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  y -= 40;

  const lines: [string, string][] = [
    ['Principal', input.principal.toFixed(2)],
    ['Annual Interest Rate', `${input.annualRatePercent}%`],
    ['Tenure', `${input.tenureMonths} months`],
    ['Monthly EMI', result.emi.toFixed(2)],
    ['Total Interest Payable', result.totalInterest.toFixed(2)],
    ['Total Payment', result.totalPayment.toFixed(2)],
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
  rows: ScheduleRow[],
  pageNum: number,
  pageCount: number,
) {
  const page = doc.addPage(PAGE_SIZE);
  const [, height] = PAGE_SIZE;
  let y = height - 50;

  page.drawText('Amortization Schedule', { x: 50, y, size: 14, font: boldFont, color: rgb(0.06, 0.09, 0.16) });
  y -= 30;

  for (const col of COLUMNS) {
    page.drawText(col.label, { x: col.x, y, size: 10, font: boldFont, color: rgb(0.3, 0.3, 0.3) });
  }
  y -= 16;

  for (const row of rows) {
    const values = [
      String(row.month),
      row.payment.toFixed(2),
      row.principalPaid.toFixed(2),
      row.interestPaid.toFixed(2),
      row.balance.toFixed(2),
    ];
    values.forEach((v, i) => {
      page.drawText(v, { x: COLUMNS[i].x, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) });
    });
    y -= 18;
  }

  page.drawText(`Page ${pageNum} of ${pageCount}`, {
    x: PAGE_SIZE[0] - 100, y: 30, size: 9, font, color: rgb(0.5, 0.5, 0.5),
  });
}
