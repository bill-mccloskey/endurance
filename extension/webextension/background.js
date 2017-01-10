let testTab = null;
let testWindow = null;
let running = false;
let logEntries = [];
let runKey = Math.random();
let startDate;

let lastSubmission = Date.now();
let lastMemoryReport = Date.now();

function log(...args) {
  console.log(...args);
  logEntries.push(args);
}

function logError(e) {
  console.log("Exception", e);
  log(`Exception: ${e}\n${e.stack}`);
}

async function submit() {
  console.log("begin submit");

  let stats = await browser.runtime.sendMessage({type: "GetStatistics", hangThreshold: 100});

  let data = [];

  data.push([Date.now(), "log(text)", logEntries.join("\n")]);
  logEntries = [];

  for (let key in stats[0]) {
    data.push([Date.now(), key + "-main", stats[0][key]]);
  }
  for (let key in stats[0]) {
    let v = 0;
    for (let i = 1; i < stats.length; i++) {
      v += stats[i][key];
    }
    data.push([Date.now(), key + "-content", v]);
  }

  let encoded = new FormData();
  encoded.append("run_key", runKey);
  encoded.append("start_date", startDate.toISOString());
  encoded.append("data", JSON.stringify(data));

  let xhr = new XMLHttpRequest();
  xhr.open("POST", "http://127.1:5000/submit", true);
  xhr.send(encoded);

  lastSubmission = Date.now();

  console.log("end submit");
}

function submitFile(key, file) {
  let data = new FormData();
  data.append("run_key", runKey);
  data.append("key", key + "(file)");
  data.append("timestamp", Date.now());
  data.append("file", file);

  let xhr = new XMLHttpRequest();
  xhr.open("POST", "http://127.1:5000/file", true);
  xhr.send(data);
}

async function submitMemoryReport() {
  console.log("begin memory report submit");

  let memReportFile = await browser.runtime.sendMessage({type: "MemoryReport"});
  submitFile("memory-report", memReportFile);

  console.log("end memory report submit");

  lastMemoryReport = Date.now();
}

async function submitGCLogs() {
  console.log("begin GC log submit");

  let dumps = await browser.runtime.sendMessage({type: "GCLogs"});
  dumps.forEach((dump, i) => {
    if (i == 0) {
      submitFile("main-gc-log", dumps[i][0]);
      submitFile("main-cc-log", dumps[i][1]);
    } else {
      submitFile(`content-gc-log-${i}`, dumps[i][0]);
      submitFile(`content-cc-log-${i}`, dumps[i][1]);
    }
  });

  console.log("end GC log submit");
}

// Warning: it seems like something is going wrong with symbolication
// here.
async function submitProfile() {
  console.log("begin profile submit");

  let profile = await browser.runtime.sendMessage({type: "Profile"});
  submitFile("profile", profile);

  console.log("end profile submit");
}

async function loadComplete(tab) {
  let resolveLoad;
  let load = new Promise(resolve => { resolveLoad = resolve; });

  function updateListener(tabId, change, tab) {
    if (change.status == "complete" && tabId == tab.id && tab.url != "about:blank") {
      log("load complete");
      resolveLoad();
    }
  }
  browser.tabs.onUpdated.addListener(updateListener);

  let timeout = new Promise(resolve => setTimeout(resolve, 10000));

  tab = await browser.tabs.get(tab.id);
  if (tab.status != "complete" || tab.url == "about:blank") {
    await Promise.race([load, timeout]);
  } else {
    log("load already complete!");
  }

  browser.tabs.onUpdated.removeListener(updateListener);
}

let urls = new Set();
let strings = new Set();

function garbageCollect() {
  log("garbageCollect");

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
  log("clickLinkAction", tab.url);
  browser.tabs.sendMessage(tab.id, {type: "click"});

  await new Promise(resolve => setTimeout(resolve, 50));
  await loadComplete(tab);

  log("clickLinkAction complete");
}

async function scrollAction() {
  let amt = choose([[5, 1], [10, 1], [20, 10], [50, 10], [100, 20], [500, 10], [1000, 5]]);
  let direction = choose([[1, 1], [-1, 1]]);
  amt *= direction;

  let tabs = await browser.tabs.query({active: true, windowId: testWindow.id});
  let tab = tabs[0];
  log("scrollAction", tab.url);
  browser.tabs.executeScript(tab.id, {code: `window.scrollBy(0, ${amt});`});
  log("scrollAction complete");
}

async function switchTabAction() {
  let tabs = await queryTabs();
  let tab = choose(tabs.map(t => [t, 1]));
  log("switchTabAction", tab.url);
  await browser.tabs.update(tab.id, {active: true});
}

async function openTabAction() {
  let url = choose([...urls].map(u => [u, 1]));
  log("openTabAction", url);

  let tab = await browser.tabs.create({url: url, active: true, windowId: testWindow.id});
  await loadComplete(tab);

  log("openTabAction complete");
}

async function searchAction() {
  let string = choose([...strings].map(s => [s, 1]));
  let url = `https://www.google.com/search?q=${encodeURIComponent(string)}`;
  log("searchAction", url);
  let tab = await browser.tabs.create({url: url, active: true, windowId: testWindow.id});
  await loadComplete(tab);
  log("searchAction complete");
}

async function closeTabAction() {
  let tabs = await queryTabs({pinned: false});
  let tab = choose(tabs.map(t => [t, 1]));
  log("Closing tab", tab.url);
  await browser.tabs.remove(tab.id);
}

async function act() {
  log("act!");

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

  let option = choose(options);

  try {
    await option();
  } catch (e) {
    logError(e);
    await submit();
  }

  if (running) {
    if (Date.now() - lastSubmission > 60 * 1000) {
      await submit();
    }

    if (Date.now() - lastMemoryReport > 10 * 60 * 1000) {
      await submitMemoryReport();
    }

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
    startDate = new Date();

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
      log("awaiting tab", tabs[i]);
      await loadComplete(tabs[i]);
    }
  }

  log("finished loading new window");

  log("links", urls);
  log("strings", strings);

  running = true;
  act();
}

function stopTesting() {
  running = false;
}