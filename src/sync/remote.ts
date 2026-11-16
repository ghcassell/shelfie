import { DuplicateError, pullPages, type Remote } from './engine';
import { supabase } from './supabase';

type Row = Record<string, any>;
const PAGE = 500; // under Supabase's 1000-row response cap, so a full page always means "ask again"

const check = <T>({ data, error }: { data: T | null; error: { code?: string; message: string } | null }): T => {
  if (error) throw error.code === '23505' ? new DuplicateError(error.message) : new Error(error.message);
  return data as T;
};

export const supabaseRemote: Remote = {
  async upsert(table, rows, insertOnly) {
    return check(await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: insertOnly }).select()) ?? [];
  },
  async pull(table, since) {
    return pullPages(async (from) => {
      const query = supabase.from(table).select().order('updated_at').limit(PAGE);
      return check(await (from ? query.gte('updated_at', from) : query)) ?? [];
    }, since, PAGE);
  },
  async findClash(table, row: Row) {
    const live = supabase.from(table).select().is('deleted_at', null).neq('id', row.id).limit(1);
    const escaped = String(row.name ?? '').replace(/[\\%_]/g, '\\$&'); // ilike without wildcards = case-insensitive equals
    const rows = check(await (table === 'products' ? live.eq('barcode', row.barcode) : live.ilike('name', escaped)));
    return rows?.[0] ?? null;
  },
};
