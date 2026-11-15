// "Improve with AI": forwards one downscaled receipt photo to Gemini Flash-Lite.
// The Gemini key (free tier, from aistudio.google.com) lives only here, as a Supabase secret:
//   supabase secrets set GEMINI_API_KEY=...
// Deployed with JWT verification on (the default), so only signed-in Members can call it.
// Free tier: no billing on the key means no cost; Google may use free-tier inputs to improve its products.

const MAX_IMAGE_BASE64 = 2_000_000; // ~1.5 MB photo; the app downscales well below this

const PROMPT = `This is a photo of a UK supermarket till receipt. List every line that has a price, in order,
including non-food lines, discounts and totals. Expand abbreviated product names into plain words where you are
confident (e.g. "CHKN BRST 400G" -> "Chicken breast 400g"); keep any size. "price" is the line total in pounds
(negative for discounts), "quantity" is the number of packs (1 unless the receipt says otherwise).
Reply with only JSON: {"items":[{"name":string,"quantity":number,"price":number|null}]}`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { image } = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || !image || image.length > MAX_IMAGE_BASE64) {
    return Response.json({ error: 'Expected { image: base64 JPEG }' }, { status: 400 });
  }

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'x-goog-api-key': Deno.env.get('GEMINI_API_KEY') ?? '',
      'Api-Revision': '2026-05-20',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gemini-3.5-flash-lite',
      store: false, // the receipt is not kept for later retrieval
      generation_config: { max_output_tokens: 4000, thinking_level: 'minimal' },
      response_format: { type: 'text', mime_type: 'application/json' },
      input: [
        { type: 'text', text: PROMPT },
        { type: 'image', data: image, mime_type: 'image/jpeg' },
      ],
    }),
  });
  if (!res.ok) {
    console.error('Gemini error', res.status, await res.text());
    return Response.json({ error: 'AI service unavailable' }, { status: 502 });
  }
  const body = await res.json();
  const text: string = (body.steps ?? [])
    .filter((st: { type: string }) => st.type === 'model_output')
    .flatMap((st: { content?: { type: string; text?: string }[] }) => st.content ?? [])
    .map((c: { text?: string }) => c.text ?? '')
    .join('');
  try {
    return Response.json(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
  } catch {
    return Response.json({ error: 'AI reply could not be read' }, { status: 502 });
  }
});
