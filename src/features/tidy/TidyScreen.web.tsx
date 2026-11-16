// Browser only: the whole Larder as one wide, editable table, for tidying many Batches at once.
// Plain HTML (table, inputs, selects) rather than React Native views: the browser already does tables, date fields and tabbing.
import { router } from 'expo-router';
import { type CSSProperties, type ReactNode, useState } from 'react';
import { type Row, useLarder } from '../../db/queries';
import { addUsage, deleteBatch, updateBatch, updateProduct } from '../../db/repositories';
import { formatAmount } from '../../domain/amount';
import { pillText } from '../../domain/expiry';
import { matchesSearch } from '../../domain/larder';
import { parsePrice, type SortKey, sortRows } from '../../domain/tidy';
import { showDialog } from '../../ui/Dialog';
import { color, edgeColor, font, radius, space } from '../../ui/theme';

/** A cell that saves when you leave it or press Enter; Escape puts the old value back. */
function Cell({ value, onSave, label, type = 'text', width, required }: {
  value: string; onSave: (value: string) => void; label: string; type?: 'text' | 'date'; width?: number; required?: boolean;
}) {
  return (
    <input
      key={value} // a change from elsewhere (sync, another row of the same Product) replaces what is shown
      type={type} defaultValue={value} aria-label={label} style={{ ...st.input, width: width ?? '100%' }}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (required && !next) e.target.value = value; // emptied by mistake: put it back
        else if (next !== value) onSave(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { e.currentTarget.value = value; e.currentTarget.blur(); }
      }}
    />
  );
}

