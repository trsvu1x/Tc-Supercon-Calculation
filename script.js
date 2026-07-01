// ============================================================================
// Configuration
// ============================================================================
const API = "http://localhost:8000";
const PRECISION = { wlog: 2, lambda: 2, mustar: 3 };

// Chart instances — declared here so updateCharts() can reference them safely
// before the chart section initialises (avoids temporal dead zone errors).
let learningChart = null;
let parityChart = null;

// ============================================================================
// Utility Functions
// ============================================================================
function get(id) {
  const element =
    document.getElementById(id) || document.getElementById(id + "-num");
  if (!element || element.value === "") return NaN;
  return parseFloat(element.value);
}

function setDisplayValue(id, value, suffix = "") {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value + suffix;
  }
}

function setInputValue(id, value) {
  const element =
    document.getElementById(id) || document.getElementById(id + "-num");
  if (element) {
    element.value = value;
  }
}

// ============================================================================
// Input Synchronization
// ============================================================================
function sync(id) {
  const value = get(id);
  setInputValue(id + "-num", value.toFixed(PRECISION[id]));
  const suffix = id === "wlog" ? " K" : "";
  setDisplayValue(id + "-val", value.toFixed(PRECISION[id]), suffix);
  compute();
}

function syncNum(id) {
  const value = get(id + "-num");
  if (Number.isNaN(value)) return;

  const input =
    document.getElementById(id + "-num") || document.getElementById(id);
  if (input) {
    const min = Number(input.min);
    const max = Number(input.max);
    if (
      !Number.isNaN(min) &&
      !Number.isNaN(max) &&
      value >= min &&
      value <= max
    ) {
      input.value = value;
    }
  }

  const suffix = id === "wlog" ? " K" : "";
  setDisplayValue(id + "-val", value.toFixed(PRECISION[id]), suffix);
  compute();
}

// ============================================================================
// McMillan Formula
// ============================================================================
function mcmillan(omega_log, lambda, mu_star) {
  const denominator = lambda - mu_star * (1 + 0.62 * lambda);
  if (denominator <= 0) return null;
  return (omega_log / 1.2) * Math.exp((-1.04 * (1 + lambda)) / denominator);
}

// ============================================================================
// Coupling Regime Classification
// ============================================================================
function getRegime(lambda) {
  if (lambda < 0.4) {
    return { text: "Khớp nối yếu", class: "weak" };
  } else if (lambda < 1.0) {
    return { text: "Khớp nối trung bình", class: "moderate" };
  } else {
    return { text: "Khớp nối mạnh", class: "strong" };
  }
}

// ============================================================================
// Computation and Display
// ============================================================================
function compute() {
  const omega_log = get("wlog");
  const lambda = get("lambda");
  const mu_star = get("mustar");
  const badgeEl = document.getElementById("regime-badge");

  if ([omega_log, lambda, mu_star].some((value) => Number.isNaN(value))) {
    setDisplayValue("tc-display", "—");
    if (badgeEl) {
      badgeEl.textContent = "Giá trị không hợp lệ";
      badgeEl.className = "regime invalid";
    }
    return;
  }

  const tc = mcmillan(omega_log, lambda, mu_star);

  if (tc === null) {
    setDisplayValue("tc-display", "—");
    if (badgeEl) {
      badgeEl.textContent = "Không phải siêu dẫn";
      badgeEl.className = "regime invalid";
    }
    return;
  }

  setDisplayValue("tc-display", tc.toFixed(2));

  const regime = getRegime(lambda);
  if (badgeEl) {
    badgeEl.textContent = regime.text;
    badgeEl.className = `regime ${regime.class}`;
  }

  updateCharts();
}

