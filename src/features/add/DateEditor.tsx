import { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { parseExpiryDates, type ParsedDate } from '../../domain/dateParser';
import { addDays, addMonths, formatDay, toDay } from '../../domain/dates';
import type { DateKind, Day } from '../../domain/types';
import { Button, Chip, Section, s } from '../../ui/components';
import { deletePhoto, pickDateTime } from '../../ui/platform';
import { color, radius, space } from '../../ui/theme';
import { TextCamera } from './camera';

export interface DateChoice { expiryDate: Day | null; noExpiry: boolean; dateKind: DateKind }
export const NEEDS_DATE: DateChoice = { expiryDate: null, noExpiry: false, dateKind: 'best_before' };

export const describe = (c: DateChoice) => c.noExpiry ? 'No expiry'
  : c.expiryDate ? `${c.dateKind === 'use_by' ? 'Use by' : 'Best before'} ${formatDay(c.expiryDate)}` : 'Needs a date';

/**
 * The date step: current vs new, no expiry / skip, date kind, then three ways to a new date: pick, scan (never saved unconfirmed), quick options.
 * Mount it fresh per Batch (key or conditional render): the current date and quick-option base are captured once.
 * If the camera or OCR plugin fails, everything else still works (manual entry is the floor).
 */
export function DateEditor({ value, onChange, startInCamera }: { value: DateChoice; onChange: (v: DateChoice) => void; startInCamera?: boolean }) {
  const today = toDay();
  const [initial] = useState(value);
  const [camera, setCamera] = useState(!!startInCamera && CAN_SCAN);
  const [read, setRead] = useState<ParsedDate[] | null>(null);
  const [seen, setSeen] = useState('');
  const setDate = (expiryDate: Day, dateKind = value.dateKind) => onChange({ expiryDate, noExpiry: false, dateKind });
  // Opens on the given date (a scanned guess to correct), else the current one, else today.
  const pickDate = (from = value.expiryDate, dateKind = value.dateKind) => pickDateTime(
    'date', from ? new Date(`${from}T12:00:00`) : new Date(),
    (d) => { setDate(toDay(d), dateKind); setRead(null); setCamera(false); },
  );

  // Quick options add to the date the editor opened on (so taps don't stack), or today if that's empty or already past.
  const base = initial.expiryDate && initial.expiryDate > today ? initial.expiryDate : today;
  const quick: [string, Day][] = [
    ['+3 days', addDays(base, 3)], ['+1 week', addDays(base, 7)], ['+1 month', addMonths(base, 1)], ['+1 year', addMonths(base, 12)],
  ];
  const hadDate = initial.noExpiry || !!initial.expiryDate;

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: space.xs, padding: space.md, borderRadius: radius.md, backgroundColor: color.tint }}>
        {hadDate && <Text style={s.muted}>Current: {describe(initial)}</Text>}
        <Text style={[s.text, { fontWeight: '600' }]} accessibilityLiveRegion="polite">
          {hadDate ? 'New: ' : ''}{describe(value)}
        </Text>
      </View>

      <View style={s.chipRow}>
        <Chip label="No expiry" selected={value.noExpiry} onPress={() => onChange({ ...value, expiryDate: null, noExpiry: true })} />
        <Chip label="Skip for now" selected={!value.noExpiry && !value.expiryDate} onPress={() => onChange({ ...value, expiryDate: null, noExpiry: false })} />
      </View>

      <Section title="Date type">
        <View style={s.chipRow}>
          <Chip label="Best before" selected={value.dateKind === 'best_before'} onPress={() => onChange({ ...value, dateKind: 'best_before' })} />
          <Chip label="Use by" selected={value.dateKind === 'use_by'} onPress={() => onChange({ ...value, dateKind: 'use_by' })} />
        </View>
      </Section>

      <Section title="New date">
        <Button label="Pick a date" icon="calendar" kind="secondary" onPress={() => pickDate()} />

        {CAN_SCAN && <>
          <Or />
          {camera ? (
            <TextCamera
              label="Read date"
              onText={({ text }, path) => { deletePhoto(path); setSeen(text.replace(/\s+/g, ' ').trim().slice(0, 120)); setRead(parseExpiryDates(text, today)); }}
            />
          ) : (
            <Button label="Scan a date" icon="camera" kind="secondary" onPress={() => setCamera(true)} />
          )}
          {read?.length === 0 && <Text style={s.muted}>No date found{seen ? ` in “${seen}”` : ''}. Try again closer, or pick one.</Text>}
          {!!read?.length && (
            <View style={{ gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: color.tint }}>
              <Text style={s.text}>{read.length > 1 ? 'Which date is it? Best guess first.' : 'Is this the date?'}</Text>
              {read.map((r, i) => (
                <View key={r.date} style={{ gap: space.xs }}>
                  <View style={{ flexDirection: 'row', gap: space.sm }}>
                    <Button
                      label={`${formatDay(r.date)}${r.kind ? ` (${r.kind === 'use_by' ? 'use by' : 'best before'})` : ''}`}
                      kind={i ? 'secondary' : 'primary'} style={{ flex: 1 }}
                      onPress={() => { setDate(r.date, r.kind ?? value.dateKind); setRead(null); setCamera(false); }}
                    />
                    <Button label="Edit" icon="pencil" kind="secondary" onPress={() => pickDate(r.date, r.kind ?? value.dateKind)} />
                  </View>
                  {r.warning === 'past' && <Text style={s.error}>This date is in the past. Check it before saving.</Text>}
                  {r.warning === 'far' && <Text style={s.error}>This date is more than 10 years away. Check it before saving.</Text>}
                </View>
              ))}
              <Button label="None of these, pick a date" icon="calendar" kind="secondary" onPress={() => pickDate()} />
            </View>
          )}
        </>}

        <Or />
        <Text style={s.label}>{base === today ? `From today (${formatDay(today)})` : `From the current date (${formatDay(base)})`}</Text>
        <View style={s.chipRow}>
          {quick.map(([label, day]) => (
            <Chip
              key={label} label={label} selected={value.expiryDate === day && !value.noExpiry} onPress={() => setDate(day)}
            />
          ))}
        </View>
      </Section>
    </View>
  );
}

/** ——— or ——— between alternative ways to set the date. */
const Or = () => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessible={false} importantForAccessibility="no-hide-descendants">
    <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
    <Text style={s.muted}>or</Text>
    <View style={{ flex: 1, height: 1, backgroundColor: color.line }} />
  </View>
);

const CAN_SCAN = Platform.OS !== 'web'; // nothing reads a date off a photo in the browser
