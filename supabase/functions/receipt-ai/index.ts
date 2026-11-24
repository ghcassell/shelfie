// "Improve with AI": forwards one downscaled receipt photo, or pasted emailed receipt text, to Gemini Flash-Lite.
// Also serves "Recipe ideas" ({ larder }), so there is one function and one key to manage.
// The Gemini key (free tier, from aistudio.google.com) lives only here, as a Supabase secret:
//   supabase secrets set GEMINI_API_KEY=...
// Deployed with JWT verification on (the default), so only signed-in Members can call it.
// Free tier: no billing on the key means no cost; Google may use free-tier inputs to improve its products.

const MAX_IMAGE_BASE64 = 2_000_000; // ~1.5 MB photo; the app downscales well below this

const MAX_TEXT = 50_000; // a pasted emailed receipt; far longer is not a receipt

const PROMPT = `List every line that has a price, in order,
including non-food lines, discounts and totals. Expand abbreviated product names into plain words where you are
confident (e.g. "CHKN BRST 400G" -> "Chicken breast 400g"); keep any size. "price" is the line total in pounds
(negative for discounts), "quantity" is the number of packs (1 unless the receipt says otherwise).
"category" is one or two plain words for the kind of product (e.g. "Dairy", "Canned foods", "Fresh fruit",
"Cleaning", "Pet food"); null for discounts, totals and anything you cannot tell.
Reply with only JSON: {"items":[{"name":string,"quantity":number,"price":number|null,"category":string|null}]}`;

// "Recipe ideas": Product names with how soon each expires, most urgent first. Nothing else about the household is sent.
const RECIPE_PROMPT = `These are the foods in a UK home, one per line, the ones to use up first at the top.
Suggest 4 simple home-cooked recipes that use up the items nearest the top first. Prefer recipes needing few
extra ingredients; assume salt, pepper, cooking oil and water are always available. Ignore non-food items.
"uses" lists the larder items the recipe uses, named exactly as written but without the bracketed part;
"missing" lists other ingredients to buy; "steps" are short plain steps without numbers.
Reply with only JSON: {"recipes":[{"title":string,"uses":string[],"missing":string[],"steps":string[]}]}`;
const MAX_LARDER = 100;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const { image, text, larder } = await req.json().catch(() => ({}));
  const okImage = typeof image === 'string' && image && image.length <= MAX_IMAGE_BASE64;
  const okText = typeof text === 'string' && text.trim() && text.length <= MAX_TEXT;
  const okLarder = Array.isArray(larder) && larder.length > 0 && larder.length <= MAX_LARDER
    && larder.every((l) => typeof l === 'string' && l.length <= 200);
  if (!okImage && !okText && !okLarder) {
    return Response.json({ error: 'Expected { image: base64 JPEG }, { text: string } or { larder: string[] }' }, { status: 400 });
  }
  const receipt = okLarder
    ? [{ type: 'text', text: RECIPE_PROMPT }, { type: 'text', text: larder.join('\n') }]
    : okImage
    ? [{ type: 'text', text: `This is a photo of a UK supermarket till receipt. ${PROMPT}` }, { type: 'image', data: image, mime_type: 'image/jpeg' }]
    : [{ type: 'text', text: `This is the text of a UK supermarket receipt, copied from an email. ${PROMPT}` }, { type: 'text', text }];

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
      input: receipt,
    }),
  });
  if (!res.ok) {
    console.error('Gemini error', res.status, await res.text());
    return Response.json({ error: 'AI service unavailable' }, { status: 502 });
  }
  const body = await res.json();
  const reply: string = (body.steps ?? [])
    .filter((st: { type: string }) => st.type === 'model_output')
    .flatMap((st: { content?: { type: string; text?: string }[] }) => st.content ?? [])
    .map((c: { text?: string }) => c.text ?? '')
    .join('');
  try {
    return Response.json(JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)));
  } catch {
    return Response.json({ error: 'AI reply could not be read' }, { status: 502 });
  }
});
