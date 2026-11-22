import { lightOf } from './light';

test('lightOf grades a frame by its brightness', () => {
  expect(lightOf(new Uint8Array(10_000).fill(3))).toBe('black');
  expect(lightOf(new Uint8Array(10_000).fill(25))).toBe('dark');
  expect(lightOf(new Uint8Array(10_000).fill(120))).toBe('ok');
});
