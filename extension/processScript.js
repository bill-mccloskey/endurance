const Cc = Components.classes;
const Ci = Components.interfaces;

let lastThreadHangs = {};

function numGeckoThreadHangs(threshold) {
  let geckoThread = Services.telemetry.threadHangStats.find(thread =>
    thread.name == "Gecko" || thread.name == "Gecko_Child"
  );
  if (!geckoThread || !geckoThread.activity.counts) {
    dump("Lolwhut? No Gecko thread? No hangs?\n");
    return undefined;
  }
  // see the NOTE in mostRecentHangs() for caveats when using the activity.counts histogram
  // to summarize, the ranges are the inclusive upper bound of the histogram rather than the inclusive lower bound
  let numHangs = 0;
  geckoThread.activity.counts.forEach((count, i) => {
    var lowerBound = geckoThread.activity.ranges[i - 1] + 1;
    if (lowerBound >= threshold) {
      numHangs += count;
    }
  });

  let h = numHangs;
  if (threshold in lastThreadHangs) {
    numHangs -= lastThreadHangs[threshold];
  } else {
    numHangs = 0;
  }
  lastThreadHangs[threshold] = h;

  return numHangs;
}

function memoryStats() {
  let mgr = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
  let stats = [
    "ghostWindows",
    "pageFaultsHard",
    "residentUnique",
    "heapAllocated",
    "JSMainRuntimeGCHeap",
  ];

  let result = {};
  for (let stat of stats) {
    result[stat] = mgr[stat];
  }
  return result;
}

let version;

function listener(msg) {
  if (msg.name == "Endurance:Startup" && !version) {
    version = msg.data;
    return;
  } else if (msg.name == "Endurance:Shutdown" && version == msg.data) {
    removeMessageListener("Endurance:GetStatistics", listener);
    removeMessageListener("Endurance:Startup", listener);
    removeMessageListener("Endurance:Shutdown", listener);
    return;
  }

  let stats = memoryStats();
  stats.numHangs100 = numGeckoThreadHangs(100);
  stats.numHangs500 = numGeckoThreadHangs(500);
  stats.numHangs1000 = numGeckoThreadHangs(1000);
  sendAsyncMessage("Endurance:Statistics", stats);
}

addMessageListener("Endurance:GetStatistics", listener);
addMessageListener("Endurance:Startup", listener);
addMessageListener("Endurance:Shutdown", listener);
