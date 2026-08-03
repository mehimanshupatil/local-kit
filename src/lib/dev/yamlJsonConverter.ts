import { parse, stringify } from 'yaml';

export function yamlToJson(yamlText: string): string {
  const parsed = parse(yamlText);
  return JSON.stringify(parsed, null, 2);
}

export function jsonToYaml(jsonText: string): string {
  const parsed = JSON.parse(jsonText);
  return stringify(parsed);
}
