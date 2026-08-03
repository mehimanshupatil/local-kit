function toWords(input: string): string[] {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
}

export interface CaseResult {
  key: string;
  label: string;
  value: string;
}

export function convertCase(input: string): CaseResult[] {
  const words = toWords(input);
  if (words.length === 0) return [];

  const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

  return [
    { key: 'camel', label: 'camelCase', value: words.map((w, i) => (i === 0 ? w : capitalize(w))).join('') },
    { key: 'pascal', label: 'PascalCase', value: words.map(capitalize).join('') },
    { key: 'snake', label: 'snake_case', value: words.join('_') },
    { key: 'kebab', label: 'kebab-case', value: words.join('-') },
    { key: 'constant', label: 'CONSTANT_CASE', value: words.join('_').toUpperCase() },
    { key: 'title', label: 'Title Case', value: words.map(capitalize).join(' ') },
    { key: 'sentence', label: 'Sentence case', value: capitalize(words.join(' ')) },
    { key: 'lower', label: 'lowercase', value: words.join(' ').toLowerCase() },
    { key: 'upper', label: 'UPPERCASE', value: words.join(' ').toUpperCase() },
  ];
}
