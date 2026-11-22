export type Light = 'ok' | 'dark' | 'black';

// Mean brightness of the preview, 0–255. Tune on a real phone: auto-exposure lifts a dim room a long way, so these sit low.
// ponytail: brightness only. Add a sharpness score (neighbour-pixel differences) if blurry shots turn out to be the bigger problem.
const BLACK = 12; // lens covered, or a pocket
const DARK = 40; // print too dim to read

/** How bright a camera frame's luma (Y) plane is. Samples a spread of pixels, not all of them, as this runs on every frame. */
export function lightOf(luma: Uint8Array): Light {
  'worklet';
  let sum = 0;
  let n = 0;
  for (let i = 0; i < luma.length; i += 97) { sum += luma[i]; n++; }
  const mean = n ? sum / n : 255;
  return mean < BLACK ? 'black' : mean < DARK ? 'dark' : 'ok';
}
