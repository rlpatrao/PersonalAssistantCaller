import { CallRecord, UserMemory } from '../types';

const CALLS_KEY = 'vox_calls';
const MEMORY_KEY = 'vox_memory';

export const getCalls = (): CallRecord[] => {
  try {
    const stored = localStorage.getItem(CALLS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error("Failed to load calls", e);
    return [];
  }
};

export const saveCall = (call: CallRecord) => {
  const calls = getCalls();
  const updatedCalls = [call, ...calls];
  localStorage.setItem(CALLS_KEY, JSON.stringify(updatedCalls));
  return updatedCalls;
};

export const getMemory = (): UserMemory => {
  try {
    const stored = localStorage.getItem(MEMORY_KEY);
    return stored ? JSON.parse(stored) : { preferences: [], lastInteraction: Date.now() };
  } catch (e) {
    return { preferences: [], lastInteraction: Date.now() };
  }
};

export const updateMemory = (newPreferences: string[]) => {
  const current = getMemory();
  const updated: UserMemory = {
    preferences: Array.from(new Set([...current.preferences, ...newPreferences])),
    lastInteraction: Date.now()
  };
  localStorage.setItem(MEMORY_KEY, JSON.stringify(updated));
  return updated;
};

export const clearHistory = () => {
  localStorage.removeItem(CALLS_KEY);
  localStorage.removeItem(MEMORY_KEY);
};