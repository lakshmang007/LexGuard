// Opens the side panel from the toolbar icon or the right-click menu.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({ id: "lexguard-selection", title: "Check selected text with LEXGUARD", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "lexguard-page", title: "Check this page with LEXGUARD", contexts: ["page"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  const mode = info.menuItemId === "lexguard-page" ? "page" : "selection";
  // open() must run inside the click gesture, so it is not awaited after other work.
  chrome.sidePanel.open({ tabId: tab.id });
  chrome.storage.session.set({ pending: { tabId: tab.id, mode, at: Date.now() } });
});
