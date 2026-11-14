import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLarder } from '../../db/queries';
import { addMonths, toDay } from '../../domain/dates';
import { WASTE_REASONS } from '../../domain/types';
import { formatPence, wasteReport, wasteTotalText } from '../../domain/waste';
import { EmptyState, IconButton, ListRow, s, ScreenHeader, Section } from '../../ui/components';
import { color, font, space } from '../../ui/theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function WasteScreen() {
  const { all, entries, products } = useLarder();
  const [first, setFirst] = useState(() => `${toDay().slice(0, 7)}-01`);
  const month = first.slice(0, 7);
  const report = wasteReport(month, entries, all.map((r) => r.batch));
  const name = (productId: string) => products.find((p) => p.id === productId)?.name ?? 'Unknown';
  const times = (n: number) => `${n} ${n === 1 ? 'time' : 'times'}`;

  return (
    <View style={s.screen}>
      <ScreenHeader title="Waste report" back />
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.screen }}>
        <IconButton icon="chevron-left" label="Previous month" onPress={() => setFirst(addMonths(first, -1))} />
        <Text style={[s.text, { flex: 1, textAlign: 'center', fontWeight: '600' }]} accessibilityLiveRegion="polite">
          {MONTHS[+month.slice(5) - 1]} {month.slice(0, 4)}
        </Text>
        <IconButton icon="chevron-right" label="Next month" onPress={() => setFirst(addMonths(first, 1))} />
      </View>
      {report.wastedBatches === 0 ? (
        <EmptyState icon="leaf" text="No waste this month." />
      ) : (
        <ScrollView contentContainerStyle={s.body}>
          <View>
            <Text style={{ fontFamily: font.title, fontSize: font.xl, color: color.dark }}>{wasteTotalText(report)}</Text>
            <Text style={s.muted}>{report.wastedBatches} wasted {report.wastedBatches === 1 ? 'Batch' : 'Batches'}</Text>
          </View>
          <Section title="Most wasted">
            {report.byProduct.slice(0, 5).map((p) => (
              <ListRow key={p.productId} title={name(p.productId)} subtitle={times(p.entries)} right={<Text style={s.text}>{formatPence(p.pence)}</Text>} />
            ))}
          </Section>
          <Section title="Why">
            {report.byReason.map((r) => (
              <ListRow
                key={r.reason ?? 'none'} title={WASTE_REASONS.find((w) => w.value === r.reason)?.label ?? 'No reason given'}
                subtitle={times(r.entries)} right={<Text style={s.text}>{formatPence(r.pence)}</Text>}
              />
            ))}
          </Section>
        </ScrollView>
      )}
    </View>
  );
}
