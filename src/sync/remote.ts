import { DuplicateError, type Remote } from './engine';
import { supabase } from './supabase';

type Row = Record<string, any>;

const check = <T>({ data, error }: { data: T | null; error: { code?: string; message: string } | null }): T => {
  if (error) throw error.code === '23505' ? new DuplicateError(error.message) : new Error(error.message);
  return data as T;
};

export const supabaseRemote: Remote = {
  async upsert(table, rows, insertOnly) {
    return check(await supabase.from(table).upsert(rows, { onConflict: 'id', ignoreDuplicates: insertOnly }).select()) ?? [];
  },
  async pull(table, since) {
    const query = supabase.from(table).select().order('updated_at');
    return check(await (since ? query.gte('updated_at', since) : query)) ?? [];
  },
  async findClash(table, row: Row) {
    const live = supabase.from(table).select().is('deleted_at', null).neq('id', row.id).limit(1);
    const escaped = String(row.name ?? '').replace(/[\\%_]/g, '\\$&'); // ilike without wildcards = case-insensitive equals
    const rows = check(await (table === 'products' ? live.eq('barcode', row.barcode) : live.ilike('name', escaped)));
    return rows?.[0] ?? null;
  },
};
