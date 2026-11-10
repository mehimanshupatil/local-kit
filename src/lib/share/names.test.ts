import { describe, expect, it } from 'vitest';
import { DEVICE_NAME_PARTS, randomDeviceName } from './names';

describe('randomDeviceName', () => {
  it('joins one adjective and one animal', () => {
    const [adjective, animal] = randomDeviceName().split(' ');
    expect(DEVICE_NAME_PARTS.adjectives).toContain(adjective);
    expect(DEVICE_NAME_PARTS.animals).toContain(animal);
  });

  it('covers both ends of each list', () => {
    expect(randomDeviceName(() => 0)).toBe(`${DEVICE_NAME_PARTS.adjectives[0]} ${DEVICE_NAME_PARTS.animals[0]}`);
    expect(randomDeviceName(() => 0.999999)).toBe(
      `${DEVICE_NAME_PARTS.adjectives.at(-1)} ${DEVICE_NAME_PARTS.animals.at(-1)}`,
    );
  });

  it('stays in range if random() returns exactly 1', () => {
    expect(randomDeviceName(() => 1)).toBe(`${DEVICE_NAME_PARTS.adjectives.at(-1)} ${DEVICE_NAME_PARTS.animals.at(-1)}`);
  });

  it('has no duplicate words', () => {
    for (const list of Object.values(DEVICE_NAME_PARTS)) expect(new Set(list).size).toBe(list.length);
  });
});
