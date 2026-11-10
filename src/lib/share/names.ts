const ADJECTIVES = [
  'Amber', 'Brave', 'Bright', 'Calm', 'Clever', 'Cosmic', 'Crimson', 'Daring',
  'Eager', 'Fancy', 'Gentle', 'Golden', 'Happy', 'Jolly', 'Kind', 'Lucky',
  'Mellow', 'Misty', 'Nimble', 'Pink', 'Quick', 'Quiet', 'Rapid', 'Rusty',
  'Silver', 'Sleepy', 'Sunny', 'Swift', 'Teal', 'Witty', 'Zany', 'Zesty',
];

const ANIMALS = [
  'Badger', 'Bear', 'Beaver', 'Cat', 'Crane', 'Deer', 'Dolphin', 'Eagle',
  'Falcon', 'Ferret', 'Fox', 'Gecko', 'Heron', 'Koala', 'Lemur', 'Lynx',
  'Moose', 'Otter', 'Owl', 'Panda', 'Parrot', 'Penguin', 'Puffin', 'Rabbit',
  'Raccoon', 'Robin', 'Seal', 'Sloth', 'Tiger', 'Turtle', 'Walrus', 'Wolf',
];

const pick = <T>(list: readonly T[], random: () => number): T =>
  list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/** A random adjective + animal device name, e.g. "Pink Panda". */
export function randomDeviceName(random: () => number = Math.random): string {
  return `${pick(ADJECTIVES, random)} ${pick(ANIMALS, random)}`;
}

export const DEVICE_NAME_PARTS = { adjectives: ADJECTIVES, animals: ANIMALS } as const;
