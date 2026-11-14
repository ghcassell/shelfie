import { useLarder } from '../../db/queries';
import { BottomTabs } from '../../ui/BottomTabs';

export default function TabsLayout() {
  return <BottomTabs attentionCount={useLarder().attention.length} />;
}
