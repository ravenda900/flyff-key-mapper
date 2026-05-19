// IndexedDB wrapper for Flyff Mapper persistent storage
// This replaces localStorage for all persistent state (profiles, shapes, settings, etc.)
// API is compatible with the existing storage.ts interface

import { openDB } from "idb";
import type { IDBPDatabase } from "idb";

export type FlyffMapperDB = IDBPDatabase<any>;

const DB_NAME = "flyff-mapper";
const DB_VERSION = 1;

const STORE_KEYS = [
  "profiles",
  "shapes",
  "settings",
  "uiState",
  "keyTrigger",
  "keyTriggerTargetTabs",
  "keyTriggerTargetTabNames",
  "keyTriggerCharacterProfiles",
  "mapperCharacterProfiles",
];

let dbPromise: Promise<FlyffMapperDB> | null = null;

export function getDB(): Promise<FlyffMapperDB> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const store of STORE_KEYS) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function idbSet<T = any>(
  store: string,
  key: string,
  value: T,
): Promise<void> {
  const db = await getDB();
  await db.put(store, value, key);
}

export async function idbGet<T = any>(
  store: string,
  key: string,
): Promise<T | undefined> {
  const db = await getDB();
  return db.get(store, key);
}

export async function idbDelete(store: string, key: string): Promise<void> {
  const db = await getDB();
  await db.delete(store, key);
}

export async function idbClear(store: string): Promise<void> {
  const db = await getDB();
  await db.clear(store);
}

export async function idbGetAll<T = any>(store: string): Promise<T[]> {
  const db = await getDB();
  return db.getAll(store);
}