function readLocalHistory() {
  try {
    const raw = localStorage.getItem("tc-history");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(rows) {
  try {
    localStorage.setItem("tc-history", JSON.stringify(rows));
  } catch {
    // Ignore storage write errors.
  }
}

function removeFromLocalHistory(id) {
  const rows = readLocalHistory();
  const filtered = rows.filter((row) => String(row.id) !== String(id));
  writeLocalHistory(filtered);
  return filtered;
}

function renderHistory(historyEl, rows) {
  if (!historyEl) return;

  if (!rows.length) {
    historyEl.innerHTML = '<p class="empty">Chưa có kết quả nào được lưu</p>';
    return;
  }

  const tableHtml = `
    <table>
      <tr>
         <th>μ*</th>
         <th>λ</th>
         <th>ωlog (K)</th>
         <th>Tc (K)</th>
         <th>Date</th>
         <th></th>
      </tr>
      ${rows
        .map(
          (r) => `
      <tr>
        <td>${r.mu_star?.toFixed(1) ?? "—"}</td>
        <td>${r.lambda?.toFixed(2) ?? "—"}</td>
        <td>${r.omega_log?.toFixed(1) ?? "—"}</td>
        <td><b>${r.tc?.toFixed(1) ?? "—"}</b></td>
        <td style="color:#aaa;font-family:system-ui">${r.created_at?.slice(0, 16) ?? ""}</td>
        <td><span class="del" onclick="del(${r.id})">xóa</span></td>
      </tr>`,
        )
        .join("")}
    </table>`;

  historyEl.innerHTML = tableHtml;
}

// ============================================================================
// History Management
// ============================================================================
async function save() {
  const omega_log = get("wlog");
  const lambda = get("lambda");
  const mu_star = get("mustar");
  const tc = mcmillan(omega_log, lambda, mu_star);
  const historyEl = document.getElementById("history-body");

  if (tc === null) {
    alert("Tham số không hợp lệ, không có gì để lưu.");
    return;
  }

  const entry = {
    id: Date.now(),
    omega_log,
    lambda,
    mu_star,
    tc,
    created_at: new Date().toISOString(),
  };

  try {
    const response = await fetch(API + "/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        omega_log: omega_log,
        lambda: lambda,
        mu_star: mu_star,
      }),
    });

    if (!response.ok) {
      throw new Error("server response not ok");
    }

    const rows = readLocalHistory();
    rows.unshift(entry);
    writeLocalHistory(rows);
    loadHistory();
  } catch {
    const rows = readLocalHistory();
    rows.unshift(entry);
    writeLocalHistory(rows);
    renderHistory(historyEl, rows);
  }
}

async function loadHistory() {
  const historyEl = document.getElementById("history-body");
  if (!historyEl) return;

  try {
    const response = await fetch(API + "/history");
    if (!response.ok) {
      throw new Error("server response not ok");
    }

    const rows = await response.json();
    if (Array.isArray(rows) && rows.length) {
      renderHistory(historyEl, rows);
      return;
    }
  } catch {
    // Fall back to the locally stored history when the server is unavailable.
  }

  const localRows = readLocalHistory();
  renderHistory(historyEl, localRows);
}

async function del(id) {
  const historyEl = document.getElementById("history-body");
  const remainingRows = removeFromLocalHistory(id);
  if (historyEl) {
    renderHistory(historyEl, remainingRows);
  }

  try {
    const response = await fetch(API + "/delete/" + id, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("server response not ok");
    }
  } catch {
    // Keep the local update and fall back to the current local history.
  }

  loadHistory();
}

// ============================================================================
// Initialization
// ============================================================================
compute();
loadHistory();

// ============================================================================
// Chart.js — Learning Curve & Parity Plot
// ============================================================================

// --- Reference dataset of experimental superconductors ---
const REFERENCE_DATA = [
  { name: "Al", lambda: 0.43, mu_star: 0.1, omega_log: 280, tc_exp: 1.18 },
  { name: "Sn", lambda: 0.72, mu_star: 0.1, omega_log: 130, tc_exp: 3.72 },
  { name: "In", lambda: 0.81, mu_star: 0.1, omega_log: 105, tc_exp: 3.41 },
  { name: "V", lambda: 0.6, mu_star: 0.1, omega_log: 230, tc_exp: 5.4 },
  { name: "Ta", lambda: 0.69, mu_star: 0.1, omega_log: 140, tc_exp: 4.48 },
  { name: "Nb", lambda: 1.22, mu_star: 0.13, omega_log: 174, tc_exp: 9.25 },
  { name: "Pb", lambda: 1.55, mu_star: 0.13, omega_log: 70, tc_exp: 7.19 },
  { name: "Hg", lambda: 1.62, mu_star: 0.13, omega_log: 47, tc_exp: 4.15 },
  { name: "MgB₂", lambda: 0.87, mu_star: 0.1, omega_log: 600, tc_exp: 39.0 },
  { name: "NbN", lambda: 1.0, mu_star: 0.12, omega_log: 290, tc_exp: 16.0 },
];

// --- Build learning-curve data: Tc vs λ from 0.01 to 3 ---
function buildLearningCurveData() {
  const mu_star = get("mustar") || 0.1;
  const omega_log = get("wlog") || 300;
  const lambdas = [];
  const tcs = [];
  for (let i = 0; i <= 120; i++) {
    const lam = 0.01 + i * (3.0 / 120);
    lambdas.push(lam.toFixed(2));
    const tc = mcmillan(omega_log, lam, mu_star);
    tcs.push(tc !== null ? parseFloat(tc.toFixed(3)) : null);
  }
  return { lambdas, tcs };
}

