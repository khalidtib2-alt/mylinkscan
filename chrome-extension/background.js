import { reportUrl } from "./shared.js";

const menuId = "mylinkscan-link";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: menuId,
      title: "Scan Link with MyLinkscan",
      contexts: ["link"],
      targetUrlPatterns: ["http://*/*", "https://*/*"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(({ menuItemId, linkUrl }) => {
  if (menuItemId !== menuId || !linkUrl) return;
  let destination;
  try { destination = reportUrl(linkUrl); }
  catch { return; }
  void chrome.tabs.create({ url: destination });
});
