const refreshButton = document.getElementById('refreshButton');
const updatedAt = document.getElementById('updatedAt');
const headline = document.getElementById('headline');
const alertStrip = document.getElementById('alertStrip');
const overviewCards = document.getElementById('overviewCards');
const securityMeta = document.getElementById('securityMeta');
const securityList = document.getElementById('securityList');
const networkDetails = document.getElementById('networkDetails');
const openclawDetails = document.getElementById('openclawDetails');
const portsMeta = document.getElementById('portsMeta');
const portsTable = document.getElementById('portsTable');
const processList = document.getElementById('processList');
const storageList = document.getElementById('storageList');
const authList = document.getElementById('authList');
const errorList = document.getElementById('errorList');
const metricCardTemplate = document.getElementById('metricCardTemplate');

function fmtPct(value) {
  return value === null || value === undefined || Number.isNaN(value) ? 'n/a' : `${Number(value).toFixed(1)}%`;
}

function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function fmtMs(value) {
  return value === null || value === undefined || Number.isNaN(value) ? 'n/a' : `${Math.round(value)} ms`;
}

function fmtUptime(seconds) {
  if (!seconds && seconds !== 0) return 'n/a';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${mins}m`;
}

function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function makeItem(title, meta, extra = '') {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = `<div class="title">${title}</div><div class="meta">${meta}</div>${extra}`;
  return div;
}

function renderCards(snapshot) {
  clearNode(overviewCards);
  const cards = [
    {
      label: 'CPU',
      value: fmtPct(snapshot.cpu.usagePct),
      note: `${snapshot.host.cpuCores} vCPU · load ${snapshot.host.loadAvg.map((n) => n.toFixed(2)).join(' / ')}`,
    },
    {
      label: 'Memory',
      value: fmtPct(snapshot.summary.memoryUsedPct),
      note: `${snapshot.memory.usedGiB.toFixed(2)} / ${snapshot.memory.totalGiB.toFixed(2)} GiB used`,
    },
    {
      label: 'Disk (/)',
      value: fmtPct(snapshot.summary.diskUsedPct),
      note: `${fmtBytes(snapshot.storage.root.used)} / ${fmtBytes(snapshot.storage.root.size)} used`,
    },
    {
      label: 'Internet',
      value: fmtMs(snapshot.network.pingCloudflare.avgMs || snapshot.network.pingGoogle.avgMs),
      note: `1.1.1.1 loss ${snapshot.network.pingCloudflare.packetLossPct ?? 'n/a'}% · HTTP ${fmtMs(snapshot.network.httpLatency.ms)}`,
    },
    {
      label: 'OpenClaw',
      value: snapshot.services.openclawStatus.ok ? fmtMs(snapshot.services.openclawStatus.gatewayReachableMs) : 'error',
      note: snapshot.services.openclawStatus.ok ? (snapshot.services.openclawStatus.updateLine || 'Gateway reachable') : snapshot.services.openclawStatus.error,
    },
    {
      label: 'Security alerts',
      value: String(snapshot.security.alerts.length),
      note: snapshot.security.alerts.length ? snapshot.security.alerts.map((item) => item.title).slice(0, 2).join(' · ') : 'No active alerts detected',
    },
  ];

  for (const card of cards) {
    const node = metricCardTemplate.content.cloneNode(true);
    node.querySelector('.metric-label').textContent = card.label;
    node.querySelector('.metric-value').textContent = card.value;
    node.querySelector('.metric-note').textContent = card.note;
    overviewCards.appendChild(node);
  }
}

function renderAlerts(snapshot) {
  clearNode(alertStrip);
  const alerts = snapshot.security.alerts;
  if (!alerts.length) {
    alertStrip.appendChild(makeItem('All clear', 'No current critical monitoring alerts.'));
    return;
  }
  for (const alert of alerts) {
    const node = document.createElement('article');
    node.className = `alert alert-${alert.severity}`;
    node.innerHTML = `
      <div class="alert-dot"></div>
      <div>
        <div class="row">
          <strong>${alert.title}</strong>
          <span class="severity severity-${alert.severity}">${alert.severity}</span>
        </div>
        <div class="meta">${alert.detail}</div>
      </div>
    `;
    alertStrip.appendChild(node);
  }
}

function renderSecurity(snapshot) {
  clearNode(securityList);
  securityMeta.textContent = `${snapshot.security.alerts.length} active`;
  const items = [
    makeItem(
      'Firewall posture',
      `${snapshot.security.firewall.note}`,
      `<div class="meta">Mode: ${snapshot.security.firewall.kind}</div>`
    ),
    makeItem(
      'OpenClaw audit',
      `${snapshot.security.openclawAudit.critical} critical · ${snapshot.security.openclawAudit.warn} warn · ${snapshot.security.openclawAudit.info} info`,
      `<div class="meta">${(snapshot.security.openclawAudit.warnings || []).slice(0, 3).join('<br/>') || 'No warnings'}</div>`
    ),
    makeItem(
      'SSH auth signal',
      `${snapshot.security.auth.bruteForceCount} brute-force events · ${snapshot.security.auth.rootPasswordAcceptedCount} accepted root password login(s)`,
      '<div class="meta">Recent auth anomalies are shown below.</div>'
    ),
  ];
  items.forEach((item) => securityList.appendChild(item));
}

function renderNetwork(snapshot) {
  clearNode(networkDetails);
  const speedNote = snapshot.network.speedtest.available
    ? snapshot.network.speedtest.note
    : snapshot.network.speedtest.note;
  networkDetails.appendChild(makeItem('Public IP', snapshot.host.publicIpv4 || 'n/a', snapshot.host.tailscaleIpv4 ? `<div class="meta">Tailscale: ${snapshot.host.tailscaleIpv4}</div>` : ''));
  networkDetails.appendChild(makeItem('Cloudflare latency', `${fmtMs(snapshot.network.pingCloudflare.avgMs)} avg · ${snapshot.network.pingCloudflare.packetLossPct ?? 'n/a'}% loss`));
  networkDetails.appendChild(makeItem('Google latency', `${fmtMs(snapshot.network.pingGoogle.avgMs)} avg · ${snapshot.network.pingGoogle.packetLossPct ?? 'n/a'}% loss`));
  networkDetails.appendChild(makeItem('HTTP reachability', `${fmtMs(snapshot.network.httpLatency.ms)} · HTTP ${snapshot.network.httpLatency.code || 'n/a'}`));
  networkDetails.appendChild(makeItem('Bandwidth testing', speedNote));
}

function renderOpenClaw(snapshot) {
  clearNode(openclawDetails);
  const status = snapshot.services.openclawStatus;
  openclawDetails.appendChild(makeItem('Gateway reachability', status.ok ? fmtMs(status.gatewayReachableMs) : status.error));
  openclawDetails.appendChild(makeItem('Update status', snapshot.services.openclawUpdate.ok ? 'Up to date' : 'Unavailable', `<div class="meta"><code>${snapshot.services.openclawUpdate.raw.replace(/</g, '&lt;')}</code></div>`));
  openclawDetails.appendChild(makeItem('Dashboard binding', status.dashboardLine || 'n/a'));
}

function renderPorts(snapshot) {
  clearNode(portsTable);
  portsMeta.textContent = `${snapshot.services.listeningPorts.length} open sockets`;
  const table = document.createElement('div');
  table.className = 'table';
  const head = document.createElement('div');
  head.className = 'table-row head';
  head.innerHTML = '<div>Proto</div><div>Local</div><div>State</div><div>Process</div>';
  table.appendChild(head);
  snapshot.services.listeningPorts.slice(0, 16).forEach((port) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <div><code>${port.proto || 'n/a'}</code></div>
      <div><code>${port.local || port.raw || 'n/a'}</code></div>
      <div>${port.state || 'n/a'}</div>
      <div><code>${(port.process || '').replace(/</g, '&lt;') || 'n/a'}</code></div>
    `;
    table.appendChild(row);
  });
  portsTable.appendChild(table);
}

