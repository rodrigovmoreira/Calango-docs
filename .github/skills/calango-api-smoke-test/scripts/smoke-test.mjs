#!/usr/bin/env node
/**
 * Executor de smoke tests das APIs do ecossistema Calango/Squamata.
 *
 * Lê o contrato de assets/smoke.manifest.json, espera o serviço ficar pronto
 * (HTTP ou TCP) e executa requisições reais comparando o status com o esperado.
 *
 * Uso:
 *   node smoke-test.mjs --list
 *   node smoke-test.mjs --service calango-bot --wait 60
 *   node smoke-test.mjs --all --json
 *   node smoke-test.mjs --service squamata-upload --token "$API_KEY" --token-style raw
 *
 * Sem dependências externas. Requer Node >= 18 (fetch global).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.resolve(HERE, '../assets/smoke.manifest.json');

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE = 2;

function usage() {
  console.log(`Uso: node smoke-test.mjs [opções]

  --list                Lista os serviços do manifesto e sai
  --service <a,b>       Serviços a testar (nomes do manifesto)
  --all                 Testa todos os serviços do manifesto
  --base <url>          Sobrescreve a URL base (ex: http://localhost:3999)
  --token <valor>       Token enviado nas probes marcadas como autenticadas
  --token-style <s>     "bearer" (padrão) ou "raw" (Authorization sem Bearer)
  --wait <segundos>     Tempo máximo de readiness por serviço (padrão 30)
  --timeout <ms>        Timeout por requisição (padrão 5000)
  --only-ready          Só espera o readiness, sem rodar as probes
  --json                Saída estruturada
  --help                Esta ajuda`);
}

function parseArgs(argv) {
  const opts = {
    list: false,
    all: false,
    services: [],
    base: null,
    token: null,
    tokenStyle: 'bearer',
    wait: 30,
    timeout: null,
    onlyReady: false,
    json: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`A flag ${arg} exige um valor`);
      return value;
    };

    switch (arg) {
      case '--list': opts.list = true; break;
      case '--all': opts.all = true; break;
      case '--service':
      case '-s':
        opts.services.push(...next().split(',').map((s) => s.trim()).filter(Boolean));
        break;
      case '--base': opts.base = next().replace(/\/+$/, ''); break;
      case '--token': opts.token = next(); break;
      case '--token-style': opts.tokenStyle = next(); break;
      case '--wait': opts.wait = Number(next()); break;
      case '--timeout': opts.timeout = Number(next()); break;
      case '--only-ready': opts.onlyReady = true; break;
      case '--json': opts.json = true; break;
      case '--help':
      case '-h': opts.help = true; break;
      default:
        throw new Error(`Flag desconhecida: ${arg}`);
    }
  }

  return opts;
}

function loadManifest() {
  const raw = readFileSync(MANIFEST_PATH, 'utf8');
  const manifest = JSON.parse(raw);

  if (!manifest.services || typeof manifest.services !== 'object') {
    throw new Error('Manifesto inválido: falta o objeto "services"');
  }
  return manifest;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Teste de porta TCP, usado como readiness de serviços sem healthcheck HTTP. */
function probeTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const done = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, 'tcp connect'));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', (err) => done(false, err.code || err.message));
    socket.connect(port, host);
  });
}

function buildHeaders(probe, opts, defaults) {
  // "Connection: close" evita sockets keep-alive do undici segurando o event loop
  // (e o crash de libuv ao chamar process.exit no Windows).
  const headers = { Connection: 'close', ...defaults, ...(probe.headers || {}) };
  const wantsAuth = probe.auth === true;

  if (wantsAuth && opts.token) {
    headers.Authorization = opts.tokenStyle === 'raw' ? opts.token : `Bearer ${opts.token}`;
  }
  return headers;
}

function expectedStatuses(probe, opts) {
  if (probe.auth === true && opts.token) {
    return Array.isArray(probe.expectAuthed) ? probe.expectAuthed : [200, 204];
  }
  return probe.expect || [200];
}

