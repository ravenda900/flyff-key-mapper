const TOGGLE_COMMAND = "toggle-mapper";
const FLYFF_HOST = "universe.flyff.com";
const CHARACTER_TITLE_PATTERN = /^(.+?)\s*-\s*Flyff Universe$/i;
const NOTIFICATION_DEDUPE_MAX_AGE_MS = 10 * 60 * 1000;
const notificationSeenByKey = new Map<string, number>();

type MobilePushPayload = {
  enabled?: unknown;
  provider?: unknown;
  discordBotUrl?: unknown;
  discordUserId?: unknown;
  discordApiKey?: unknown;
};

type DiscordNotificationResult = {
  ok: boolean;
  error?: string;
};

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

const isFlyffPlaySenderTab = (tab?: chrome.tabs.Tab): boolean => {
  if (!tab) {
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

  return getCharacterNameFromTitle(tab.title ?? "") !== null;
};

const pruneNotificationDedupes = (now: number) => {
  notificationSeenByKey.forEach((seenAt, key) => {
    if (now - seenAt > NOTIFICATION_DEDUPE_MAX_AGE_MS) {
      notificationSeenByKey.delete(key);
    }
  });
};

const sendDiscordNotification = async (
  title: string,
  body: string,
  mobilePush: MobilePushPayload | undefined,
): Promise<DiscordNotificationResult> => {
  const enabled = mobilePush?.enabled === true;
  const provider =
    typeof mobilePush?.provider === "string" ? mobilePush.provider : "";
  const botUrl =
    typeof mobilePush?.discordBotUrl === "string"
      ? mobilePush.discordBotUrl.trim()
      : "";
  const userId =
    typeof mobilePush?.discordUserId === "string"
      ? mobilePush.discordUserId.trim()
      : "";
  const apiKey =
    typeof mobilePush?.discordApiKey === "string"
      ? mobilePush.discordApiKey.trim()
      : "";

  if (!enabled || provider !== "discord" || !botUrl || !userId || !apiKey) {
    return {
      ok: false,
      error: "Missing Discord mobile push config (URL, User ID, or API key).",
    };
  }

  const normalizedBotUrl = botUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${normalizedBotUrl}/notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ userId, message: `**${title}**\n${body}` }),
    });

    if (response.ok) {
      return { ok: true };
    }

    const responseText = await response.text().catch(() => "");
    const trimmed = responseText.trim();

    if (response.status === 401) {
      return {
        ok: false,
        error: "Discord bot unauthorized (401). Check your API key.",
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        error: "Discord bot rate limited (429). Try again shortly.",
      };
    }

    return {
      ok: false,
      error: trimmed
        ? `Discord bot request failed (${response.status}): ${trimmed}`
        : `Discord bot request failed (${response.status}).`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Unable to reach Discord bot.";

    return { ok: false, error: message };
  }
};

const testDiscordConnection = async (
  mobilePush: MobilePushPayload | undefined,
): Promise<DiscordNotificationResult> => {
  const provider =
    typeof mobilePush?.provider === "string" ? mobilePush.provider : "";
  const botUrl =
    typeof mobilePush?.discordBotUrl === "string"
      ? mobilePush.discordBotUrl.trim()
      : "";
  const apiKey =
    typeof mobilePush?.discordApiKey === "string"
      ? mobilePush.discordApiKey.trim()
      : "";

  if (provider !== "discord" || !botUrl) {
    return {
      ok: false,
      error: "Missing Discord bot URL.",
    };
  }

  const normalizedBotUrl = botUrl.replace(/\/+$/, "");

  try {
    const response = await fetch(`${normalizedBotUrl}/health`, {
      method: "GET",
      headers: apiKey ? { "x-api-key": apiKey } : undefined,
    });

    if (response.ok) {
      return { ok: true };
    }

    const responseText = await response.text().catch(() => "");
    const trimmed = responseText.trim();

    if (response.status === 401) {
      return {
        ok: false,
        error: "Discord bot unauthorized (401). Check your API key.",
      };
    }

    return {
      ok: false,
      error: trimmed
        ? `Discord bot health check failed (${response.status}): ${trimmed}`
        : `Discord bot health check failed (${response.status}).`,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Unable to reach Discord bot.";

    return { ok: false, error: message };
  }
};

type KeyTriggerActionMessage = {
  name: string;
  key: string;
  delayMs: number;
  enabled?: boolean;
  actionTriggerType?: "once" | "repeat";
  actionRepeatCount?: number;
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
};

type ActiveToggleTarget = {
  tabIds: number[];
  ownerTabId: number | null;
  actions: KeyTriggerActionMessage[];
  chainDepth?: number;
  delayMode?: "sequential" | "synchronous";
};

const activeToggleTargets = new Map<string, ActiveToggleTarget>();

const normalizeTabIds = (ids: unknown): number[] =>
  Array.from(
    new Set(
      Array.isArray(ids)
        ? ids.filter(
            (id): id is number => Number.isInteger(id) && Number(id) > 0,
          )
        : [],
    ),
  );

const attachDebugger = (
  target: chrome.debugger.Debuggee,
  version = "1.3",
): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.debugger.attach(target, version, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });

const detachDebugger = (target: chrome.debugger.Debuggee): Promise<void> =>
  new Promise((resolve) => {
    chrome.debugger.detach(target, () => {
      resolve();
    });
  });

const sendDebuggerMouseEvent = (
  target: chrome.debugger.Debuggee,
  params: {
    type: "mouseMoved" | "mousePressed" | "mouseReleased";
    x: number;
    y: number;
    button?: "none" | "left" | "middle" | "right";
    buttons?: number;
    clickCount?: number;
  },
): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      target,
      "Input.dispatchMouseEvent",
      params,
      () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      },
    );
  });

const dispatchNativeMouseClick = async (
  tabId: number,
  x: number,
  y: number,
  movePath?: Array<{ x: number; y: number }>,
): Promise<void> => {
  const target: chrome.debugger.Debuggee = { tabId };
  await attachDebugger(target);
  try {
    const normalizedPath = Array.isArray(movePath)
      ? movePath.filter(
          (point): point is { x: number; y: number } =>
            Number.isFinite(point.x) && Number.isFinite(point.y),
        )
      : [];

    for (const point of normalizedPath) {
      await sendDebuggerMouseEvent(target, {
        type: "mouseMoved",
        x: Math.round(point.x),
        y: Math.round(point.y),
        button: "none",
        buttons: 0,
      });
    }

    await sendDebuggerMouseEvent(target, {
      type: "mouseMoved",
      x: Math.round(x),
      y: Math.round(y),
      button: "none",
      buttons: 0,
    });
    await sendDebuggerMouseEvent(target, {
      type: "mousePressed",
      x: Math.round(x),
      y: Math.round(y),
      button: "left",
      buttons: 1,
      clickCount: 1,
    });
    await sendDebuggerMouseEvent(target, {
      type: "mouseReleased",
      x: Math.round(x),
      y: Math.round(y),
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await detachDebugger(target);
  }
};

const probeNativeMouseClickSupport = async (tabId: number): Promise<void> => {
  const target: chrome.debugger.Debuggee = { tabId };
  await attachDebugger(target);
  await detachDebugger(target);
};

const stopProfileToggle = (profileId: string): boolean => {
  const currentTargets = activeToggleTargets.get(profileId);
  if (!currentTargets || currentTargets.tabIds.length === 0) {
    activeToggleTargets.delete(profileId);
    return false;
  }

  currentTargets.tabIds.forEach((tabId) => {
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
  options?: {
    ownerTabId?: number | null;
    chainDepth?: number;
    delayMode?: "sequential" | "synchronous";
  },
) => {
  activeToggleTargets.set(profileId, {
    tabIds,
    ownerTabId: options?.ownerTabId ?? null,
    actions,
    chainDepth: options?.chainDepth,
    delayMode: options?.delayMode,
  });
  tabIds.forEach((tabId) => {
    chrome.tabs
      .sendMessage(tabId, {
        type: "KEY_TRIGGER_START_TOGGLE",
        profileId,
        tabIds,
        actions,
        chainDepth: options?.chainDepth,
        delayMode: options?.delayMode,
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
      chainDepth?: number;
      runCount?: number;
      delayMode?: "sequential" | "synchronous";
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
          chainDepth: payload.chainDepth,
          runCount: payload.runCount,
          delayMode: payload.delayMode,
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
      chainDepth?: number;
      delayMode?: "sequential" | "synchronous";
      lockToTab?: boolean;
    };
    const senderTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;

    if (!payload.profileId) {
      sendResponse({ ok: false });
      return;
    }

    const currentTargets = activeToggleTargets.get(payload.profileId);
    if (currentTargets && currentTargets.tabIds.length > 0) {
      if (
        currentTargets.ownerTabId !== null &&
        currentTargets.ownerTabId !== senderTabId
      ) {
        sendResponse({ ok: true, active: true });
        return;
      }

      currentTargets.tabIds.forEach((tabId) => {
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

    const tabIds = normalizeTabIds(payload.tabIds);
    const actions = Array.isArray(payload.actions)
      ? payload.actions.filter(
          (action) => typeof action === "object" && action !== null,
        )
      : [];

    startProfileToggle(payload.profileId, tabIds, actions, {
      ownerTabId: payload.lockToTab === true ? senderTabId : null,
      chainDepth: payload.chainDepth,
      delayMode: payload.delayMode,
    });

    sendResponse({ ok: true, active: true });
    return;
  }

  if (msg.type === "KEY_TRIGGER_SYNC_TOGGLE_TABS") {
    const payload = message as {
      tabIds?: number[];
    };

    const tabIds = normalizeTabIds(payload.tabIds);
    const newTabSet = new Set(tabIds);

    // Always stop timers on any Flyff tab that is no longer in the selection,
    // even when activeToggleTargets is empty (e.g. after service-worker restart).
    chrome.tabs
      .query({})
      .then((allTabs) => {
        allTabs
          .filter((tab) => isFlyffPlayTab(tab))
          .filter(
            (tab): tab is chrome.tabs.Tab & { id: number } =>
              typeof tab.id === "number" && !newTabSet.has(tab.id),
          )
          .forEach((tab) => {
            chrome.tabs
              .sendMessage(tab.id, { type: "KEY_TRIGGER_STOP_ALL" })
              .catch(() => undefined);
          });
      })
      .catch(() => undefined);

    // Rebind active toggle profiles to the new tab set.
    activeToggleTargets.forEach((target, profileId) => {
      target.tabIds.forEach((tabId) => {
        chrome.tabs
          .sendMessage(tabId, {
            type: "KEY_TRIGGER_STOP_TOGGLE",
            profileId,
          })
          .catch(() => undefined);
      });

      tabIds.forEach((tabId) => {
        chrome.tabs
          .sendMessage(tabId, {
            type: "KEY_TRIGGER_START_TOGGLE",
            profileId,
            actions: target.actions,
            chainDepth: target.chainDepth,
            delayMode: target.delayMode,
          })
          .catch(() => undefined);
      });

      activeToggleTargets.set(profileId, {
        ...target,
        tabIds,
      });
    });

    sendResponse({ ok: true });
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

    const tabIds = normalizeTabIds(payload.tabIds);

    let hasActiveProfile = false;
    let hasStartedProfile = false;

    profiles.forEach((profile) => {
      const targets = activeToggleTargets.get(profile.profileId);
      const isActive = !!targets && targets.tabIds.length > 0;

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

  if (msg.type === "DISPATCH_NATIVE_MOUSE_CLICK") {
    const senderTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;
    if (senderTabId === null) {
      sendResponse({ ok: false, error: "Missing sender tab." });
      return;
    }

    const payload = message as {
      x?: unknown;
      y?: unknown;
      movePath?: Array<{ x: number; y: number }>;
    };
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      sendResponse({ ok: false, error: "Invalid click coordinates." });
      return;
    }

    void dispatchNativeMouseClick(senderTabId, x, y, payload.movePath)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error && error.message
            ? error.message
            : "Native click failed.";
        sendResponse({ ok: false, error: errorMessage });
      });

    return true;
  }

  if (msg.type === "NATIVE_CLICK_HEALTHCHECK") {
    const senderTabId =
      typeof sender?.tab?.id === "number" ? sender.tab.id : null;
    if (senderTabId === null) {
      sendResponse({ ok: false, error: "Missing sender tab." });
      return;
    }

    void probeNativeMouseClickSupport(senderTabId)
      .then(() => {
        sendResponse({ ok: true });
      })
      .catch((error) => {
        const errorMessage =
          error instanceof Error && error.message
            ? error.message
            : "Native click is unavailable for this tab.";
        sendResponse({ ok: false, error: errorMessage });
      });

    return true;
  }

  if (msg.type === "SHOW_EXTENSION_NOTIFICATION") {
    const payload = message as {
      title?: unknown;
      message?: unknown;
      dedupeKey?: unknown;
      dedupeWindowMs?: unknown;
      mobilePush?: MobilePushPayload;
    };

    const title =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title
        : "Flyff Utility";
    const notificationMessage =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message
        : "";

    const isEligibleSender = isFlyffPlaySenderTab(sender.tab);

    if (!isEligibleSender) {
      sendResponse({ ok: true, skipped: true });
      return;
    }

    if (!notificationMessage || !chrome.notifications?.create) {
      sendResponse({ ok: false });
      return;
    }

    const now = Date.now();
    pruneNotificationDedupes(now);

    const defaultDedupeKey = `${title.toLowerCase()}::${notificationMessage.toLowerCase()}`;
    const dedupeKey =
      typeof payload.dedupeKey === "string" &&
      payload.dedupeKey.trim().length > 0
        ? payload.dedupeKey.trim()
        : defaultDedupeKey;
    const dedupeWindowMs =
      typeof payload.dedupeWindowMs === "number" &&
      Number.isFinite(payload.dedupeWindowMs) &&
      payload.dedupeWindowMs >= 0
        ? payload.dedupeWindowMs
        : 3000;

    const lastSeenAt = notificationSeenByKey.get(dedupeKey) ?? 0;
    if (now - lastSeenAt < dedupeWindowMs) {
      sendResponse({ ok: true, deduped: true });
      return;
    }

    notificationSeenByKey.set(dedupeKey, now);

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
          notificationSeenByKey.delete(dedupeKey);
          sendResponse({ ok: false });
          return;
        }

        void sendDiscordNotification(
          title,
          notificationMessage,
          payload.mobilePush,
        )
          .then((result) => {
            if (!result.ok && result.error) {
              console.warn("Discord mobile push failed:", result.error);
            }
          })
          .catch(() => undefined);
        sendResponse({ ok: true });
      },
    );

    return true;
  }

  if (msg.type === "SEND_TEST_MOBILE_PUSH") {
    const payload = message as {
      title?: unknown;
      message?: unknown;
      mobilePush?: MobilePushPayload;
    };

    const isEligibleSender = isFlyffPlaySenderTab(sender.tab);
    if (!isEligibleSender) {
      sendResponse({ ok: false, error: "Not a Flyff play tab." });
      return;
    }

    const title =
      typeof payload.title === "string" && payload.title.trim().length > 0
        ? payload.title.trim()
        : "Flyff Utility - Test Push";
    const notificationMessage =
      typeof payload.message === "string" && payload.message.trim().length > 0
        ? payload.message.trim()
        : "Test notification from Flyff Utility.";

    void sendDiscordNotification(title, notificationMessage, payload.mobilePush)
      .then((result) => {
        if (!result.ok) {
          sendResponse({
            ok: false,
            error:
              result.error ||
              "Discord notification failed. Check your Bot URL, User ID, and API key.",
          });
          return;
        }

        sendResponse({ ok: true });
      })
      .catch(() => {
        sendResponse({
          ok: false,
          error: "Unable to reach Discord bot.",
        });
      });

    return true;
  }

  if (msg.type === "TEST_MOBILE_PUSH_CONNECTION") {
    const payload = message as {
      mobilePush?: MobilePushPayload;
    };

    const isEligibleSender = isFlyffPlaySenderTab(sender.tab);
    if (!isEligibleSender) {
      sendResponse({ ok: false, error: "Not a Flyff play tab." });
      return;
    }

    void testDiscordConnection(payload.mobilePush)
      .then((result) => {
        if (!result.ok) {
          sendResponse({
            ok: false,
            error: result.error || "Unable to connect to Discord bot.",
          });
          return;
        }

        sendResponse({ ok: true });
      })
      .catch(() => {
        sendResponse({
          ok: false,
          error: "Unable to connect to Discord bot.",
        });
      });

    return true;
  }
});
