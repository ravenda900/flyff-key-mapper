import "fake-indexeddb/auto";
import { deleteDB, openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { getDB, resetDbConnectionForTests } from "./storage-idb";

const DB_NAME = "flyff-mapper";
const LEGACY_STORES = [
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

const REQUIRED_NEW_STORES = [
  "sharedRunState",
  "sharedAutoStopState",
  "sharedRecaptchaSignal",
];

describe("storage-idb schema upgrades", () => {
  beforeEach(async () => {
    await resetDbConnectionForTests();
    await deleteDB(DB_NAME);
  });

  it("adds missing object stores when upgrading an existing database", async () => {
    const legacyDb = await openDB(DB_NAME, 1, {
      upgrade(db) {
        for (const store of LEGACY_STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        }
      },
    });
    legacyDb.close();

    const upgradedDb = await getDB();
    const storeNames = Array.from(upgradedDb.objectStoreNames);

    expect(storeNames).toEqual(expect.arrayContaining(LEGACY_STORES));
    expect(storeNames).toEqual(expect.arrayContaining(REQUIRED_NEW_STORES));
  });
});
