// "Improve with AI": forwards one downscaled receipt photo to Claude Haiku 5.5.
// The Anthropic key lives only here, as a Supabase secret:
//   supabase secrets set ANTHROPIC_API_KEY=...
// Deployed with JWT verification on (the default), so only signed-in Members can call it.
// The hard monthly spend cap is set in the Anthropic Console.

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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2026-10-21',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 1500, // capped; thinking counts toward it, so low effort keeps the JSON from being cut off
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT },
        ],
      }],
    }),
  });
  if (!res.ok) {
    console.error('Anthropic error', res.status, await res.text());
    return Response.json({ error: 'AI service unavailable' }, { status: 502 });
  }
  const body = await res.json();
  const text: string = body.content?.find((b: { type: string }) => b.type === 'text')?.text ?? '';
  try {
    return Response.json(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)));
  } catch {
    return Response.json({ error: 'AI reply could not be read' }, { status: 502 });
  }
});
