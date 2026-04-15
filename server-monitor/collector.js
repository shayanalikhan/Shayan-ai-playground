const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const CACHE_DIR = path.join(__dirname, '.cache');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(command, options = {}) {
  try {
    const stdout = execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: options.timeout ?? 15000,
      maxBuffer: options.maxBuffer ?? 8 * 1024 * 1024,
      shell: '/bin/sh',
    });
    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: '',
      code: 0,
      command,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || error.message || '').trim(),
      code: typeof error.status === 'number' ? error.status : 1,
      command,
    };
  }
}

function cache(key, ttlMs, producer) {
  ensureDir(CACHE_DIR);
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < ttlMs) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch {}

  const value = producer();
  try {
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch {}
  return value;
}

function parseOsRelease() {
  try {
    const raw = fs.readFileSync('/etc/os-release', 'utf8');
    const result = {};
    for (const line of raw.split('\n')) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      result[match[1]] = match[2].replace(/^"|"$/g, '');
    }
    return result;
  } catch {
    return {};
  }
}

function parseKeyValueLines(raw) {
  const out = {};
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function parseFreeBytes() {
  const res = run('free -b');
  if (!res.ok) return null;
  const lines = res.stdout.split('\n').filter(Boolean);
  const memLine = lines.find((line) => line.startsWith('Mem:'));
  const swapLine = lines.find((line) => line.startsWith('Swap:'));
  if (!memLine) return null;
  const mem = memLine.trim().split(/\s+/);
  const swap = swapLine ? swapLine.trim().split(/\s+/) : ['Swap:', '0', '0', '0'];
  return {
    total: Number(mem[1] || 0),
    used: Number(mem[2] || 0),
    free: Number(mem[3] || 0),
    shared: Number(mem[4] || 0),
    buffCache: Number(mem[5] || 0),
    available: Number(mem[6] || 0),
    swapTotal: Number(swap[1] || 0),
    swapUsed: Number(swap[2] || 0),
    swapFree: Number(swap[3] || 0),
  };
}

function parseDf() {
  const res = run('df -B1 --output=source,size,used,avail,pcent,target -x tmpfs -x devtmpfs');
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        source: parts[0],
        size: Number(parts[1] || 0),
        used: Number(parts[2] || 0),
        avail: Number(parts[3] || 0),
        usePct: Number(String(parts[4] || '0').replace('%', '')),
        mount: parts[5] || '',
      };
    });
}

function parsePorts() {
  const res = run('ss -H -ltnup');
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\S+)\s+(\S+)\s+\S+\s+\S+\s+(\S+)\s+(\S+)\s*(.*)$/);
      if (!match) {
        return { raw: line };
      }
      return {
        proto: match[1],
        state: match[2],
        local: match[3],
        peer: match[4],
        process: match[5] || '',
        raw: line,
      };
    });
}

function parseFailedUnits() {
  const res = run('systemctl --failed --no-legend --plain');
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('0 loaded units listed'));
}

function parseTopProcesses() {
  const res = run('ps -eo pid,comm,%cpu,%mem --sort=-%cpu | head -n 8');
  if (!res.ok) return [];
  return res.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      return {
        pid: Number(parts[0] || 0),
        command: parts[1] || '',
        cpu: Number(parts[2] || 0),
        mem: Number(parts[3] || 0),
      };
    });
}

function parsePing(target) {
  const res = run(`ping -c 4 -q ${target}`, { timeout: 10000 });
  if (!res.ok) {
    return { target, ok: false, error: res.stderr || res.stdout || 'ping failed' };
  }
  const lossMatch = res.stdout.match(/(\d+)% packet loss/);
  const rttMatch = res.stdout.match(/= ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)/);
  return {
    target,
    ok: true,
    packetLossPct: Number(lossMatch?.[1] || 0),
    minMs: Number(rttMatch?.[1] || 0),
    avgMs: Number(rttMatch?.[2] || 0),
    maxMs: Number(rttMatch?.[3] || 0),
    jitterMs: Number(rttMatch?.[4] || 0),
  };
}

function parseHttpLatency() {
  const res = run("curl -o /dev/null -s -w 'time_total=%{time_total} code=%{http_code}' --max-time 10 https://example.com", { timeout: 12000 });
  if (!res.ok) {
    return { ok: false, error: res.stderr || res.stdout || 'curl failed' };
  }
  const parsed = parseKeyValueLines(res.stdout.replace(/ /g, '\n'));
  return {
    ok: true,
    ms: Math.round(Number(parsed.time_total || 0) * 1000),
    code: Number(parsed.code || 0),
  };
}

