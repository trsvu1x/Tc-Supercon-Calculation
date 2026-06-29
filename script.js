// ============================================================================
// Configuration
// ============================================================================
const API = "http://localhost:8000";
const PRECISION = { wlog: 2, lambda: 2, mustar: 3 };

// ============================================================================
// Utility Functions
// ============================================================================
function get(id) {
  const element = document.getElementById(id) || document.getElementById(id + '-num');
  if (!element || element.value === '') return NaN;
  return parseFloat(element.value);
}

function setDisplayValue(id, value, suffix = '') {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value + suffix;
  }
}

function setInputValue(id, value) {
  const element = document.getElementById(id) || document.getElementById(id + '-num');
  if (element) {
    element.value = value;
  }
}

// ============================================================================
// Input Synchronization
// ============================================================================
function sync(id) {
  const value = get(id);
  setInputValue(id + '-num', value.toFixed(PRECISION[id]));
  const suffix = id === 'wlog' ? ' K' : '';
  setDisplayValue(id + '-val', value.toFixed(PRECISION[id]), suffix);
  compute();
}

function syncNum(id) {
  const value = get(id + '-num');
  if (Number.isNaN(value)) return;

  const input = document.getElementById(id + '-num') || document.getElementById(id);
  if (input) {
    const min = Number(input.min);
    const max = Number(input.max);
    if (!Number.isNaN(min) && !Number.isNaN(max) && value >= min && value <= max) {
      input.value = value;
    }
  }

  const suffix = id === 'wlog' ? ' K' : '';
  setDisplayValue(id + '-val', value.toFixed(PRECISION[id]), suffix);
  compute();
}

// ============================================================================
// McMillan Formula
// ============================================================================
function mcmillan(omega_log, lambda, mu_star) {
  const denominator = lambda - mu_star * (1 + 0.62 * lambda);
  if (denominator <= 0) return null;
  return (omega_log / 1.2) * Math.exp(-1.04 * (1 + lambda) / denominator);
}

// ============================================================================
// Coupling Regime Classification
// ============================================================================
function getRegime(lambda) {
  if (lambda < 0.4) {
    return { text: 'Couplage faible', class: 'weak' };
  } else if (lambda < 1.0) {
    return { text: 'Couplage modéré', class: 'moderate' };
  } else {
    return { text: 'Couplage fort', class: 'strong' };
  }
}

// ============================================================================
// Computation and Display
// ============================================================================
function compute() {
  const omega_log = get('wlog');
  const lambda = get('lambda');
  const mu_star = get('mustar');
  const badgeEl = document.getElementById('regime-badge');

  if ([omega_log, lambda, mu_star].some((value) => Number.isNaN(value))) {
    setDisplayValue('tc-display', '—');
    if (badgeEl) {
      badgeEl.textContent = 'Valeurs invalides';
      badgeEl.className = 'regime invalid';
    }
    return;
  }

  const tc = mcmillan(omega_log, lambda, mu_star);

  if (tc === null) {
    setDisplayValue('tc-display', '—');
    if (badgeEl) {
      badgeEl.textContent = 'Non-supraconducteur';
      badgeEl.className = 'regime invalid';
    }
    return;
  }

  setDisplayValue('tc-display', tc.toFixed(2));

  const regime = getRegime(lambda);
  if (badgeEl) {
    badgeEl.textContent = regime.text;
    badgeEl.className = `regime ${regime.class}`;
  }
}

function readLocalHistory() {
  try {
    const raw = localStorage.getItem('tc-history');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(rows) {
  try {
    localStorage.setItem('tc-history', JSON.stringify(rows));
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
    historyEl.innerHTML = '<p class="empty">Aucun résultat sauvegardé</p>';
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
      ${rows.map(r => `
      <tr>
        <td>${r.mu_star?.toFixed(1) ?? '—'}</td>
        <td>${r.lambda?.toFixed(2) ?? '—'}</td>
        <td>${r.omega_log?.toFixed(1) ?? '—'}</td>
        <td><b>${r.tc?.toFixed(1) ?? '—'}</b></td>
        <td style="color:#aaa;font-family:system-ui">${r.created_at?.slice(0, 16) ?? ''}</td>
        <td><span class="del" onclick="del(${r.id})">supprimer</span></td>
      </tr>`).join('')}
    </table>`;

  historyEl.innerHTML = tableHtml;
}

// ============================================================================
// History Management
// ============================================================================
async function save() {
  const omega_log = get('wlog');
  const lambda = get('lambda');
  const mu_star = get('mustar');
  const tc = mcmillan(omega_log, lambda, mu_star);
  const historyEl = document.getElementById('history-body');

  if (tc === null) {
    alert('Paramètres invalides, rien à sauvegarder.');
    return;
  }

  const entry = {
    id: Date.now(),
    omega_log,
    lambda,
    mu_star,
    tc,
    created_at: new Date().toISOString()
  };

  try {
    const response = await fetch(API + '/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        omega_log: omega_log,
        lambda: lambda,
        mu_star: mu_star
      })
    });

    if (!response.ok) {
      throw new Error('server response not ok');
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
  const historyEl = document.getElementById('history-body');
  if (!historyEl) return;

  try {
    const response = await fetch(API + '/history');
    if (!response.ok) {
      throw new Error('server response not ok');
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
  const historyEl = document.getElementById('history-body');
  const remainingRows = removeFromLocalHistory(id);
  if (historyEl) {
    renderHistory(historyEl, remainingRows);
  }

  try {
    const response = await fetch(API + '/delete/' + id, { method: 'DELETE' });
    if (!response.ok) {
      throw new Error('server response not ok');
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
