const TOGGLE_COMMAND = "toggle-mapper";
const FLYFF_HOST = "universe.flyff.com";
const CHARACTER_TITLE_PATTERN = /^(.+?)\s*-\s*Flyff Universe$/i;

const getCharacterNameFromTitle = (title: string): string | null => {
  const trimmed = title.trim();
  const match = trimmed.match(CHARACTER_TITLE_PATTERN);
  const candidate = match?.[1]?.trim();
  return candidate ? candidate : null;
};

const isFlyffPlayTab = (tab: chrome.tabs.Tab): boolean => {
  if (tab.status !== "complete") {
    return false;
  }

  const tabUrl = tab.url ?? "";
  if (!tabUrl) {
    return false;
  }

  try {
    const parsed = new URL(tabUrl);
    const isFlyffPlayUrl =
      parsed.hostname.toLowerCase() === FLYFF_HOST &&
      parsed.pathname.toLowerCase().startsWith("/play");

    if (!isFlyffPlayUrl) {
      return false;
    }
  } catch {
    return false;
  }

  const title = tab.title ?? "";
  return getCharacterNameFromTitle(title) !== null;
};

type KeyTriggerActionMessage = {
  name: string;
  key: string;
  delayMs: number;
};

const activeToggleTargets = new Map<string, number[]>();

const stopProfileToggle = (profileId: string): boolean => {
  const currentTargets = activeToggleTargets.get(profileId);
  if (!currentTargets || currentTargets.length === 0) {
    activeToggleTargets.delete(profileId);
    return false;
  }

  currentTargets.forEach((tabId) => {
    chrome.tabs
      .sendMessage(tabId, {
        type: "KEY_TRIGGER_STOP_TOGGLE",
        profileId,
      })
      .catch(() => undefined);
  });

  activeToggleTargets.delete(profileId);
  return true;
};

