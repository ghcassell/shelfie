// The Daily digest is a phone notification: the browser has none. Keep the exports in step with digest.ts.
export interface DigestSettings { on: boolean; hour: number; minute: number }

export const getDigestSettings = (): DigestSettings => ({ on: false, hour: 8, minute: 0 });
export const setDigestSettings = async (_patch: Partial<DigestSettings>) => {};
export const ensureNotificationPermission = async () => {};
export const rescheduleDigest = async () => {};
export const useDigestTap = (_signedIn: boolean) => {};
