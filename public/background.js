const TOGGLE_COMMAND = "toggle-mapper";

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
