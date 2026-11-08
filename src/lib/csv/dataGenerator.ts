import type { Grid } from './csv';

export type GeneratorType =
  | 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'company' | 'city' | 'country'
  | 'integer' | 'decimal' | 'date' | 'boolean' | 'uuid' | 'sequence' | 'pick' | 'words';

export interface ColumnSpec {
  name: string;
  type: GeneratorType;
  /** integer / decimal / sequence start */
  min?: number;
  max?: number;
  /** date range, ISO yyyy-mm-dd */
  from?: string;
  to?: string;
  /** pick: comma-separated choices */
  options?: string;
}

type Param = 'range' | 'start' | 'dates' | 'options';

export const GENERATOR_TYPES: { value: GeneratorType; label: string; params: Param[] }[] = [
  { value: 'sequence', label: 'ID (1, 2, 3…)', params: ['start'] },
  { value: 'firstName', label: 'First name', params: [] },
  { value: 'lastName', label: 'Last name', params: [] },
  { value: 'fullName', label: 'Full name', params: [] },
  { value: 'email', label: 'Email', params: [] },
  { value: 'phone', label: 'Phone', params: [] },
  { value: 'company', label: 'Company', params: [] },
  { value: 'city', label: 'City', params: [] },
  { value: 'country', label: 'Country', params: [] },
  { value: 'integer', label: 'Whole number', params: ['range'] },
  { value: 'decimal', label: 'Decimal number', params: ['range'] },
  { value: 'date', label: 'Date', params: ['dates'] },
  { value: 'boolean', label: 'true / false', params: [] },
  { value: 'uuid', label: 'UUID', params: [] },
  { value: 'pick', label: 'Pick from list', params: ['options'] },
  { value: 'words', label: 'Lorem words', params: [] },
];

const FIRST = ['Aarav', 'Ana', 'Ben', 'Chen', 'Diya', 'Elena', 'Femi', 'Grace', 'Hiro', 'Isla', 'Jonas', 'Kavya', 'Liam', 'Maya', 'Noah', 'Olu', 'Priya', 'Rosa', 'Sam', 'Tara', 'Umar', 'Vera', 'Wei', 'Yusuf', 'Zoe'];
const LAST = ['Anderson', 'Bose', 'Costa', 'Dubois', 'Eze', 'Fischer', 'Garcia', 'Hansen', 'Iyer', 'Jensen', 'Kim', 'Lopez', 'Mehta', 'Nakamura', 'Okafor', 'Patel', 'Rossi', 'Silva', 'Tanaka', 'Wong'];
const COMPANY_A = ['Blue', 'Bright', 'Cedar', 'Delta', 'North', 'Pixel', 'Quantum', 'River', 'Summit', 'Vertex'];
const COMPANY_B = ['Labs', 'Systems', 'Works', 'Analytics', 'Foods', 'Logistics', 'Studio', 'Health', 'Energy', 'Retail'];
const CITIES = ['Amsterdam', 'Austin', 'Bengaluru', 'Berlin', 'Cape Town', 'Lagos', 'Lisbon', 'Melbourne', 'Mexico City', 'Mumbai', 'Nairobi', 'Osaka', 'Paris', 'Seoul', 'Toronto'];
const COUNTRIES = ['Australia', 'Brazil', 'Canada', 'France', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'Netherlands', 'Nigeria', 'Portugal', 'South Africa', 'United Kingdom', 'United States'];
const LOREM = ['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'magna', 'aliqua'];

/** Small deterministic PRNG so generated data is reproducible in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

function generateValue(spec: ColumnSpec, i: number, rng: () => number): string {
  const pick = <T>(list: T[]) => list[Math.floor(rng() * list.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const lo = spec.min ?? 0;
  const hi = Math.max(lo, spec.max ?? 1000);

  switch (spec.type) {
    case 'sequence': return String((spec.min ?? 1) + i);
    case 'firstName': return pick(FIRST);
    case 'lastName': return pick(LAST);
    case 'fullName': return `${pick(FIRST)} ${pick(LAST)}`;
    case 'email': return `${pick(FIRST)}.${pick(LAST)}${int(1, 99)}@example.com`.toLowerCase();
    // 555-01xx is reserved for fiction in the North American numbering plan
    case 'phone': return `+1 555-01${int(0, 9)}${int(0, 9)}-${String(int(0, 9999)).padStart(4, '0')}`;
    case 'company': return `${pick(COMPANY_A)} ${pick(COMPANY_B)}`;
    case 'city': return pick(CITIES);
    case 'country': return pick(COUNTRIES);
    case 'integer': return String(int(Math.ceil(lo), Math.floor(hi)));
    case 'decimal': return (lo + rng() * (hi - lo)).toFixed(2);
    case 'date': {
      const from = Date.parse(spec.from || '2020-01-01');
      const to = Math.max(from, Date.parse(spec.to || '2026-12-31'));
      const days = Math.floor((to - from) / DAY_MS);
      return new Date(from + int(0, days) * DAY_MS).toISOString().slice(0, 10);
    }
    case 'boolean': return rng() < 0.5 ? 'true' : 'false';
    case 'uuid': {
      const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16));
      hex[12] = '4';
      hex[16] = '89ab'[Math.floor(rng() * 4)];
      const s = hex.join('');
      return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
    }
    case 'pick': {
      const choices = (spec.options ?? '').split(',').map(o => o.trim()).filter(Boolean);
      return choices.length ? pick(choices) : '';
    }
    case 'words': return Array.from({ length: int(3, 6) }, () => pick(LOREM)).join(' ');
  }
}

/** Header row of column names followed by `count` generated rows. */
export function generateRows(specs: ColumnSpec[], count: number, rng: () => number = Math.random): Grid {
  const header = specs.map((s, i) => s.name.trim() || `column_${i + 1}`);
  const rows = Array.from({ length: count }, (_, i) => specs.map(s => generateValue(s, i, rng)));
  return [header, ...rows];
}
