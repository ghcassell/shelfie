import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useEffect } from 'react';
import { loadRows } from '../../db/repositories';
import { addDays, toDay } from '../../domain/dates';
import { digestText } from '../../domain/expiry';

// Per-phone settings: never synced.
export interface DigestSettings { on: boolean; hour: number; minute: number }
const KEY = 'digest';
const DEFAULT: DigestSettings = { on: true, hour: 8, minute: 0 };

export const getDigestSettings = (): DigestSettings => ({ ...DEFAULT, ...JSON.parse(Storage.getItemSync(KEY) ?? '{}') });

export function setDigestSettings(patch: Partial<DigestSettings>) {
  Storage.setItemSync(KEY, JSON.stringify({ ...getDigestSettings(), ...patch }));
  return rescheduleDigest();
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Tapping the Daily digest opens Needs attention. */
export function useDigestTap(signedIn: boolean) {
  const tapped = Notifications.useLastNotificationResponse();
  useEffect(() => {
    const url = tapped?.notification.request.content.data?.url;
    if (signedIn && typeof url === 'string') router.push('/attention');
  }, [tapped, signedIn]);
}

/** Asked when the first dated Batch is saved. If denied, the Needs attention badge stands in. */
export async function ensureNotificationPermission() {
  await Notifications.setNotificationChannelAsync('digest', { name: 'Daily digest', importance: Notifications.AndroidImportance.DEFAULT });
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  await rescheduleDigest();
}

/**
 * After every app open and sync: cancel, then schedule the next inexact daily digest from local data.
 * It repeats daily with this text until the app is next opened (stale if unopened for days; accepted).
 */
export const rescheduleDigest = () => (queue = queue.then(reschedule)); // one at a time: overlapping runs double-schedule
let queue = Promise.resolve();

async function reschedule() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const { on, hour, minute } = getDigestSettings();
    if (!on || !(await Notifications.getPermissionsAsync()).granted) return;
    // Work out the states as they will be on the morning it fires.
    const now = new Date();
    const firesToday = now.getHours() * 60 + now.getMinutes() < hour * 60 + minute;
    const fireDay = firesToday ? toDay(now) : addDays(toDay(now), 1);
    const body = digestText(loadRows(fireDay).filter((r) => r.remaining > 0).map((r) => r.urgency));
    if (!body) return; // nothing Expiring soon, Expired or Past best; Needs a date never triggers it
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Shelfie', body, data: { url: '/attention' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: 'digest' },
    });
  } catch (e) {
    console.warn('Digest not scheduled', e);
  }
}