function renderProcesses(snapshot) {
  clearNode(processList);
  snapshot.cpu.topProcesses.forEach((proc) => {
    processList.appendChild(makeItem(`${proc.command} (${proc.pid})`, `${proc.cpu}% CPU · ${proc.mem}% RAM`));
  });
}

function renderStorage(snapshot) {
  clearNode(storageList);
  snapshot.storage.volumes.forEach((volume) => {
    storageList.appendChild(makeItem(`${volume.mount} · ${fmtPct(volume.usePct)}`, `${fmtBytes(volume.used)} / ${fmtBytes(volume.size)} used`, `<div class="meta"><code>${volume.source}</code></div>`));
  });
}

function renderAuth(snapshot) {
  clearNode(authList);
  const lines = snapshot.security.auth.suspicious || [];
  if (!lines.length) {
    authList.appendChild(makeItem('No recent auth anomalies', 'Nothing suspicious in the recent auth window.'));
    return;
  }
  lines.slice().reverse().slice(0, 14).forEach((entry) => {
    authList.appendChild(makeItem(entry.severity.toUpperCase(), entry.text));
  });
}

function renderErrors(snapshot) {
  clearNode(errorList);
  const lines = [...(snapshot.security.journalErrors || []), ...(snapshot.security.kernelWarnings || []).slice(-8)];
  if (!lines.length) {
    errorList.appendChild(makeItem('No recent errors', 'journalctl and dmesg are quiet.'));
    return;
  }
  lines.slice(-16).forEach((line) => {
    errorList.appendChild(makeItem('System log', line));
  });
}

function render(snapshot) {
  updatedAt.textContent = new Date(snapshot.generatedAt).toLocaleTimeString();
  headline.textContent = `${snapshot.host.hostname} · ${snapshot.host.distro} · uptime ${fmtUptime(snapshot.host.uptimeSeconds)} · ${snapshot.host.cpuModel}`;
  renderCards(snapshot);
  renderAlerts(snapshot);
  renderSecurity(snapshot);
  renderNetwork(snapshot);
  renderOpenClaw(snapshot);
  renderPorts(snapshot);
  renderProcesses(snapshot);
  renderStorage(snapshot);
  renderAuth(snapshot);
  renderErrors(snapshot);
}

async function loadSnapshot() {
  refreshButton.disabled = true;
  refreshButton.textContent = 'Refreshing...';
  try {
    const response = await fetch('/api/snapshot', { cache: 'no-store' });
    const snapshot = await response.json();
    if (!response.ok) throw new Error(snapshot.error || 'Snapshot failed');
    render(snapshot);
  } catch (error) {
    headline.textContent = error.message;
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = 'Refresh';
  }
}

refreshButton.addEventListener('click', loadSnapshot);
loadSnapshot();
setInterval(loadSnapshot, 15000);
