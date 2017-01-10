let running = false;

function clicked() {
  running = !running;
  document.getElementById("start").innerHTML = running ? "Stop test" : "Start test";

  let bg = browser.extension.getBackgroundPage();
  if (running) {
    bg.startTesting();
  } else {
    bg.stopTesting();
  }
}

document.getElementById("start").addEventListener("click", clicked);
