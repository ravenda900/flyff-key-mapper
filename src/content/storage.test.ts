import "fake-indexeddb/auto";
import { compressToUTF16 } from "lz-string";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, storage } from "./storage";
import { getDB, idbGet } from "./storage-idb";
import type {
  KeyTriggerState,
  MapperProfilesState,
  MapperSettings,
  ShapeMapping,
} from "./types";

const PROFILES_KEY = "flyff-mapper-profiles-v1";
const SHAPES_KEY = "flyff-mapper-shapes-v1";
const SETTINGS_KEY = "flyff-mapper-settings-v1";
const PROFILE_BACKUP_KEY = `${PROFILES_KEY}::backup`;
const KEY_TRIGGER_KEY = "flyff-mapper-key-trigger-v1";

type LocalStorageMock = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

const createLocalStorageMock = (): LocalStorageMock => {
  const store = new Map<string, string>();

  return {
    getItem(key) {
      return store.has(key) ? (store.get(key) ?? null) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
};

const flushAsyncPersistence = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

const waitForIdbValue = async <TValue>(
  storeName: string,
  key: string,
  expected: TValue,
) => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      expect(await idbGet<TValue>(storeName, key)).toEqual(expected);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
};

describe("storage migration and CRUD persistence", () => {
  beforeEach(async () => {
    const db = await getDB();
    for (const storeName of Array.from(db.objectStoreNames)) {
      await db.clear(storeName);
    }

    storage.resetForTests();

    const localStorage = createLocalStorageMock();
    vi.stubGlobal("window", { localStorage });
    vi.stubGlobal("BroadcastChannel", undefined);
  });

  it("migrates legacy localStorage data and preserves add/edit/delete persistence", async () => {
    const legacySettings: MapperSettings = {
      ...DEFAULT_SETTINGS,
      theme: "dark",
      mobilePushEnabled: true,
      mobilePushDiscordBotUrl: "https://discord.example/webhook",
      mobilePushDiscordUserId: "user-1",
      mobilePushDiscordApiKey: "api-key-1",
      keyTriggerPresetSwitchShortcut: "Alt+Shift+P",
    };

    const initialShape: ShapeMapping = {
      id: "shape-1",
      type: "rectangle",
      x: 10,
      y: 15,
      width: 40,
      height: 25,
      rotation: 0,
      opacity: 1,
      keyBinding: "F1",
      delayMs: 0,
      triggerType: "once",
    };

    const migratedProfiles: MapperProfilesState = {
      activeProfileId: "profile-1",
      profiles: [
        {
          id: "profile-1",
          name: "Migrated",
          shapes: [initialShape],
        },
      ],
    };
    const legacyMigratedProfiles = {
      activeProfileId: "profile-1",
      profiles: [
        {
          id: "profile-1",
          name: "Migrated",
          shapes: [initialShape],
          settings: legacySettings,
        },
      ],
    };
    const backupProfiles: MapperProfilesState = {
      activeProfileId: "profile-backup",
      profiles: [
        {
          id: "profile-backup",
          name: "Backup",
          shapes: [
            {
              ...initialShape,
              id: "shape-backup",
              keyBinding: "F9",
            },
          ],
        },
      ],
    };
    const legacyBackupProfiles = {
      activeProfileId: "profile-backup",
      profiles: [
        {
          id: "profile-backup",
          name: "Backup",
          shapes: [
            {
              ...initialShape,
              id: "shape-backup",
              keyBinding: "F9",
            },
          ],
          settings: legacySettings,
        },
      ],
    };

    window.localStorage.setItem(
      PROFILES_KEY,
      `__lz_v1__${compressToUTF16(JSON.stringify(legacyMigratedProfiles))}`,
    );
    window.localStorage.setItem(
      SETTINGS_KEY,
      `__lz_v1__${compressToUTF16(JSON.stringify(legacySettings))}`,
    );
    window.localStorage.setItem(
      SHAPES_KEY,
      `__lz_v1__${compressToUTF16(JSON.stringify([initialShape]))}`,
    );
    window.localStorage.setItem(
      PROFILE_BACKUP_KEY,
      `__lz_v1__${compressToUTF16(JSON.stringify(legacyBackupProfiles))}`,
    );

    await storage.initialize();

    expect(storage.loadProfiles()).toEqual(migratedProfiles);
    expect(storage.loadSettings()).toMatchObject({
      theme: "dark",
      mobilePushEnabled: true,
      mobilePushDiscordBotUrl: "https://discord.example/webhook",
      mobilePushDiscordUserId: "user-1",
      mobilePushDiscordApiKey: "api-key-1",
    });
    expect(storage.loadShapes()).toEqual([initialShape]);

    expect(window.localStorage.getItem(PROFILES_KEY)).toBeNull();
    expect(window.localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(window.localStorage.getItem(SHAPES_KEY)).toBeNull();
    expect(window.localStorage.getItem(PROFILE_BACKUP_KEY)).toBeNull();

    expect(await idbGet("profiles", PROFILES_KEY)).toEqual(migratedProfiles);
    expect(await idbGet("profiles", PROFILE_BACKUP_KEY)).toEqual(
      backupProfiles,
    );
    expect(await idbGet("settings", SETTINGS_KEY)).toEqual(legacySettings);
    expect(await idbGet("shapes", SHAPES_KEY)).toEqual([initialShape]);

    expect(storage.restoreProfilesFromBackup()).toEqual(backupProfiles);

    const addedProfiles: MapperProfilesState = {
      activeProfileId: "profile-2",
      profiles: [
        ...migratedProfiles.profiles,
        {
          id: "profile-2",
          name: "Added",
          shapes: [],
        },
      ],
    };

    storage.saveProfiles(addedProfiles);
    await waitForIdbValue("profiles", PROFILES_KEY, addedProfiles);
    expect(storage.loadProfiles()).toEqual(addedProfiles);

    const editedProfiles: MapperProfilesState = {
      activeProfileId: "profile-2",
      profiles: addedProfiles.profiles.map((profile) =>
        profile.id === "profile-1"
          ? {
              ...profile,
              name: "Migrated Edited",
              shapes: profile.shapes.map((shape) =>
                shape.id === "shape-1" ? { ...shape, width: 88 } : shape,
              ),
            }
          : profile,
      ),
    };

    storage.saveProfiles(editedProfiles);
    await waitForIdbValue("profiles", PROFILES_KEY, editedProfiles);
    expect(storage.loadProfiles()).toEqual(editedProfiles);

    const deletedProfiles: MapperProfilesState = {
      activeProfileId: "profile-1",
      profiles: editedProfiles.profiles.filter(
        (profile) => profile.id !== "profile-2",
      ),
    };

    storage.saveProfiles(deletedProfiles);
    await waitForIdbValue("profiles", PROFILES_KEY, deletedProfiles);
    expect(storage.loadProfiles()).toEqual(deletedProfiles);

    const addedShapes: ShapeMapping[] = [
      initialShape,
      {
        ...initialShape,
        id: "shape-2",
        keyBinding: "F2",
        x: 20,
      },
    ];
    storage.saveShapes(addedShapes);
    await waitForIdbValue("shapes", SHAPES_KEY, addedShapes);

    const editedShapes: ShapeMapping[] = addedShapes.map((shape) =>
      shape.id === "shape-2" ? { ...shape, opacity: 0.5, height: 44 } : shape,
    );
    storage.saveShapes(editedShapes);
    await waitForIdbValue("shapes", SHAPES_KEY, editedShapes);
    expect(storage.loadShapes()).toEqual(editedShapes);

    const deletedShapes = editedShapes.filter(
      (shape) => shape.id !== "shape-1",
    );
    storage.saveShapes(deletedShapes);
    await waitForIdbValue("shapes", SHAPES_KEY, deletedShapes);
    expect(storage.loadShapes()).toEqual(deletedShapes);

    await flushAsyncPersistence();
  });

  it("seeds shared settings from legacy profile data when the settings record is missing", async () => {
    const profileSettings: MapperSettings = {
      ...DEFAULT_SETTINGS,
      strictPassthrough: false,
      showSnapIndicators: false,
      showShapeTooltips: false,
      shapeOpacity: 0.4,
      addKeyMapShortcut: "Alt+Shift+1",
      toggleShapesShortcut: "Alt+Shift+2",
      setZeroOpacityShortcut: "Alt+Shift+3",
      subscriptionAccessToken: "token-from-profile",
      mobilePushEnabled: true,
    };

    const legacyProfiles: MapperProfilesState = {
      activeProfileId: "profile-legacy",
      profiles: [
        {
          id: "profile-legacy",
          name: "Legacy",
          shapes: [],
        },
      ],
    };
    const legacyProfilesRaw = {
      activeProfileId: "profile-legacy",
      profiles: [
        {
          id: "profile-legacy",
          name: "Legacy",
          shapes: [],
          settings: profileSettings,
        },
      ],
    };

    window.localStorage.setItem(
      PROFILES_KEY,
      `__lz_v1__${compressToUTF16(JSON.stringify(legacyProfilesRaw))}`,
    );

    await storage.initialize();

    expect(storage.loadProfiles()).toEqual(legacyProfiles);
    expect(storage.loadSettings()).toMatchObject({
      strictPassthrough: false,
      showSnapIndicators: false,
      showShapeTooltips: false,
      shapeOpacity: 0.4,
      addKeyMapShortcut: "Alt+Shift+1",
      toggleShapesShortcut: "Alt+Shift+2",
      setZeroOpacityShortcut: "Alt+Shift+3",
      subscriptionAccessToken: "token-from-profile",
    });

    await waitForIdbValue("settings", SETTINGS_KEY, storage.loadSettings());
  });

  it("normalizes and persists key trigger preset state", async () => {
    await storage.initialize();

    const incomingState = {
      selectedPresetId: "missing-preset",
      presets: [
        {
          id: "preset-alpha",
          name: "   ",
          profiles: [
            {
              id: "",
              profileIdentifier: "  ",
              name: "   ",
              enabled: true,
              triggerType: "repeat",
              repeatCount: 0,
              triggerKey: "  F3  ",
              delayMode: "synchronous",
              actions: [
                {
                  id: "",
                  name: "   ",
                  key: "   ",
                  delayMs: -150,
                  actionTriggerType: "repeat",
                  actionRepeatCount: 0,
                },
              ],
            },
          ],
        },
      ],
      characterPresetMapping: {
        "": "preset-alpha",
        Alice: "preset-alpha",
        Bob: "missing-preset",
      },
    } as unknown as KeyTriggerState;

    storage.saveKeyTriggerState(incomingState);

    const loaded = storage.loadKeyTriggerState();
    expect(loaded.selectedPresetId).toBe("preset-alpha");
    expect(loaded.presets).toHaveLength(1);
    expect(loaded.presets[0].name).toBe("Default");
    expect(loaded.presets[0].profiles[0].name).toBe("Profile");
    expect(loaded.presets[0].profiles[0].triggerKey).toBe("F3");
    expect(loaded.presets[0].profiles[0].repeatCount).toBe(1);
    expect(loaded.presets[0].profiles[0].actions[0].name).toBe("Action");
    expect(loaded.presets[0].profiles[0].actions[0].delayMs).toBe(0);
    expect(loaded.presets[0].profiles[0].actions[0].actionRepeatCount).toBe(1);
    expect(loaded.characterPresetMapping).toEqual({ Alice: "preset-alpha" });

    await waitForIdbValue("keyTrigger", KEY_TRIGGER_KEY, loaded);
  });

  it("accepts legacy key trigger profile-only payloads", async () => {
    await storage.initialize();

    const legacyState = {
      profiles: [
        {
          id: "legacy-profile",
          profileIdentifier: "legacy-identifier",
          name: "Legacy Profile",
          enabled: true,
          triggerType: "once",
          triggerKey: "F9",
          delayMode: "sequential",
          actions: [
            {
              id: "legacy-action",
              name: "Legacy Action",
              key: "1",
              delayMs: 40,
            },
          ],
        },
      ],
    };

    storage.saveKeyTriggerState(legacyState as unknown as KeyTriggerState);

    const loaded = storage.loadKeyTriggerState();
    expect(loaded.selectedPresetId).toBe("kt-preset-default");
    expect(loaded.presets).toHaveLength(1);
    expect(loaded.presets[0].id).toBe("kt-preset-default");
    expect(loaded.presets[0].profiles).toHaveLength(1);
    expect(loaded.presets[0].profiles[0].name).toBe("Legacy Profile");
    expect(loaded.characterPresetMapping).toEqual({});

    await waitForIdbValue("keyTrigger", KEY_TRIGGER_KEY, loaded);
  });

  it("persists mapper profiles without profile-level settings", async () => {
    await storage.initialize();

    const profileState: MapperProfilesState = {
      activeProfileId: "profile-1",
      profiles: [
        {
          id: "profile-1",
          name: "Profile 1",
          shapes: [],
        },
      ],
    };

    storage.saveProfiles(profileState);

    const persisted = await idbGet<MapperProfilesState>(
      "profiles",
      PROFILES_KEY,
    );

    expect(persisted).toBeTruthy();
    expect(persisted?.profiles[0]).toBeTruthy();
    expect(
      Object.prototype.hasOwnProperty.call(
        persisted?.profiles[0] ?? {},
        "settings",
      ),
    ).toBe(false);
  });
});