const startProfileToggle = (
  profileId: string,
  tabIds: number[],
  actions: KeyTriggerActionMessage[],
) => {
  activeToggleTargets.set(profileId, tabIds);
  tabIds.forEach((tabId) => {
    chrome.tabs
      .sendMessage(tabId, {
        type: "KEY_TRIGGER_START_TOGGLE",
        profileId,
        actions,
      })
      .catch(() => undefined);
  });
};

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== TOGGLE_COMMAND) {
    return;
  }

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!activeTab?.id) {
    return;
  }

  chrome.tabs
    .sendMessage(activeTab.id, { type: "TOGGLE_OVERLAY" })
    .catch(() => {
      return;
    });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" }).catch(() => {
    return;
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return;
  }

  const msg = message as { type?: string };

  if (msg.type === "KEY_TRIGGER_GET_TABS") {
    chrome.tabs
      .query({})
      .then((tabs) => {
        const mapped = tabs
          .filter((tab) => isFlyffPlayTab(tab))
          .filter(
            (tab): tab is chrome.tabs.Tab & { id: number } =>
              typeof tab.id === "number",
          )
          .sort((left, right) => {
            const leftWindow = left.windowId ?? Number.MAX_SAFE_INTEGER;
            const rightWindow = right.windowId ?? Number.MAX_SAFE_INTEGER;
            if (leftWindow !== rightWindow) {
              return leftWindow - rightWindow;
            }

            const leftIndex = left.index ?? Number.MAX_SAFE_INTEGER;
            const rightIndex = right.index ?? Number.MAX_SAFE_INTEGER;
            return leftIndex - rightIndex;
          })
          .map((tab) => {
            const title = tab.title ?? "";
            const name = getCharacterNameFromTitle(title);
            if (!name) {
              return null;
            }

            return {
              id: tab.id,
              title,
              name,
            };
          })
          .filter(
            (tab): tab is { id: number; title: string; name: string } =>
              tab !== null,
          );

        sendResponse({ tabs: mapped });
      })
      .catch(() => sendResponse({ tabs: [] }));

    return true;
  }

  if (msg.type === "KEY_TRIGGER_REQUEST_TABS_RELOAD") {
    chrome.tabs
      .query({})
      .then((tabs) => {
        tabs
          .filter((tab) => isFlyffPlayTab(tab))
          .filter(
            (tab): tab is chrome.tabs.Tab & { id: number } =>
              typeof tab.id === "number",
          )
          .forEach((tab) => {
            chrome.tabs
              .sendMessage(tab.id, { type: "KEY_TRIGGER_RELOAD_TABS" })
              .catch(() => undefined);
          });

        sendResponse({ ok: true });
      })
      .catch(() => sendResponse({ ok: false }));

    return true;
  }

  if (msg.type === "KEY_TRIGGER_RUN_ONCE") {
    const payload = message as {
      tabIds?: number[];
      actions?: KeyTriggerActionMessage[];
      profileId?: string;
    };

    const tabIds = Array.isArray(payload.tabIds)
      ? payload.tabIds.filter((id): id is number => Number.isFinite(id))
      : [];
    const actions = Array.isArray(payload.actions)
      ? payload.actions.filter(
          (action) => typeof action === "object" && action !== null,
        )
      : [];

    tabIds.forEach((tabId) => {
      chrome.tabs
        .sendMessage(tabId, {
          type: "KEY_TRIGGER_EXECUTE_ONCE",
          profileId: payload.profileId,
          actions,
        })
        .catch(() => undefined);
    });

    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KEY_TRIGGER_TOGGLE") {
    const payload = message as {
      tabIds?: number[];
      actions?: KeyTriggerActionMessage[];
      profileId?: string;
    };

    if (!payload.profileId) {
      sendResponse({ ok: false });
      return;
    }

    const currentTargets = activeToggleTargets.get(payload.profileId);
    if (currentTargets && currentTargets.length > 0) {
      currentTargets.forEach((tabId) => {
        chrome.tabs
          .sendMessage(tabId, {
            type: "KEY_TRIGGER_STOP_TOGGLE",
            profileId: payload.profileId,
          })
          .catch(() => undefined);
      });
      activeToggleTargets.delete(payload.profileId);
      sendResponse({ ok: true, active: false });
      return;
    }

    const tabIds = Array.isArray(payload.tabIds)
      ? payload.tabIds.filter((id): id is number => Number.isFinite(id))
      : [];
    const actions = Array.isArray(payload.actions)
      ? payload.actions.filter(
          (action) => typeof action === "object" && action !== null,
        )
      : [];

    activeToggleTargets.set(payload.profileId, tabIds);
    tabIds.forEach((tabId) => {
      chrome.tabs
        .sendMessage(tabId, {
          type: "KEY_TRIGGER_START_TOGGLE",
          profileId: payload.profileId,
          actions,
        })
        .catch(() => undefined);
    });

    sendResponse({ ok: true, active: true });
    return;
  }

  if (msg.type === "KEY_TRIGGER_TOGGLE_GROUP") {
    const payload = message as {
      tabIds?: number[];
      profiles?: Array<{
        profileId?: string;
        actions?: KeyTriggerActionMessage[];
      }>;
    };

    const profiles = Array.isArray(payload.profiles)
      ? payload.profiles
          .filter(
            (
              profile,
            ): profile is {
              profileId: string;
              actions?: KeyTriggerActionMessage[];
            } =>
              typeof profile === "object" &&
              profile !== null &&
              typeof profile.profileId === "string" &&
              profile.profileId.trim().length > 0,
          )
          .map((profile) => ({
            profileId: profile.profileId,
            actions: Array.isArray(profile.actions)
              ? profile.actions.filter(
                  (action) => typeof action === "object" && action !== null,
                )
              : [],
          }))
      : [];

    if (profiles.length === 0) {
      sendResponse({ ok: false });
      return;
    }

    const tabIds = Array.isArray(payload.tabIds)
      ? payload.tabIds.filter((id): id is number => Number.isFinite(id))
      : [];

    let hasActiveProfile = false;
    let hasStartedProfile = false;

    profiles.forEach((profile) => {
      const targets = activeToggleTargets.get(profile.profileId);
      const isActive = Array.isArray(targets) && targets.length > 0;

      if (isActive) {
        hasActiveProfile =
          stopProfileToggle(profile.profileId) || hasActiveProfile;
        return;
      }

      startProfileToggle(profile.profileId, tabIds, profile.actions);
      hasStartedProfile = true;
    });

    sendResponse({ ok: true, active: hasStartedProfile && !hasActiveProfile });
    return;
  }

  if (msg.type === "KEY_TRIGGER_STOP_ALL") {
    Array.from(activeToggleTargets.keys()).forEach((profileId) => {
      stopProfileToggle(profileId);
    });
    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "MOUSE_SYNC_BROADCAST") {
    const payload = message as {
      tabIds?: number[];
      event?: unknown;
    };

    const sourceTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;

    const targetTabIds = Array.isArray(payload.tabIds)
      ? payload.tabIds.filter((id): id is number => Number.isFinite(id))
      : [];

    targetTabIds.forEach((tabId) => {
      if (sourceTabId !== null && tabId === sourceTabId) {
        return;
      }

      chrome.tabs
        .sendMessage(tabId, {
          type: "MOUSE_SYNC_APPLY",
          sourceTabId,
          event: payload.event,
        })
        .catch(() => undefined);
    });

    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "KEYBOARD_SYNC_BROADCAST") {
    const payload = message as {
      tabIds?: number[];
      keyEvent?: unknown;
    };

    const sourceTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;

    const targetTabIds = Array.isArray(payload.tabIds)
      ? payload.tabIds.filter((id): id is number => Number.isFinite(id))
      : [];

    targetTabIds.forEach((tabId) => {
      if (sourceTabId !== null && tabId === sourceTabId) {
        return;
      }

      chrome.tabs
        .sendMessage(tabId, {
          type: "KEYBOARD_SYNC_APPLY",
          sourceTabId,
          keyEvent: payload.keyEvent,
        })
        .catch(() => undefined);
    });

    sendResponse({ ok: true });
    return;
  }

  if (msg.type === "GET_CURRENT_TAB_ID") {
    const senderTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;
    sendResponse({ tabId: senderTabId });
    return;
  }

  if (msg.type === "CAPTURE_SCREENSHOT") {
    const senderTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;
    if (senderTabId === null) {
      sendResponse({ ok: false });
      return;
    }
    chrome.tabs.get(senderTabId, (tab) => {
      if (chrome.runtime.lastError || !tab.windowId) {
        sendResponse({ ok: false });
        return;
      }
      chrome.tabs.captureVisibleTab(
        tab.windowId,
        { format: "jpeg", quality: 40 },
        (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            sendResponse({ ok: false });
            return;
          }
          sendResponse({ ok: true, dataUrl });
        },
      );
    });
    return true;
  }

  if (msg.type === "SHOW_EXTENSION_NOTIFICATION") {
    const payload = message as {
      title?: unknown;
      message?: unknown;
    };

    const title =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title
        : "Flyff Utility";
    const notificationMessage =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : "";

    if (!notificationMessage || !chrome.notifications?.create) {
      sendResponse({ ok: false });
      return;
    }

    const notificationId = `flyff-utility-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    chrome.notifications.create(
      notificationId,
      {
        type: "basic",
        iconUrl: "flyff-u.png",
        title,
        message: notificationMessage,
        priority: 2,
      },
      () => {
        if (chrome.runtime.lastError) {
          sendResponse({ ok: false });
          return;
        }

        sendResponse({ ok: true });
      },
    );

    return true;
  }
});