async function runProbe(baseUrl, probe, opts, defaults) {
  const method = (probe.method || 'GET').toUpperCase();
  const url = `${baseUrl}${probe.path}`;
  const expected = expectedStatuses(probe, opts);
  const startedAt = Date.now();
  const hasBody = probe.body !== undefined;
  const headers = buildHeaders(probe, opts, defaults);

  if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: hasBody ? JSON.stringify(probe.body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeout),
    });
  } catch (error) {
    const code = error?.cause?.code || error?.name || 'ERROR';
    const reason = error?.cause?.code === 'ECONNREFUSED'
      ? 'serviço não está escutando nesta porta'
      : error?.name === 'TimeoutError'
        ? 'sem resposta dentro do timeout'
        : (error?.message || String(error));

    return {
      name: probe.name,
      method,
      path: probe.path,
      expected,
      actual: code,
      ok: false,
      ms: Date.now() - startedAt,
      hint: reason,
      snippet: null,
    };
  }

  const status = response.status;
  const text = await response.text().catch(() => '');
  const snippet = text ? text.replace(/\s+/g, ' ').slice(0, 160) : null;

  // Alguns handlers usam 4xx de negócio (ex.: 404 "não encontrado") em vez de erro
  // de roteamento. expectBodyContains prova que a rota executou o handler.
  const bodyOk = probe.expectBodyContains
    ? text.toLowerCase().includes(probe.expectBodyContains.toLowerCase())
    : true;
  const statusOk = expected.includes(status);
  const ok = statusOk && bodyOk;

  return {
    name: probe.name,
    method,
    path: probe.path,
    expected,
    actual: status,
    ok,
    ms: Date.now() - startedAt,
    hint: ok
      ? null
      : statusOk && !bodyOk
        ? `status correto, mas a resposta não contém "${probe.expectBodyContains}"`
        : hintFor(status),
    snippet,
  };
}

function hintFor(status) {
  if (status === 404) return 'rota não encontrada (prefixo/versão ou ordem de registro)';
  if (status === 401) return 'auth exigida (esperado apenas se a rota é protegida)';
  if (status === 403) return 'auth/permissão negada';
  if (status === 500) return 'erro interno no handler — ver log do serviço';
  if (status === 502 || status === 503 || status === 504) return 'upstream indisponível';
  return 'status fora do contrato';
}

async function waitForReady(service, opts, defaults) {
  const base = opts.base || service.baseUrl;
  const deadline = Date.now() + opts.wait * 1000;
  const ready = service.ready;

  let lastDetail = 'sem tentativa';

  while (Date.now() < deadline) {
    if (ready && ready.path) {
      const result = await runProbe(base, { ...ready, name: 'readiness' }, opts, defaults);
      if (result.ok) return { ok: true, detail: `${result.method} ${ready.path} -> ${result.actual}` };
      lastDetail = `${ready.path} -> ${result.actual}`;
    } else {
      const host = new URL(base).hostname;
      const port = Number(new URL(base).port || 80);
      const tcp = await probeTcp(host, port, opts.timeout);
      if (tcp.ok) return { ok: true, detail: `tcp ${port}` };
      lastDetail = tcp.detail;
    }
    await sleep(Math.min(1000, Math.max(250, deadline - Date.now())));
  }

  return { ok: false, detail: `timeout após ${opts.wait}s (último: ${lastDetail})` };
}

async function testService(name, service, opts, manifest) {
  const base = opts.base || service.baseUrl;
  const defaults = { headers: { ...(manifest.defaults?.headers || {}), ...(service.headers || {}) } };

  const ready = await waitForReady(service, opts, defaults);
  const result = {
    service: name,
    label: service.label || name,
    base,
    dir: service.dir || null,
    start: service.start || null,
    tier: service.tier || null,
    spof: service.spof === true,
    dependsOn: service.dependsOn || [],
    ready,
    probes: [],
    passed: 0,
    failed: 0,
  };

  if (!ready.ok || opts.onlyReady) {
    result.failed = ready.ok ? 0 : 1;
    return result;
  }

  for (const probe of service.probes || []) {
    const probeResult = await runProbe(base, probe, opts, defaults);
    result.probes.push(probeResult);
    if (probeResult.ok) result.passed++;
    else result.failed++;
  }

  return result;
}

