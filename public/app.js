import { decisionFor, normalizeFeature, runFaultScenario } from "./decision-model.js";

const feedUrl = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
const state = { mode: "synthetic", events: [], selected: null, requestId: 0, controller: null };

const elements = {
  feedState: document.querySelector("#feed-state"),
  eventCount: document.querySelector("#event-count"),
  candidateCount: document.querySelector("#candidate-count"),
  eventRows: document.querySelector("#event-rows"),
  traceDetails: document.querySelector("#trace-details"),
  reasonCode: document.querySelector("#reason-code"),
  faultOutput: document.querySelector("#fault-output"),
};

function timeAgo(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function syntheticEvents() {
  const now = Date.now();
  return [
    { id: "sim-001", revision: 1, place: "Synthetic nominal event", observedAt: now - 8000, magnitude: 5.2, latitude: 37.4, longitude: -122.1, depthKm: 12, quality: 0.92 },
    { id: "sim-002", revision: 1, place: "Synthetic low-quality event", observedAt: now - 6000, magnitude: 6.1, latitude: 38.2, longitude: -121.7, depthKm: 17, quality: 0.3 },
    { id: "sim-003", revision: 1, place: "Synthetic stale event", observedAt: now - 180000, magnitude: 5.8, latitude: 36.9, longitude: -120.8, depthKm: 9, quality: 0.95 },
    { id: "sim-004", revision: 1, place: "Synthetic below-threshold event", observedAt: now - 4000, magnitude: 3.2, latitude: 35.8, longitude: -119.4, depthKm: 8, quality: 0.91 },
  ];
}

function render() {
  const decisions = state.events.map((event) => ({ event, decision: decisionFor(event) }));
  elements.eventCount.textContent = String(state.events.length);
  elements.candidateCount.textContent = String(decisions.filter(({ decision }) => decision.candidate).length);
  elements.eventRows.innerHTML = decisions.length ? decisions.map(({ event, decision }) => `
    <tr data-event-id="${escapeHtml(event.id)}" class="${state.selected?.id === event.id ? "selected" : ""}">
      <td><button type="button" class="event-select" aria-label="Inspect ${escapeHtml(event.id)}">${escapeHtml(event.id)}</button><br><small>${escapeHtml(event.place)}</small></td>
      <td>${event.magnitude.toFixed(1)}</td>
      <td>${timeAgo(event.observedAt)}</td>
      <td>${event.quality.toFixed(2)}</td>
      <td><span class="decision ${decision.candidate ? "candidate" : "rejected"}">${decision.candidate ? "Candidate" : "Suppressed"}</span></td>
    </tr>`).join("") : '<tr><td colspan="5" class="empty">No events available.</td></tr>';

  for (const row of elements.eventRows.querySelectorAll("tr[data-event-id]")) {
    row.addEventListener("click", () => selectEvent(row.dataset.eventId));
  }
}

function selectEvent(id) {
  state.selected = state.events.find((event) => event.id === id) || null;
  if (!state.selected) return;
  const decision = decisionFor(state.selected);
  const fields = [
    ["Event", state.selected.id],
    ["Place", state.selected.place],
    ["Revision", state.selected.revision],
    ["Magnitude", state.selected.magnitude.toFixed(1)],
    ["Coordinates", `${state.selected.latitude.toFixed(3)}, ${state.selected.longitude.toFixed(3)}`],
    ["Depth", `${state.selected.depthKm.toFixed(1)} km`],
    ["Score", decision.score.toFixed(3)],
  ];
  elements.traceDetails.innerHTML = fields.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(String(value))}</dd></div>`).join("");
  elements.reasonCode.textContent = decision.reason;
  render();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

async function loadEvents() {
  const requestId = ++state.requestId;
  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  elements.feedState.textContent = "Loading";
  if (state.mode === "synthetic") {
    state.events = syntheticEvents();
    elements.feedState.textContent = "Synthetic replay";
    state.selected = state.events[0];
    render();
    selectEvent(state.selected.id);
    return;
  }

  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(feedUrl, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (requestId !== state.requestId) return;
    if (!Array.isArray(payload.features)) throw new Error("Invalid feed");
    state.events = payload.features.slice(0, 12).map(normalizeFeature).filter((event) =>
      [event.magnitude, event.latitude, event.longitude, event.depthKm, event.observedAt].every(Number.isFinite));
    elements.feedState.textContent = "USGS catalog loaded";
    state.selected = state.events[0] || null;
    render();
    if (state.selected) selectEvent(state.selected.id);
    else {
      elements.traceDetails.textContent = "No event selected";
      elements.reasonCode.textContent = "no_events";
    }
  } catch (error) {
    if (requestId !== state.requestId) return;
    state.events = syntheticEvents();
    elements.feedState.textContent = "Feed unavailable; replay active";
    state.selected = state.events[0];
    render();
    selectEvent(state.selected.id);
  } finally {
    clearTimeout(timer);
  }
}

// Mutation check: run the stale-event scenario against a deliberately broken policy
// that ignores event age. A meaningful test must FAIL here.
function brokenPolicy(event, now = Date.now()) {
  return decisionFor({ ...event, observedAt: now - 1000 }, now);
}

function runMutationCheck() {
  const result = runFaultScenario("stale", Date.now(), brokenPolicy);
  elements.faultOutput.textContent = result.passed
    ? `REVIEW | Mutation survived: the stale-event test did not detect a policy that ignores event age | ${result.executedAt}`
    : `PASS | Mutation detected: the stale-event test failed against a broken policy (expected=${result.expected}, observed=${result.observed}) | ${result.executedAt}`;
}

async function loadIntegration() {
  try {
    const response = await fetch(new URL("./data/integration-evidence.json", import.meta.url), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const report = await response.json();
    document.querySelector("#integration-summary").textContent = `${report.summary.passed}/${report.summary.total} passed`;
    document.querySelector("#integration-date").textContent = new Date(report.generatedAt).toLocaleString();
    document.querySelector("#integration-hash").textContent = report.summary.evidenceHash;
    document.querySelector("#integration-list").innerHTML = report.scenarios.map((scenario) => `
      <li><strong class="${scenario.passed ? "pass" : "fail"}">${scenario.passed ? "PASS" : "FAIL"}</strong>
      <span>${escapeHtml(scenario.description)}${scenario.finding ? ` <em>(${escapeHtml(scenario.finding)})</em>` : ""}</span></li>`).join("");
  } catch { /* optional evidence */ }
}

async function loadLinks() {
  try {
    const response = await fetch(new URL("./data/links.json", import.meta.url), { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return;
    const links = await response.json();
    const safe = (value) => typeof value === "string" && /^https:\/\/(github\.com|gitlab\.com)\//.test(value) ? value : "";
    const repository = safe(links.repository);
    const pipeline = safe(links.pipeline);
    if (repository) {
      const anchor = document.querySelector("#link-repository");
      anchor.href = repository; anchor.hidden = false;
    }
    if (pipeline) {
      const anchor = document.querySelector("#link-pipeline");
      anchor.href = pipeline; anchor.hidden = false;
    }
    if (repository || pipeline) {
      document.querySelector("#source-status").textContent = links.statusNote && typeof links.statusNote === "string"
        ? links.statusNote
        : "Source and hosted pipeline results are linked in the evidence section above.";
    }
  } catch { /* links are optional */ }
}

function runFault(type) {
  const result = runFaultScenario(type);
  elements.faultOutput.textContent = `${result.passed ? "PASS" : "FAIL"} | Browser model | expected=${result.expected} | observed=${result.observed} | ${result.executedAt}`;
}

async function loadEvidence() {
  try {
    const [assuranceResponse, transportResponse] = await Promise.all([
      fetch(new URL("./data/assurance-report.json", import.meta.url), { cache: "no-store", signal: AbortSignal.timeout(8000) }),
      fetch(new URL("./data/transport-evidence.json", import.meta.url), { cache: "no-store", signal: AbortSignal.timeout(8000) }),
    ]);
    if (!assuranceResponse.ok || !transportResponse.ok) throw new Error("Evidence unavailable");
    const [report, transport] = await Promise.all([
      assuranceResponse.json(),
      transportResponse.json(),
    ]);
    document.querySelector("#test-count").textContent = `${report.summary.passed}/${report.summary.total} passed`;
    document.querySelector("#evidence-passed").textContent = `${report.summary.passed}/${report.summary.total}`;
    document.querySelector("#evidence-failed").textContent = String(report.summary.failed);
    document.querySelector("#evidence-latency").textContent = `${report.summary.p95LatencyMicros} us`;
    document.querySelector("#evidence-release").textContent = report.release.startsWith("working-tree:")
      ? `Uncommitted ${report.provenance.sourceSha256.slice(0, 10)}` : report.release.slice(0, 12);
    document.querySelector("#evidence-hash").textContent = report.summary.evidenceHash;
    document.querySelector("#evidence-date").textContent = new Date(report.generatedAt).toLocaleString();
    document.querySelector("#transport-date").textContent = new Date(transport.generatedAt).toLocaleString();
    document.querySelector("#transport-messages").textContent = String(transport.stream.storedMessages);
    document.querySelector("#transport-consumers").textContent = `${transport.consumers.length}/2 verified`;
    document.querySelector("#transport-dedupe").textContent = transport.checks.deterministicDeduplication ? "Verified" : "Review";
    document.querySelector("#transport-alert").textContent = transport.checks.simulatedAlertPublished ? "Verified" : "Review";
    document.querySelector("#transport-hash").textContent = transport.evidenceHash;
    loadIntegration();
    const transportPassed = Object.values(transport.checks).every(Boolean);
    const evidenceState = document.querySelector("#evidence-state");
    evidenceState.textContent = report.summary.failed === 0 && transportPassed ? "Recorded checks passed; see run dates" : "Review required";
    evidenceState.classList.toggle("passed", report.summary.failed === 0 && transportPassed);
  } catch {
    document.querySelector("#test-count").textContent = "Report unavailable";
    document.querySelector("#evidence-state").textContent = "Evidence not generated";
  }
}

document.querySelector("#refresh-feed").addEventListener("click", loadEvents);
for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((item) => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    loadEvents();
  });
}
document.querySelector("#mutation-check").addEventListener("click", runMutationCheck);
for (const button of document.querySelectorAll("[data-fault]")) {
  button.addEventListener("click", () => runFault(button.dataset.fault));
}

loadEvents();
loadEvidence();
loadLinks();

// The WordPress wrapper accepts only messages from this same-origin frame.
if (window.parent !== window && window.ResizeObserver) {
  new ResizeObserver(() => window.parent.postMessage({
    type: "cll-lab-height", height: document.body.scrollHeight,
  }, window.location.origin)).observe(document.body);
}
