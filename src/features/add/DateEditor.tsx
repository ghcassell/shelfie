import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { File } from 'expo-file-system';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { parseExpiryDates, type ParsedDate } from '../../domain/dateParser';
import { addDays, addMonths, formatDay, toDay } from '../../domain/dates';
import type { DateKind, Day } from '../../domain/types';
import { Button, Chip, s } from '../../ui/components';
import { color, radius, space } from '../../ui/theme';
import { TextCamera } from './camera';

export interface DateChoice { expiryDate: Day | null; noExpiry: boolean; dateKind: DateKind }
export const NEEDS_DATE: DateChoice = { expiryDate: null, noExpiry: false, dateKind: 'best_before' };

export const deletePhoto = (path: string) => {
  try { new File(path.startsWith('file://') ? path : `file://${path}`).delete(); } catch { /* already gone */ }
};

/**
 * The date step: scan date (never saved unconfirmed), quick options, picker, no expiry, skip for now.
 * If the camera or OCR plugin fails, everything below the camera still works (manual entry is the floor).
 */
export function DateEditor({ value, onChange, startInCamera }: { value: DateChoice; onChange: (v: DateChoice) => void; startInCamera?: boolean }) {
  const today = toDay();
  const [camera, setCamera] = useState(!!startInCamera);
  const [read, setRead] = useState<ParsedDate[] | null>(null);
  const [seen, setSeen] = useState('');
  const setDate = (expiryDate: Day, dateKind = value.dateKind) => onChange({ expiryDate, noExpiry: false, dateKind });
  // Opens on the given date (a scanned guess to correct), else the current one, else today.
  const pickDate = (from = value.expiryDate, dateKind = value.dateKind) => DateTimePickerAndroid.open({
    value: from ? new Date(`${from}T12:00:00`) : new Date(),
    mode: 'date',
    onValueChange: (_e, d) => { setDate(toDay(d), dateKind); setRead(null); setCamera(false); },
  });

  const quick: [string, Day][] = [
    ['+3 days', addDays(today, 3)], ['+1 week', addDays(today, 7)], ['+1 month', addMonths(today, 1)], ['+1 year', addMonths(today, 12)],
  ];
  const status = value.noExpiry ? 'No expiry' : value.expiryDate ? formatDay(value.expiryDate) : 'No date yet (Needs a date)';

  return (
    <View style={{ gap: space.lg }}>
      <Text style={[s.text, { fontWeight: '600' }]} accessibilityLiveRegion="polite">{status}</Text>

      <View style={s.chipRow} accessibilityLabel="Date kind">
        <Chip label="Best before" selected={value.dateKind === 'best_before'} onPress={() => onChange({ ...value, dateKind: 'best_before' })} />
        <Chip label="Use by" selected={value.dateKind === 'use_by'} onPress={() => onChange({ ...value, dateKind: 'use_by' })} />
      </View>

      {camera ? (
        <TextCamera
          label="Read date"
          onText={({ text }, path) => { deletePhoto(path); setSeen(text.replace(/\s+/g, ' ').trim().slice(0, 120)); setRead(parseExpiryDates(text, today)); }}
        />
      ) : (
        <Button label="Scan date" icon="camera" kind="secondary" onPress={() => setCamera(true)} />
      )}

      {read?.length === 0 && <Text style={s.muted}>No date found{seen ? ` in “${seen}”` : ''}. Try again closer, or pick one below.</Text>}
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

      <View style={s.chipRow}>
        {quick.map(([label, day]) => (
          <Chip key={label} label={label} selected={value.expiryDate === day && !value.noExpiry} onPress={() => setDate(day)} />
        ))}
      </View>
      <Button
        label="Pick a date" icon="calendar" kind="secondary"
        onPress={() => pickDate()}
      />
      <View style={s.chipRow}>
        <Chip label="No expiry" selected={value.noExpiry} onPress={() => onChange({ ...value, expiryDate: null, noExpiry: true })} />
        <Chip label="Skip for now" selected={!value.noExpiry && !value.expiryDate} onPress={() => onChange({ ...value, expiryDate: null, noExpiry: false })} />
      </View>
    </View>
  );
}
