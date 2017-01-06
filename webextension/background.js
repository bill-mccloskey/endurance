let testTab = null;
let testWindow = null;
let running = false;

async function loadComplete(tab) {
  let resolveLoad;
  let load = new Promise(resolve => { resolveLoad = resolve; });

  function updateListener(tabId, change, tab) {
    if (change.status == "complete" && tabId == tab.id && tab.url != "about:blank") {
      console.log("load complete");
      resolveLoad();
    }
  }
  browser.tabs.onUpdated.addListener(updateListener);

  let timeout = new Promise(resolve => setTimeout(resolve, 10000));

  tab = await browser.tabs.get(tab.id);
  if (tab.status != "complete" || tab.url == "about:blank") {
    await Promise.race([load, timeout]);
  } else {
    console.log("load already complete!");
  }

  browser.tabs.onUpdated.removeListener(updateListener);
}

let urls = new Set();
let strings = new Set();

function garbageCollect() {
  urls = new Set([
    "http://nytimes.com",
    "http://en.wikipedia.org",
    "http://imdb.com",
    "http://cnn.com",
    "http://foxnews.com",
    "http://youtube.com",
    "http://yahoo.com",
    "http://reddit.com",
  ]);

  let newStrings = new Set();

  for (let i = 0; i < 250; i++) {
    let string = choose([...strings].map(s => [s, 1]));
    newStrings.push(string);
  }

  strings = newStrings;
}

async function queryTabs(filter = {}) {
  filter.windowId = testWindow.id;
  let tabs = await browser.tabs.query(filter);
  return tabs.filter(tab => tab.url.startsWith("http"));
}

async function clickLinkAction() {
  let tabs = await browser.tabs.query({active: true, windowId: testWindow.id});
  let tab = tabs[0];
  console.log("clickLinkAction", tab.url);
  browser.tabs.sendMessage(tab.id, {type: "click"});

  await new Promise(resolve => setTimeout(resolve, 50));
  await loadComplete(tab);

  console.log("clickLinkAction complete");
}

async function scrollAction() {
  let amt = choose([[5, 1], [10, 1], [20, 10], [50, 10], [100, 20], [500, 10], [1000, 5]]);
  let direction = choose([[1, 1], [-1, 1]]);
  amt *= direction;

  let tabs = await browser.tabs.query({active: true, windowId: testWindow.id});
  let tab = tabs[0];
  console.log("scrollAction", tab.url);
  browser.tabs.executeScript(tab.id, {code: `window.scrollBy(0, ${amt});`});
  console.log("scrollAction complete");
}

async function switchTabAction() {
  let tabs = await queryTabs();
  let tab = choose(tabs.map(t => [t, 1]));
  console.log("switchTabAction", tab.url);
  await browser.tabs.update(tab.id, {active: true});
}

async function openTabAction() {
  let url = choose([...urls].map(u => [u, 1]));
  console.log("openTabAction", url);

  let tab = await browser.tabs.create({url: url, active: true, windowId: testWindow.id});
  await loadComplete(tab);

  console.log("openTabAction complete");
}

async function searchAction() {
  let string = choose([...strings].map(s => [s, 1]));
  let url = `https://www.google.com/search?q=${encodeURIComponent(string)}`;
  console.log("searchAction", url);
  let tab = await browser.tabs.create({url: url, active: true, windowId: testWindow.id});
  await loadComplete(tab);
  console.log("searchAction complete");
}

async function closeTabAction() {
  let tabs = await queryTabs({pinned: false});
  let tab = choose(tabs.map(t => [t, 1]));
  console.log("Closing tab", tab.url);
  browser.tabs.remove(tab.id);
}

async function act() {
  console.log("act!");

  let options = [
    [scrollAction, 75],
    [switchTabAction, 10],
  ];

  let active = await browser.tabs.query({active: true, windowId: testWindow.id});
  if (!active[0].pinned) {
    options.push([clickLinkAction, 10]);
  }

  let tabs = await queryTabs({pinned: false});
  if (tabs.length > 1) {
    options.push([closeTabAction, 1]);
  }
  if (tabs.length < 5) {
    options.push([openTabAction, 1]);
    options.push([searchAction, 1]);
  }

  console.log(options);

  let option = choose(options);

  console.log(option);

  await option();

  if (running) {
    setTimeout(act, 100);
  }
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type == "links") {
    if (urls.size > 5000 || strings.size > 5000) {
      garbageCollect();
    }

    for (let [href, string] of msg.links) {
      urls.add(href);
      strings.add(string);
    }
  }
});

browser.browserAction.onClicked.addListener(() => {
  testTab = browser.tabs.create({url: "ui.html"});
});

async function startTesting() {
  if (!testWindow) {
    testWindow = await browser.windows.create({url: [
      "https://gmail.com",
      "https://facebook.com",
      "http://nytimes.com",
      "http://en.wikipedia.org",
      "http://imdb.com",
    ]});
    let tabs = await browser.tabs.query({windowId: testWindow.id});
    for (let i = 0; i < 2; i++) {
      await browser.tabs.update(tabs[i].id, {pinned: true});
      console.log("awaiting tab", tabs[i]);
      await loadComplete(tabs[i]);
    }
  }

  console.log("finished loading new window");

  console.log("links", urls);
  console.log("strings", strings);

  running = true;
  act();
}

function stopTesting() {
  running = false;
}
