import { allowLookup, productFromOff, type ProductDraft } from '../../domain/off';

// Open Food Facts asks for "AppName/Version (ContactEmail)". The contact comes from .env, never hard-coded.
const USER_AGENT = `Shelfie/1.0 (${process.env.EXPO_PUBLIC_OFF_CONTACT || 'private household app'})`;
const FIELDS = 'product_name,product_name_en,brands,quantity,categories,image_front_small_url,image_front_url';

let recent: number[] = [];

/** 'offline' when there is no connection or the 15/min limit is hit: the wizard falls back to manual entry. */
export async function lookupBarcode(barcode: string): Promise<ProductDraft | 'not_found' | 'offline'> {
  const allowed = allowLookup(recent, Date.now());
  if (!allowed) return 'offline';
  recent = allowed;
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.status === 404) return 'not_found';
    if (!res.ok) return 'offline';
    return productFromOff(await res.json()) ?? 'not_found';
  } catch {
    return 'offline';
  }
}