export default function TidyScreen() {
  const { larder, locations, today } = useLarder();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean } | null>(null);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [bulkDate, setBulkDate] = useState('');
  const [error, setError] = useState('');

  const found = larder.filter((r) => matchesSearch(r, query));
  const rows = sort ? sortRows(found, sort.key, sort.descending) : found;
  const selected = rows.filter((r) => picked.has(r.batch.id)); // a Batch that has gone, or is filtered out, is never acted on
  const allPicked = rows.length > 0 && selected.length === rows.length;
  const count = `${selected.length} ${selected.length === 1 ? 'Batch' : 'Batches'}`;

  const toggle = (id: string) => setPicked((old) => { const next = new Set(old); if (!next.delete(id)) next.add(id); return next; });
  const each = (change: (r: Row) => void) => { selected.forEach(change); setPicked(new Set()); };

  const head = (label: string, key?: SortKey) => (
    <th style={st.th} aria-sort={sort && sort.key === key ? (sort.descending ? 'descending' : 'ascending') : undefined}>
      {key ? (
        <button
          style={st.sort}
          onClick={() => setSort(sort?.key !== key ? { key, descending: false } : sort.descending ? null : { key, descending: true })}
        >
          {label}{sort?.key === key ? (sort.descending ? ' ▼' : ' ▲') : ''}
        </button>
      ) : label}
    </th>
  );
  const bulk = (label: string, onClick: () => void, extra?: CSSProperties, disabled?: boolean) =>
    <button style={{ ...st.button, ...extra, opacity: disabled ? 0.5 : 1 }} onClick={onClick} disabled={disabled}>{label}</button>;

  return (
    <div style={st.page}>
      <div style={st.bar}>
        <button style={st.button} onClick={() => (router.canGoBack() ? router.back() : router.replace('/'))}>← Back</button>
        <h1 style={st.title}>Tidy the larder</h1>
        <input
          style={{ ...st.input, ...st.boxed, width: 260 }} placeholder="Search name or brand" aria-label="Search the larder"
          value={query} onChange={(e) => setQuery(e.target.value)}
        />
        <span style={st.muted}>{rows.length} {rows.length === 1 ? 'Batch' : 'Batches'}. Click a cell to edit it; name, brand, size and category belong to the Product, so they change on all its Batches.</span>
      </div>

      {selected.length > 0 && (
        <div style={{ ...st.bar, backgroundColor: color.tint }} role="toolbar" aria-label="Change the selected Batches">
          <strong>{selected.length} selected</strong>
          <select
            style={{ ...st.input, ...st.boxed, width: 'auto' }} aria-label="Move the selected Batches" value=""
            onChange={(e) => { const locationId = e.target.value; each((r) => updateBatch(r.batch.id, { locationId })); }}
          >
            <option value="" disabled>Move to…</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input type="date" style={{ ...st.input, ...st.boxed, width: 'auto' }} aria-label="Date for the selected Batches" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} />
          {bulk('Set date', () => each((r) => updateBatch(r.batch.id, { expiryDate: bulkDate, noExpiry: false })), undefined, !bulkDate)}
          {bulk('No expiry', () => each((r) => updateBatch(r.batch.id, { expiryDate: null, noExpiry: true })))}
          {bulk('Used up', () => showDialog({
            title: `Record ${count} as used up?`,
            buttons: [
              { label: 'Cancel' },
              { label: 'Used up', variant: 'primary', onPress: () => each((r) => { addUsage(r.batch, 'used', r.remaining); }) },
            ],
          }))}
          {bulk('Delete (added by mistake)', () => showDialog({
            title: `Delete ${count}?`,
            message: 'Only for things added by mistake: use "Used up" for food that has been eaten.',
            buttons: [
              { label: 'Cancel' },
              { label: 'Delete', variant: 'destructive', onPress: () => each((r) => deleteBatch(r.batch.id)) },
            ],
          }), { color: color.red, borderColor: color.red })}
          {bulk('Clear selection', () => setPicked(new Set()))}
        </div>
      )}
      {!!error && <div style={{ ...st.bar, color: color.red }} role="alert">{error}</div>}

      <div style={st.scroll}>
        <table style={st.table}>
          <thead>
            <tr>
              <th style={{ ...st.th, width: 36 }}>
                <input type="checkbox" aria-label="Select all" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(rows.map((r) => r.batch.id)))} />
              </th>
              {head('Product', 'name')}{head('Brand', 'brand')}{head('Size', 'size')}{head('Category', 'category')}
              {head('Location', 'location')}{head('Left')}{head('Date', 'date')}{head('Kind')}{head('Price £', 'price')}{head('Status')}{head('')}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const { batch, product } = r;
              const td = (child: ReactNode, extra?: CSSProperties) => <td style={{ ...st.td, ...extra }}>{child}</td>;
              return (
                <tr key={batch.id} style={{ backgroundColor: picked.has(batch.id) ? color.tint : undefined }}>
                  {td(<input type="checkbox" aria-label={`Select ${product.name}`} checked={picked.has(batch.id)} onChange={() => toggle(batch.id)} />, { borderLeft: `4px solid ${edgeColor(r.urgency)}` })}
                  {td(<Cell label="Product name" value={product.name} required onSave={(name) => updateProduct(product.id, { name })} />, { minWidth: 220 })}
                  {td(<Cell label="Brand" value={product.brand ?? ''} onSave={(brand) => updateProduct(product.id, { brand: brand || null })} />, { minWidth: 130 })}
                  {td(<Cell label="Size" value={product.size ?? ''} onSave={(size) => updateProduct(product.id, { size: size || null })} />, { width: 90 })}
                  {td(<Cell label="Category" value={product.category ?? ''} onSave={(category) => updateProduct(product.id, { category: category || null })} />, { minWidth: 130 })}
                  {td(
                    <select style={st.input} aria-label="Location" value={batch.locationId ?? ''} onChange={(e) => updateBatch(batch.id, { locationId: e.target.value })}>
                      {/* A Batch can be To put away, or still sit in a deleted Location: keep showing that until it is moved. */}
                      {!locations.some((l) => l.id === batch.locationId) && <option value={batch.locationId ?? ''}>{r.locationName}</option>}
                      {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>,
                  )}
                  {td(formatAmount(r.remaining, product.baseUnit), { whiteSpace: 'nowrap' })}
                  {td(<Cell label="Date" type="date" value={batch.expiryDate ?? ''} onSave={(day) => updateBatch(batch.id, day ? { expiryDate: day, noExpiry: false } : { expiryDate: null })} />, { width: 140 })}
                  {td(
                    <select
                      style={st.input} aria-label="Date kind" value={batch.noExpiry ? 'none' : batch.dateKind}
                      onChange={(e) => updateBatch(batch.id, e.target.value === 'none' ? { noExpiry: true, expiryDate: null } : { noExpiry: false, dateKind: e.target.value as 'use_by' | 'best_before' })}
                    >
                      <option value="best_before">Best before</option>
                      <option value="use_by">Use by</option>
                      <option value="none">No expiry</option>
                    </select>,
                  )}
                  {td(
                    <Cell
                      label="Price in pounds" width={70} value={batch.pricePence == null ? '' : (batch.pricePence / 100).toFixed(2)}
                      onSave={(text) => { const pricePence = parsePrice(text); if (pricePence === undefined) setError(`"${text}" is not a price.`); else { setError(''); updateBatch(batch.id, { pricePence }); } }}
                    />,
                  )}
                  {td(pillText(r.urgency, r.date, today) ?? (batch.openedOn ? 'Opened' : ''), { whiteSpace: 'nowrap', color: r.urgency === 'expired' ? color.red : color.inkMuted })}
                  {td(<button style={st.sort} onClick={() => router.push(`/batch/${batch.id}`)} aria-label={`Open ${product.name}`}>Open</button>)}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ ...st.muted, padding: space.xl }}>{query ? 'Nothing matches.' : 'Your larder is empty.'}</p>}
      </div>
    </div>
  );
}

const text: CSSProperties = { fontFamily: 'system-ui, sans-serif', fontSize: font.sm, color: color.ink };
const st: Record<string, CSSProperties> = {
  page: { ...text, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, backgroundColor: color.surface },
  bar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.md, padding: `${space.sm}px ${space.lg}px`, borderBottom: `1px solid ${color.line}` },
  title: { fontFamily: font.title, fontSize: font.lg, color: color.dark, margin: 0 },
  muted: { color: color.inkMuted },
  scroll: { flex: 1, minHeight: 0, overflow: 'auto' },
  table: { borderCollapse: 'collapse', width: '100%' },
  th: { position: 'sticky', top: 0, zIndex: 1, backgroundColor: color.surface, textAlign: 'left', padding: space.sm, borderBottom: `2px solid ${color.line}`, whiteSpace: 'nowrap' },
  td: { padding: `2px ${space.sm}px`, borderBottom: `1px solid ${color.line}` },
  input: { ...text, width: '100%', boxSizing: 'border-box', padding: '6px 4px', border: '1px solid transparent', borderRadius: radius.sm, backgroundColor: 'transparent' },
  boxed: { borderColor: color.line, backgroundColor: color.surface },
  button: { ...text, padding: '6px 12px', border: `1px solid ${color.primary}`, borderRadius: radius.sm, backgroundColor: color.surface, color: color.primary, cursor: 'pointer' },
  sort: { ...text, fontWeight: 600, padding: 0, border: 'none', background: 'none', color: color.dark, cursor: 'pointer' },
};
