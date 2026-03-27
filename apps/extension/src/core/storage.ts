import { STORAGE_KEYS } from "@/shared/constants";
import { DEFAULT_SETTINGS, type Settings, type LockedTabGroup } from "@/shared/types";

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(
  settings: Partial<Settings>,
): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

export async function getSessionData<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.session.get(key);
  return (result[key] as T) ?? null;
}

export async function setSessionData<T>(
  key: string,
  data: T,
): Promise<void> {
  await chrome.storage.session.set({ [key]: data });
}

export async function clearSessionData(key: string): Promise<void> {
  await chrome.storage.session.remove(key);
}

export async function getLockedTabGroups(): Promise<LockedTabGroup[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LOCKED_TAB_GROUPS);
  return (result[STORAGE_KEYS.LOCKED_TAB_GROUPS] as LockedTabGroup[]) ?? [];
}

export async function saveLockedTabGroups(
  groups: LockedTabGroup[],
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOCKED_TAB_GROUPS]: groups,
  });
}