function printHuman(results, opts) {
  const tested = new Set(results.map((r) => r.service));

  for (const r of results) {
    console.log(`\n=== ${r.label} (${r.service}) — ${r.base}`);
    if (r.dir) console.log(`    pasta: ${r.dir}${r.start ? `   start: ${r.start}` : ''}`);
    if (r.tier) console.log(`    camada: ${r.tier}${r.spof ? ' (SPOF — suba primeiro, derrube por último)' : ''}`);
    if (r.dependsOn.length > 0) {
      const missing = r.dependsOn.filter((dep) => !tested.has(dep));
      console.log(`    depende de: ${r.dependsOn.join(', ')}${missing.length ? ` (não testado nesta execução: ${missing.join(', ')})` : ''}`);
    }
    console.log(`    readiness: ${r.ready.ok ? 'OK' : 'FALHOU'} — ${r.ready.detail}`);

    for (const p of r.probes) {
      const status = p.ok ? 'PASS' : 'FAIL';
      const expected = p.expected.join('/');
      console.log(`    [${status}] ${p.method.padEnd(5)} ${p.path} -> ${p.actual} (esperado ${expected}, ${p.ms}ms)`);
      if (!p.ok) {
        console.log(`           diagnóstico: ${p.hint}`);
        if (p.snippet) console.log(`           resposta: ${p.snippet}`);
      }
    }

    const total = r.probes.length;
    console.log(`    probes: ${r.passed}/${total} ok${r.failed ? ` · ${r.failed} falha(s)` : ''}`);
  }

  const failedServices = results.filter((r) => r.failed > 0 || !r.ready.ok).length;
  const totalProbes = results.reduce((acc, r) => acc + r.probes.length, 0);
  const passedProbes = results.reduce((acc, r) => acc + r.passed, 0);

  console.log(`\nResumo: ${results.length} serviço(s) · ${passedProbes}/${totalProbes} probe(s) ok · ${failedServices} serviço(s) com falha`);

  // SPOF só é alarme quando o serviço está realmente fora do ar (readiness falhou).
  // Uma probe com status inesperado em serviço vivo é falha de contrato, não indisponibilidade.
  const spofDown = results.filter((r) => r.spof && !r.ready.ok);
  if (spofDown.length > 0) {
    console.log(`⚠️  SPOF indisponível: ${spofDown.map((r) => r.service).join(', ')}. Nenhum app do ecossistema consegue emitir novo login — resolva isto antes de investigar os demais serviços.`);
  }

  const untestedDeps = results
    .filter((r) => r.dependsOn.some((dep) => !results.some((x) => x.service === dep)))
    .flatMap((r) => r.dependsOn.filter((dep) => !results.some((x) => x.service === dep)));
  if (untestedDeps.length > 0) {
    console.log(`Nota: dependência(s) não testada(s) nesta execução: ${[...new Set(untestedDeps)].join(', ')}. Um 401 pode ser do ambiente, não do serviço.`);
  }

  if (!opts.token) {
    console.log('Nota: nenhum --token informado; probes autenticadas rodaram no modo "sem credencial".');
  }
}

function printList(manifest) {
  console.log('Serviços no manifesto:\n');
  for (const [name, service] of Object.entries(manifest.services)) {
    const probes = service.probes?.length ?? 0;
    const flags = [service.tier, service.spof ? 'SPOF' : null].filter(Boolean).join(', ');
    console.log(`  ${name.padEnd(22)} ${String(service.baseUrl).padEnd(26)} porta ${String(service.port ?? '-').padEnd(6)} ${probes} probe(s)${flags ? ` [${flags}]` : ''}`);
    if (service.dir) console.log(`  ${''.padEnd(22)} ${service.dir} → ${service.start}`);
    if (service.dependsOn?.length) console.log(`  ${''.padEnd(22)} depende de: ${service.dependsOn.join(', ')}`);
  }

  const critical = Object.entries(manifest.services).filter(([, s]) => s.spof).map(([n]) => n);
  if (critical.length > 0) {
    console.log(`\nAtenção: ${critical.join(', ')} é dependência central (SPOF). Suba primeiro e derrube por último.`);
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`Erro: ${error.message}\n`);
    usage();
    return EXIT_USAGE;
  }

  if (opts.help) {
    usage();
    return EXIT_OK;
  }

  const manifest = loadManifest();
  opts.timeout = opts.timeout || manifest.defaults?.timeoutMs || 5000;

  if (opts.list) {
    printList(manifest);
    return EXIT_OK;
  }

  const names = opts.all
    ? Object.keys(manifest.services)
    : opts.services;

  if (names.length === 0) {
    console.error('Erro: informe --service <nome> ou --all (use --list para ver os nomes).\n');
    usage();
    return EXIT_USAGE;
  }

  const unknown = names.filter((name) => !manifest.services[name]);
  if (unknown.length > 0) {
    console.error(`Erro: serviço(s) desconhecido(s): ${unknown.join(', ')}`);
    console.error(`Disponíveis: ${Object.keys(manifest.services).join(', ')}`);
    return EXIT_USAGE;
  }

  if (opts.base && names.length > 1) {
    console.error('Erro: --base vale para um único serviço. Teste um serviço por vez com --base.');
    return EXIT_USAGE;
  }

  const results = [];
  for (const name of names) {
    results.push(await testService(name, manifest.services[name], opts, manifest));
  }

  if (opts.json) {
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), baseOverride: opts.base, results }, null, 2));
  } else {
    printHuman(results, opts);
  }

  const hasFailure = results.some((r) => !r.ready.ok || r.failed > 0);
  return hasFailure ? EXIT_FAILED : EXIT_OK;
}

main()
  .then((code) => {
    // Não usamos process.exit(): no Windows isso dispara uma assertion do libuv
    // quando ainda há handles assíncronos do fetch. exitCode deixa o loop drenar.
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`Erro inesperado: ${error.stack || error.message}`);
    process.exitCode = EXIT_USAGE;
  });