function parseVmstat() {
  const res = run('vmstat 1 2');
  if (!res.ok) return null;
  const lines = res.stdout.split('\n').filter(Boolean);
  const data = lines[lines.length - 1]?.trim().split(/\s+/) || [];
  return {
    runnable: Number(data[0] || 0),
    blocked: Number(data[1] || 0),
    cpuUserPct: Number(data[12] || 0),
    cpuSystemPct: Number(data[13] || 0),
    cpuIdlePct: Number(data[14] || 0),
    cpuWaitPct: Number(data[15] || 0),
    cpuStolenPct: Number(data[16] || 0),
  };
}

function parseIpAddr() {
  const res = run('ip -j addr');
  if (!res.ok) return [];
  try {
    return JSON.parse(res.stdout);
  } catch {
    return [];
  }
}

function getRecentAuthLines() {
  const auth = run('tail -n 250 /var/log/auth.log', { timeout: 10000 });
  if (auth.ok && auth.stdout) {
    return auth.stdout.split('\n').filter(Boolean);
  }
  const journal = run('journalctl -u ssh --no-pager -n 250 -o short-iso', { timeout: 10000 });
  if (journal.ok && journal.stdout) {
    return journal.stdout.split('\n').filter(Boolean);
  }
  return [];
}

function parseSecurityFromAuth(lines) {
  const suspicious = [];
  let bruteForceCount = 0;
  let rootPasswordAcceptedCount = 0;

  for (const line of lines) {
    if (/maximum authentication attempts exceeded/i.test(line)) {
      bruteForceCount += 1;
    }
    if (/Accepted password for root/i.test(line)) {
      rootPasswordAcceptedCount += 1;
      suspicious.push({ severity: 'critical', text: line });
      continue;
    }
    if (/password changed for root/i.test(line)) {
      suspicious.push({ severity: 'high', text: line });
      continue;
    }
    if (/Failed password for root/i.test(line)) {
      suspicious.push({ severity: 'high', text: line });
      continue;
    }
    if (/invalid protocol identifier|banner line contains invalid characters|incomplete message|Unable to negotiate/i.test(line)) {
      suspicious.push({ severity: 'medium', text: line });
      continue;
    }
  }

  return {
    bruteForceCount,
    rootPasswordAcceptedCount,
    suspicious: suspicious.slice(-25),
  };
}

function parseJournalErrors() {
  const res = run('journalctl -p 3 -b --no-pager -n 80 -o short-iso', { timeout: 12000 });
  if (!res.ok) return [];
  return res.stdout.split('\n').filter(Boolean).slice(-40);
}

function parseKernelWarnings() {
  const res = run('dmesg --level=err,warn | tail -n 80', { timeout: 10000 });
  if (!res.ok) return [];
  return res.stdout.split('\n').filter(Boolean);
}

