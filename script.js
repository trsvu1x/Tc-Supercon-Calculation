// ============================================================================
// Configuration
// ============================================================================
const API = "http://localhost:8000";
const PRECISION = { wlog: 2, lambda: 2, mustar: 3 };

// ============================================================================
// Utility Functions
// ============================================================================
function get(id) {
  return parseFloat(document.getElementById(id).value);
}

function setDisplayValue(id, value, suffix = '') {
  document.getElementById(id).textContent = value + suffix;
}

function setInputValue(id, value) {
  document.getElementById(id).value = value;
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
  if (isNaN(value)) return;

  const slider = document.getElementById(id);
  if (value >= +slider.min && value <= +slider.max) {
    slider.value = value;
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

  const tc = mcmillan(omega_log, lambda, mu_star);
  const displayEl = document.getElementById('tc-display');
  const badgeEl = document.getElementById('regime-badge');

  if (tc === null) {
    setDisplayValue('tc-display', '—');
    badgeEl.textContent = 'Non-supraconducteur';
    badgeEl.className = 'regime invalid';
    return;
  }

  setDisplayValue('tc-display', tc.toFixed(2));

  const regime = getRegime(lambda);
  badgeEl.textContent = regime.text;
  badgeEl.className = `regime ${regime.class}`;
}

// ============================================================================
// History Management
// ============================================================================
async function save() {
  const omega_log = get('wlog');
  const lambda = get('lambda');
  const mu_star = get('mustar');
  const tc = mcmillan(omega_log, lambda, mu_star);

  if (tc === null) {
    alert('Paramètres invalides, rien à sauvegarder.');
    return;
  }

  await fetch(API + '/calculate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      omega_log: omega_log,
      lambda: lambda,
      mu_star: mu_star
    })
  });

  loadHistory();
}

async function loadHistory() {
  const response = await fetch(API + '/history');
  const rows = await response.json();
  const historyEl = document.getElementById('history-body');

  if (!rows.length) {
    historyEl.innerHTML = '<p class="empty">Aucun résultat sauvegardé</p>';
    return;
  }

  const tableHtml = `
    <table>
      <tr>
        <th>ωlog (K)</th>
        <th>λ</th>
        <th>μ*</th>
        <th>Tc (K)</th>
        <th>Date</th>
        <th></th>
      </tr>
      ${rows.map(r => `
      <tr>
        <td>${r.omega_log.toFixed(1)}</td>
        <td>${r.lambda.toFixed(2)}</td>
        <td>${r.mu_star.toFixed(3)}</td>
        <td><b>${r.tc?.toFixed(2) ?? '—'}</b></td>
        <td style="color:#aaa;font-family:system-ui">${r.created_at?.slice(0, 16) ?? ''}</td>
        <td><span class="del" onclick="del(${r.id})">supprimer</span></td>
      </tr>`).join('')}
    </table>`;

  historyEl.innerHTML = tableHtml;
}

async function del(id) {
  await fetch(API + '/delete/' + id, { method: 'DELETE' });
  loadHistory();
}

// ============================================================================
// Initialization
// ============================================================================
compute();
loadHistory();
