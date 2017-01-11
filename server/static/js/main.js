let traces = {};

function getTrace(selector) {
  if (selector in traces) {
    return Promise.resolve(traces[selector]);
  }

  let key = selector.split("/")[0];

  return new Promise(resolve => {
    function listener() {
      let trace = JSON.parse(this.responseText);
      trace.name = key;
      traces[selector] = trace;
      resolve(trace);
    }

    let xhr = new XMLHttpRequest();
    xhr.onload = listener;
    xhr.open("GET", "/data?selector=" + selector, true);
    xhr.send();
  });
}

async function plot() {
  console.log("plot");

  let checks = document.querySelectorAll(".option_check");
  let traces = [];
  for (let check of checks) {
    if (check.checked) {
      let selector = check.value;
      let trace = await getTrace(selector);
      traces.push(trace);
    }
  }

  console.log("traces", traces);

  let layout = {
    title: "Firefox endurance test",
    xaxis: {
      title: "Time",
      showgrid: true,
      zeroline: true,
    },
    yaxis: {
      title: "Value",
    }
  };

  let plotElt = document.getElementById("plot");
  Plotly.newPlot(plotElt, traces, layout);
}

function checkChange(event) {
  plot();
}

let checks = document.querySelectorAll(".option_check");
for (let check of checks) {
  check.addEventListener("change", checkChange);
}

plot();

let html = "";
for (let [timestamp, run_key, key, text] of TEXT_ENTRIES) {
  html += "<tr>";

  html += `<td style="vertical-align: top;">${timestamp}</td>`;
  html += `<td style="vertical-align: top;">${key}</td>`;
  html += `<td><pre>${text}</pre></td>`;

  html += "</tr>";
}
document.getElementById("text-entries").innerHTML = html;