function parseOpenClawStatus() {
  const res = run('openclaw status --deep', { timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
  if (!res.ok) {
    return { ok: false, error: res.stderr || res.stdout || 'openclaw status failed' };
  }
  const gatewayReachableMatch = res.stdout.match(/Gateway\s+│ reachable │ (\d+)ms/i);
  const updateMatch = res.stdout.match(/Update\s+│ ([^\n]+)/);
  const dashboardMatch = res.stdout.match(/Dashboard\s+│ ([^\n]+)/);
  const warnings = [];
  for (const line of res.stdout.split('\n')) {
    if (line.includes('WARN ')) warnings.push(line.replace(/^\s+/, ''));
  }
  return {
    ok: true,
    gatewayReachableMs: Number(gatewayReachableMatch?.[1] || 0),
    updateLine: updateMatch?.[1]?.trim() || '',
    dashboardLine: dashboardMatch?.[1]?.trim() || '',
    warnings,
    raw: res.stdout,
  };
}

function parseOpenClawAudit() {
  const res = run('openclaw security audit --deep', { timeout: 25000, maxBuffer: 16 * 1024 * 1024 });
  if (!res.ok) {
    return { ok: false, error: res.stderr || res.stdout || 'openclaw security audit failed' };
  }
  const summaryMatch = res.stdout.match(/Summary:\s+(\d+) critical\s+·\s+(\d+) warn\s+·\s+(\d+) info/i);
  const warnings = [];
  let currentType = null;
  for (const line of res.stdout.split('\n')) {
    if (line.trim() === 'WARN') {
      currentType = 'warn';
      continue;
    }
    if (line.trim() === 'INFO') {
      currentType = 'info';
      continue;
    }
    if (currentType === 'warn' && /^\S/.test(line)) {
      warnings.push(line.trim());
    }
  }
  return {
    ok: true,
    critical: Number(summaryMatch?.[1] || 0),
    warn: Number(summaryMatch?.[2] || 0),
    info: Number(summaryMatch?.[3] || 0),
    warnings,
    raw: res.stdout,
  };
}

function parseOpenClawUpdate() {
  const res = run('openclaw update status', { timeout: 15000 });
  return {
    ok: res.ok,
    raw: (res.ok ? res.stdout : (res.stderr || res.stdout || 'openclaw update status failed')),
  };
}

function detectFirewall(ports) {
  const hasPublicSsh = ports.some((port) => String(port.local || '').endsWith(':22') && !String(port.local).startsWith('127.0.0.1') && !String(port.local).startsWith('[::1]'));
  const nft = run('command -v nft >/dev/null && nft list ruleset', { timeout: 10000 });
  const ufw = run('command -v ufw >/dev/null && ufw status verbose', { timeout: 10000 });
  const active = Boolean((ufw.ok && /Status: active/i.test(ufw.stdout)) || (nft.ok && nft.stdout));
  return {
    active,
    kind: ufw.ok ? 'ufw' : nft.ok ? 'nftables' : 'none-detected',
    hasPublicSsh,
    note: !active && hasPublicSsh ? 'SSH is exposed publicly and no active host firewall was detected.' : active ? 'Firewall rules detected.' : 'No active firewall rules were detected from this session.',
  };
}

function maybeSpeedtest() {
  const tool = run('command -v speedtest || command -v speedtest-cli');
  if (!tool.ok || !tool.stdout) {
    return {
      available: false,
      note: 'No throughput test CLI is installed. Latency checks are available now, but full bandwidth tests need a speedtest client installed.',
    };
  }
  return {
    available: true,
    command: tool.stdout.split('\n').pop(),
    note: 'Throughput test tool detected. This dashboard is currently showing low-impact latency checks only.',
  };
}

function toGiB(bytes) {
  return Number((bytes / (1024 ** 3)).toFixed(2));
}

function collectSnapshot() {
  const osRelease = parseOsRelease();
  const ipAddr = cache('ip_addr', 5 * 60 * 1000, () => parseIpAddr());
  const ports = cache('ports', 30 * 1000, () => parsePorts());
  const authLines = cache('auth_lines', 60 * 1000, () => getRecentAuthLines());
  const openclawStatus = cache('openclaw_status', 60 * 1000, () => parseOpenClawStatus());
  const openclawAudit = cache('openclaw_audit', 10 * 60 * 1000, () => parseOpenClawAudit());
  const openclawUpdate = cache('openclaw_update', 60 * 60 * 1000, () => parseOpenClawUpdate());
  const pingCloudflare = cache('ping_1_1_1_1', 60 * 1000, () => parsePing('1.1.1.1'));
  const pingGoogle = cache('ping_8_8_8_8', 60 * 1000, () => parsePing('8.8.8.8'));
  const httpLatency = cache('http_latency', 60 * 1000, () => parseHttpLatency());
  const journalErrors = cache('journal_errors', 60 * 1000, () => parseJournalErrors());
  const kernelWarnings = cache('kernel_warnings', 5 * 60 * 1000, () => parseKernelWarnings());
  const securityFromAuth = parseSecurityFromAuth(authLines);
  const memory = parseFreeBytes();
  const disks = parseDf();
  const failedUnits = parseFailedUnits();
  const firewall = detectFirewall(ports);
  const topProcesses = parseTopProcesses();
  const vmstat = parseVmstat();

  const publicInterface = ipAddr.find((entry) => entry.ifname === 'eth0') || ipAddr.find((entry) => entry.ifname && !entry.ifname.startsWith('lo'));
  const tailscale = ipAddr.find((entry) => entry.ifname === 'tailscale0');
  const publicIpv4 = publicInterface?.addr_info?.find((addr) => addr.family === 'inet')?.local || '';
  const tailscaleIpv4 = tailscale?.addr_info?.find((addr) => addr.family === 'inet')?.local || '';
  const cpuInfo = parseKeyValueLines(run('lscpu').stdout || '');

  const alerts = [];
  if (!firewall.active && firewall.hasPublicSsh) {
    alerts.push({ severity: 'critical', title: 'Public SSH without host firewall', detail: firewall.note });
  }
  if (securityFromAuth.rootPasswordAcceptedCount > 0) {
    alerts.push({ severity: 'critical', title: 'Root password SSH logins detected', detail: `${securityFromAuth.rootPasswordAcceptedCount} recent accepted password login(s) for root were seen in auth logs.` });
  }
  if (securityFromAuth.bruteForceCount > 0) {
    alerts.push({ severity: 'high', title: 'SSH brute-force noise detected', detail: `${securityFromAuth.bruteForceCount} recent max-attempt authentication events were seen.` });
  }
  if (kernelWarnings.some((line) => /GPT:Primary header thinks Alt\. header is not at the end of the disk/i.test(line))) {
    alerts.push({ severity: 'medium', title: 'Disk partition table warning', detail: 'The kernel is reporting GPT header mismatch warnings. This should be checked before any disk resize work.' });
  }
  if (openclawAudit.warn > 0) {
    alerts.push({ severity: 'medium', title: 'OpenClaw security warnings', detail: `${openclawAudit.warn} OpenClaw warning(s) are currently active.` });
  }

  const rootDisk = disks.find((disk) => disk.mount === '/') || disks[0] || null;
  const cpuUsagePct = vmstat ? Math.max(0, 100 - vmstat.cpuIdlePct - vmstat.cpuStolenPct) : null;

  return {
    generatedAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      kernel: os.release(),
      distro: osRelease.PRETTY_NAME || 'Unknown',
      uptimeSeconds: os.uptime(),
      loadAvg: os.loadavg(),
      publicIpv4,
      tailscaleIpv4,
      cpuModel: cpuInfo['Model name'] || '',
      cpuCores: Number(cpuInfo['CPU(s)'] || os.cpus().length),
      virtualization: cpuInfo['Hypervisor vendor'] || 'unknown',
    },
    summary: {
      cpuUsagePct,
      memoryUsedPct: memory?.total ? Number(((memory.used / memory.total) * 100).toFixed(1)) : null,
      diskUsedPct: rootDisk?.usePct ?? null,
      internetLatencyMs: pingCloudflare.avgMs || pingGoogle.avgMs || null,
      alertsBySeverity: alerts.reduce((acc, alert) => {
        acc[alert.severity] = (acc[alert.severity] || 0) + 1;
        return acc;
      }, {}),
    },
    cpu: {
      model: cpuInfo['Model name'] || '',
      cores: Number(cpuInfo['CPU(s)'] || os.cpus().length),
      usagePct: cpuUsagePct,
      loadAvg: os.loadavg(),
      vmstat,
      topProcesses,
    },
    memory: memory ? {
      totalBytes: memory.total,
      usedBytes: memory.used,
      availableBytes: memory.available,
      swapTotalBytes: memory.swapTotal,
      swapUsedBytes: memory.swapUsed,
      totalGiB: toGiB(memory.total),
      usedGiB: toGiB(memory.used),
      availableGiB: toGiB(memory.available),
      swapTotalGiB: toGiB(memory.swapTotal),
      swapUsedGiB: toGiB(memory.swapUsed),
    } : null,
    storage: {
      root: rootDisk,
      volumes: disks,
    },
    network: {
      pingCloudflare,
      pingGoogle,
      httpLatency,
      speedtest: maybeSpeedtest(),
      interfaces: ipAddr.map((entry) => ({
        name: entry.ifname,
        state: entry.operstate,
        addresses: (entry.addr_info || []).map((addr) => ({ family: addr.family, local: addr.local, prefixlen: addr.prefixlen })),
      })),
    },
    services: {
      failedUnits,
      listeningPorts: ports,
      openclawStatus,
      openclawUpdate,
    },
    security: {
      firewall,
      openclawAudit,
      auth: securityFromAuth,
      alerts,
      journalErrors,
      kernelWarnings,
    },
  };
}

if (require.main === module) {
  const snapshot = collectSnapshot();
  if (process.argv.includes('--pretty')) {
    const lines = [
      `Host: ${snapshot.host.hostname} (${snapshot.host.distro})`,
      `CPU: ${snapshot.cpu.usagePct ?? 'n/a'}% · RAM: ${snapshot.summary.memoryUsedPct ?? 'n/a'}% · Disk(/): ${snapshot.summary.diskUsedPct ?? 'n/a'}%`,
      `Latency: ${snapshot.network.pingCloudflare.avgMs ?? 'n/a'} ms to 1.1.1.1`,
      `Alerts: ${snapshot.security.alerts.map((alert) => `${alert.severity}:${alert.title}`).join(' | ') || 'none'}`,
    ];
    process.stdout.write(lines.join('\n') + '\n');
  } else {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
  }
}

module.exports = { collectSnapshot };
