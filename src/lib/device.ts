import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'captchalab.deviceId';
let cached: string | null = null;

function randomId() {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID() as string;
  // Fallback for runtimes without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * A random id made on first launch and kept on the phone. Sent with every request
 * as X-Device-Id. Reinstalling the app or clearing its data makes a new id.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) return (cached = saved);
  } catch {
    // fall through and make a new one
  }
  cached = randomId();
  try {
    await AsyncStorage.setItem(KEY, cached);
  } catch {
    // still usable for this session
  }
  return cached;
}
