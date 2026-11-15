import { aliasKey } from '../../domain/receipt';
import { kv } from '../../ui/platform';

// ponytail: per-phone, never synced. Move to a synced table if both phones need the same list.
const KEY = 'receiptIgnore';

/** The user's own ignore phrases, on top of the built-in list. Stored as aliasKey. */
export const getIgnored = (): string[] => JSON.parse(kv.getItemSync(KEY) ?? '[]');

const save = (list: string[]) => { kv.setItemSync(KEY, JSON.stringify(list)); return list; };

export function addIgnored(phrase: string): string[] {
  const key = aliasKey(phrase);
  const list = getIgnored();
  return !key || list.includes(key) ? list : save([...list, key].sort());
}

export const removeIgnored = (key: string): string[] => save(getIgnored().filter((p) => p !== key));