// --- Build parity-plot data ---
function buildParityData() {
  return REFERENCE_DATA.map((d) => ({
    label: d.name,
    x: d.tc_exp,
    y: (() => {
      const tc = mcmillan(d.omega_log, d.lambda, d.mu_star);
      return tc !== null ? parseFloat(tc.toFixed(3)) : null;
    })(),
  })).filter((d) => d.y !== null);
}

// ---- Generate charts on demand (button click) ----
function generateCharts() {
  // Show the chart cards
  const lcCard = document.getElementById("learning-curve-card");
  const pcCard = document.getElementById("parity-chart-card");
  const label = document.getElementById("chart-params-label");
  if (lcCard) lcCard.style.display = "";
  if (pcCard) pcCard.style.display = "";

  // Show snapshot of params used
  const mu = get("mustar");
  const lam = get("lambda");
  const wl = get("wlog");
  if (label) {
    label.style.display = "";
    label.textContent = `μ* = ${isNaN(mu) ? "?" : mu}, λ = ${isNaN(lam) ? "?" : lam}, ωlog = ${isNaN(wl) ? "?" : wl} K`;
  }

  // Wait one animation frame so the browser can lay out the
  // newly-visible canvas elements before Chart.js measures them.
  requestAnimationFrame(initCharts);
}

// ---- Initialise (or reinitialise) both charts ----
function initCharts() {
  const lcCtx = document.getElementById("learningCurveChart");
  const pcCtx = document.getElementById("parityChart");
  if (!lcCtx || !pcCtx) return;

  // Destroy previous instances to avoid "Canvas already in use" error
  if (learningChart) {
    learningChart.destroy();
    learningChart = null;
  }
  if (parityChart) {
    parityChart.destroy();
    parityChart = null;
  }

  const { lambdas, tcs } = buildLearningCurveData();
  const parityData = buildParityData();
  const maxVal =
    Math.max(...parityData.map((d) => Math.max(d.x, d.y ?? 0))) * 1.15;

  // ---- Learning Curve ----
  learningChart = new Chart(lcCtx, {
    type: "line",
    data: {
      labels: lambdas,
      datasets: [
        {
          label: "Tc (K)",
          data: tcs,
          borderColor: "#1a6bb5",
          backgroundColor: "rgba(26,107,181,0.08)",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => "λ = " + items[0].label,
            label: (item) =>
              "Tc = " + (item.raw !== null ? item.raw + " K" : "N/A"),
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "λ (hệ số ghép)", font: { size: 11 } },
          ticks: { maxTicksLimit: 8, font: { size: 10 } },
        },
        y: {
          title: { display: true, text: "Tc (K)", font: { size: 11 } },
          ticks: { font: { size: 10 } },
          min: 0,
        },
      },
    },
  });

  // ---- Parity Plot ----
  parityChart = new Chart(pcCtx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "Chất siêu dẫn",
          data: parityData,
          backgroundColor: "#1a6bb5",
          pointRadius: 6,
          pointHoverRadius: 9,
        },
        {
          label: "Lý tưởng (y = x)",
          data: [
            { x: 0, y: 0 },
            { x: maxVal, y: maxVal },
          ],
          type: "line",
          borderColor: "#cc0033",
          borderDash: [6, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 400 },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.datasetIndex === 1) return null;
              const d = ctx.raw;
              const name = parityData[ctx.dataIndex]?.label ?? "";
              return `${name}: thực = ${d.x} K — dự đoán = ${d.y} K`;
            },
          },
        },
        legend: { labels: { font: { size: 11 } } },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Tc thực nghiệm (K)",
            font: { size: 11 },
          },
          ticks: { font: { size: 10 } },
          min: 0,
        },
        y: {
          title: {
            display: true,
            text: "Tc dự đoán McMillan (K)",
            font: { size: 11 },
          },
          ticks: { font: { size: 10 } },
          min: 0,
        },
      },
    },
  });
}

// ---- Update both charts when inputs change (only if already generated) ----
function updateCharts() {
  if (!learningChart || !parityChart) return;

  const { lambdas, tcs } = buildLearningCurveData();
  learningChart.data.labels = lambdas;
  learningChart.data.datasets[0].data = tcs;
  learningChart.update();

  const parityData = buildParityData();
  parityChart.data.datasets[0].data = parityData;
  parityChart.update();
}
