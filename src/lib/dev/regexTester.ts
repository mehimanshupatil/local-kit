export interface RegexMatch {
  index: number;
  match: string;
  groups: (string | undefined)[];
  namedGroups?: Record<string, string>;
}

export interface RegexTestResult {
  matches: RegexMatch[];
  error: string | null;
}

export function testRegex(pattern: string, flags: string, input: string): RegexTestResult {
  if (!pattern) return { matches: [], error: null };

  let re: RegExp;
  try {
    re = new RegExp(pattern, flags);
  } catch (e) {
    return { matches: [], error: e instanceof Error ? e.message : 'Invalid regular expression' };
  }

  const matches: RegexMatch[] = [];
  try {
    if (flags.includes('g')) {
      for (const m of input.matchAll(re)) {
        matches.push({ index: m.index ?? 0, match: m[0], groups: m.slice(1), namedGroups: m.groups });
      }
    } else {
      const m = re.exec(input);
      if (m) matches.push({ index: m.index, match: m[0], groups: m.slice(1), namedGroups: m.groups });
    }
  } catch (e) {
    return { matches: [], error: e instanceof Error ? e.message : 'Failed to match' };
  }

  return { matches, error: null };
}
