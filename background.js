// Toolbar click / keyboard shortcut -> tell the page's content script to show or hide the panel.
// Tabs that were open before the extension was installed have no content script yet, so inject it on demand.

const FILES = [
  'content/ns.js',
  'content/values.js',
  'content/formula.js',
  'content/selectors.js',
  'content/extract.js',
  'content/pagedata.js',
  'content/filters.js',
  'content/pagefilter.js',
  'content/store.js',
  'content/picker.js',
  'content/help.js',
  'content/panel.js',
  'content/main.js',
];

async function toggle(tab) {
  if (!tab || tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'ps:toggle' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: FILES });
      // Sees only responses from now on; reloading the tab catches the page's first data too.
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/netwatch.js'], world: 'MAIN' });
      await chrome.tabs.sendMessage(tab.id, { type: 'ps:toggle' });
    } catch {
      // chrome:// pages, the Web Store, PDFs etc. can't be scripted — nothing to do.
    }
  }
}

chrome.action.onClicked.addListener(toggle);
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-panel') toggle(tab);
});
