let bg = browser.extension.getBackgroundPage();
let running = bg.isRunning();

function updateButton() {
  document.getElementById("start").innerHTML = running ? "Stop test" : "Start test";
}

updateButton();

function clicked() {
  running = !running;
  updateButton();

  if (running) {
    bg.startTesting();
  } else {
    bg.stopTesting();
  }
}

document.getElementById("start").addEventListener("click", clicked);
