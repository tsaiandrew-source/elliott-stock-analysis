import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { loadCoverageRoster } from './coverage-roster.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const cleanDate = (value) => String(value || '').replaceAll('-', '');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') options.base = path.resolve(argv[++index]);
    else if (arg === '--handoff') options.handoff = path.resolve(argv[++index]);
    else if (arg === '--output') options.output = path.resolve(argv[++index]);
    else if (arg === '--qa-output') options.qaOutput = path.resolve(argv[++index]);
    else if (arg === '--routing-correction') options.routingCorrection = path.resolve(argv[++index]);
    else if (arg === '--routing-lock') options.routingLock = path.resolve(argv[++index]);
    else if (arg === '--batch-id') options.batchId = argv[++index];
    else if (arg === '--revision') options.revision = argv[++index];
    else throw new Error(`unknown argument ${arg}`);
  }
  for (const field of ['base', 'handoff', 'output']) {
    if (!options[field]) throw new Error(`--${field.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`)} is required`);
  }
  options.revision ||= 'R1';
  return options;
}

async function readJson(file) {
  const text = await fs.readFile(file, 'utf8');
  return { value: JSON.parse(text), text, hash: sha256(text) };
}

async function verifyFile(reference, label) {
  if (!isObject(reference) || !reference.path || !reference.sha256) throw new Error(`${label} reference is incomplete`);
  const bytes = await fs.readFile(reference.path);
  const observed = sha256(bytes);
  if (observed !== reference.sha256) throw new Error(`${label} hash mismatch; expected=${reference.sha256} observed=${observed}`);
  return observed;
}

function confidenceBand(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 90) return 'high';
  if (value >= 80) return 'medium-high';
  if (value >= 70) return 'medium';
  if (value >= 60) return 'medium-low';
  return 'low';
}

function directionText(direction) {
  if (direction === 'up') return { side: '上方', relation: '上方' };
  if (direction === 'down') return { side: '下方', relation: '下方' };
  return { side: '任一方向', relation: '突破側' };
}

function patternLabel(pattern) {
  return `${pattern.label_zh || pattern.type || '型態'}${pattern.state_zh || ''}`;
}

function confirmationFor(pattern) {
  const direction = pattern.direction === 'none' ? pattern.watch_direction : pattern.direction;
  const { side, relation } = directionText(direction);
  const level = Number.isFinite(pattern.breakout_level) ? Number(pattern.breakout_level).toFixed(4) : null;
  if (pattern.state === 'forming') return `完成收盤向${side}突破已辨識型態邊界，並獲後續價量接受，才升級正式方向。`;
  if (pattern.state === 'breakout_candidate') return `完成收盤延續${side}突破${level ? ` ${level}` : '已辨識邊界'}，並獲後續價量接受。`;
  if (pattern.state === 'breakout_confirmed' || pattern.state === 'retest_held') return `完成收盤維持在${level ? ` ${level}` : '已突破邊界'}的${relation}，並獲後續價量接受。`;
  return `需由下一完成交易時段確認${patternLabel(pattern)}是否延續。`;
}

function invalidationFor(pattern) {
  const level = Number.isFinite(pattern.invalidation) ? Number(pattern.invalidation).toFixed(4) : null;
  return level ? `完成收盤破壞 ${level}，${patternLabel(pattern)}失效。` : `完成收盤破壞已辨識型態邊界，${patternLabel(pattern)}失效。`;
}

function wyckoffLabel(wyckoff) {
  if (!isObject(wyckoff) || wyckoff.structure === 'unclassified') return '未分類';
  const structure = wyckoff.structure === 'accumulation' ? '吸籌' : wyckoff.structure === 'distribution' ? '派發' : '未分類';
  const phase = [wyckoff.current_phase, wyckoff.future_phase].filter(Boolean).join('→');
  return `${structure}${phase ? ` · Phase ${phase}` : ''}${wyckoff.status === 'candidate' ? ' 候選' : ''}`;
}

function evidenceReference(label, reference, cutoff, url = null) {
  return { label, url, path: reference.path, sha256: reference.sha256, cutoff };
}

function withoutTechnicalMissing(values, date) {
  return (Array.isArray(values) ? values : []).filter((value) => {
    const text = String(value || '');
    return !(text.includes(`${date} 完整型態`) || text.includes('型態／Wyckoff 引擎刷新'));
  });
}

function replaceSection(digest, heading, points) {
  const sections = Array.isArray(digest.sections) ? digest.sections : [];
  const section = sections.find((item) => item.heading === heading);
  if (section) section.points = points;
  else sections.push({ heading, points });
  digest.sections = sections;
}

function refreshDigest(packet, pattern, wyckoff, completedBar) {
  const digest = packet.dailyDigest?.endOfDay;
  if (!isObject(digest)) throw new Error(`${packet.ticker} dailyDigest.endOfDay is required`);
  const label = patternLabel(pattern);
  const close = Number(completedBar.close);
  const opening = `${label}（${pattern.confidence}%）；${packet.analysisDate} 收 ${close.toFixed(2)}。`;
  const patternPoint = `日線主候選：${label}（${pattern.confidence}%）；Wyckoff：${wyckoffLabel(wyckoff)}。技術層已完成 ${packet.analysisDate} 對帳。`;
  const next = `下一完成交易時段驗證：${packet.confirmation}；${packet.invalidation}`;
  replaceSection(digest, '摘要與市場脈絡', [opening]);
  replaceSection(digest, 'Pattern 與 Wyckoff', [patternPoint]);
  replaceSection(digest, '下一步', [next]);
  digest.points = digest.sections.flatMap((section) => section.points || []);
  digest.next = next;
}

function technicalSourceEvidence(handoffPath, handoffHash, handoff, asset) {
  const cutoff = handoff.completedSessionDate;
  return [
    { label: 'Iris Universal Refresh 技術層 handoff', url: null, path: handoffPath, sha256: handoffHash, cutoff },
    evidenceReference('技術層 manifest', handoff.technicalManifest, cutoff),
    evidenceReference('技術層 source ledger', handoff.sourceLedger, cutoff),
    evidenceReference('技術層自動稽核', handoff.automatedAudit, cutoff),
    evidenceReference('技術圖原始解析度視覺 QA', handoff.originalResolutionVisualQa, cutoff),
    { label: `${asset.ticker} 技術層完成交易時段來源`, url: asset.source_url || null, path: asset.source, sha256: asset.source_sha256, cutoff },
    { label: `${asset.ticker} 技術圖`, url: null, path: asset.path, sha256: asset.sha256, cutoff }
  ];
}

function updateDailyPacket(packet, asset, context) {
  const updated = structuredClone(packet);
  updated.supersedesRunId = packet.runId;
  updated.runId = `${packet.ticker}-${cleanDate(packet.analysisDate)}-EOD-TECHNICAL-${context.revision}-D`;
  updated.batchId = context.batchId;
  updated.secondaryCandidate = null;

  if (!asset) {
    updated.technicalReconciliation = {
      status: 'PRESERVED_NOT_SUPPLIED',
      completedSession: context.handoff.completedSessionDate,
      handoffBatchId: context.handoff.batchId,
      reason: '此 ticker 不在本次 14 檔技術 handoff；保留既有技術分析，不推導新值。'
    };
    return updated;
  }

  const pattern = structuredClone(asset.pattern);
  const wyckoff = structuredClone(asset.projection_source?.wyckoff || null);
  const label = patternLabel(pattern);
  const predictionDirection = ['up', 'down', 'flat'].includes(pattern.direction) ? pattern.direction : null;
  updated.patternLabel = label;
  updated.confidencePercent = pattern.confidence;
  updated.confidenceBand = confidenceBand(pattern.confidence);
  updated.predictionDirection = predictionDirection;
  updated.confirmation = confirmationFor(pattern);
  updated.invalidation = invalidationFor(pattern);
  updated.primaryCandidate = {
    label: '日線主候選',
    patternLabel: label,
    confidencePercent: pattern.confidence,
    confidenceBand: updated.confidenceBand,
    confirmation: updated.confirmation,
    invalidation: updated.invalidation
  };
  updated.thesis = `${label}（${pattern.confidence}%）。 確認：${updated.confirmation} 失效：${updated.invalidation}`;
  updated.technicalEvidence = {
    ...(isObject(updated.technicalEvidence) ? updated.technicalEvidence : {}),
    completedSession: structuredClone(asset.completed_bar),
    indicators: {
      daily: {
        ...(isObject(updated.technicalEvidence?.indicators?.daily) ? updated.technicalEvidence.indicators.daily : {}),
        ...structuredClone(asset.indicators)
      },
      role: updated.technicalEvidence?.indicators?.role || 'RSI／MACD／量能僅作價格結構的輔助確認'
    },
    patterns: {
      ...(isObject(updated.technicalEvidence?.patterns) ? updated.technicalEvidence.patterns : {}),
      dailyPrimary: pattern,
      actionableSecondary: structuredClone(asset.actionable_secondary_pattern || null),
      status: `complete_${context.handoff.completedSessionDate}`
    },
    wyckoff: {
      ...(isObject(updated.technicalEvidence?.wyckoff) ? updated.technicalEvidence.wyckoff : {}),
      daily: wyckoffLabel(wyckoff),
      weekly: updated.technicalEvidence?.wyckoff?.weekly || 'carried-forward'
    },
    projectionSource: structuredClone(asset.projection_source),
    patternEngine: structuredClone(asset.pattern_engine),
    trendStateCountsVisible: structuredClone(asset.trend_state_counts_visible),
    visualContract: structuredClone(asset.visual_contract),
    qaStatus: 'PASS'
  };
  updated.wyckoffPhase = {
    ...updated.wyckoffPhase,
    daily: wyckoffLabel(wyckoff),
    dailyStatus: wyckoff?.status || 'complete',
    dailyEvidence: wyckoff,
    missingFields: withoutTechnicalMissing(updated.wyckoffPhase?.missingFields, packet.analysisDate)
  };
  updated.laneStatus = {
    ...updated.laneStatus,
    technical: 'complete',
    wyckoffDaily: wyckoff?.status || 'complete'
  };
  updated.missingFields = withoutTechnicalMissing(updated.missingFields, packet.analysisDate);
  updated.dailyDigest.missingFields = withoutTechnicalMissing(updated.dailyDigest?.missingFields, packet.analysisDate);
  updated.recoveryTiming = `${packet.analysisDate} 技術層已完成對帳；其餘未完成欄位維持既有 catch-up 狀態。`;
  updated.dailyDigest.recoveryTiming = updated.recoveryTiming;
  refreshDigest(updated, pattern, wyckoff, asset.completed_bar);
  const refs = technicalSourceEvidence(context.handoffPath, context.handoffHash, context.handoff, asset);
  updated.sourceEvidence = [...updated.sourceEvidence, ...refs];
  updated.dailyDigest.sourceEvidence = [...updated.dailyDigest.sourceEvidence, ...refs];
  updated.sessionEvidenceReconciliation = {
    ...(updated.sessionEvidenceReconciliation || {}),
    technicalStatus: 'PASS',
    technicalManifest: context.handoff.technicalManifest.path,
    technicalManifestSha256: context.handoff.technicalManifest.sha256,
    completedBarClose: asset.completed_bar.close
  };
  updated.formalRefreshReconciliation = {
    ...(updated.formalRefreshReconciliation || {}),
    technicalRevision: context.batchId,
    technicalResult: `${packet.analysisDate} 技術型態、Wyckoff 與完成交易時段已完成 hash-backed 對帳。`
  };
  updated.technicalReconciliation = {
    status: 'PASS',
    completedSession: context.handoff.completedSessionDate,
    handoffBatchId: context.handoff.batchId,
    sourceBatchId: context.handoff.sourceBatchId,
    technicalManifestSha256: context.handoff.technicalManifest.sha256,
    imageSha256: asset.sha256,
    sourceSha256: asset.source_sha256
  };
  return updated;
}

function updateWeeklyPacket(packet, context, supplied) {
  const updated = structuredClone(packet);
  updated.supersedesRunId = packet.runId;
  updated.runId = `${packet.ticker}-${cleanDate(packet.dataThrough)}-EOW-TECHNICAL-${context.revision}-W`;
  updated.batchId = context.batchId;
  updated.technicalReconciliation = {
    status: 'PRESERVED_DAILY_ONLY_HANDOFF',
    completedSession: context.handoff.completedSessionDate,
    handoffBatchId: context.handoff.batchId,
    suppliedInDailyTechnicalPackage: supplied,
    reason: '本 handoff 僅含 1D 技術層；週線維持最後交易日完成週的既有分析。'
  };
  return updated;
}

async function build(options) {
  const [baseFile, handoffFile, roster] = await Promise.all([
    readJson(options.base),
    readJson(options.handoff),
    loadCoverageRoster()
  ]);
  const base = baseFile.value;
  const handoff = handoffFile.value;
  if (base.schemaVersion !== 'iris-analysis-contract-v2') throw new Error('base packet must use iris-analysis-contract-v2');
  if (handoff.schema !== 'iris-universal-refresh-technical-input.v1' || handoff.status !== 'READY_FOR_IRIS_UNIVERSAL_REFRESH') throw new Error('handoff is not ready for Iris Universal Refresh');
  if (handoff.routingLockVersion !== '2026-09-17') throw new Error('handoff does not use the locked technical routing version');
  if (handoff.intendedReceiver?.threadId !== '01a08217-1de3-7312-b534-08cb04191458') throw new Error('handoff receiver is not the canonical Iris Universal Refresh task');
  if (!String(handoff.intendedUse || '').includes('technical layer')) throw new Error('handoff intended use is not the Universal Refresh technical layer');
  const forbidden = ['Drive', 'Instagram', 'Threads', 'social'];
  if (!forbidden.every((word) => JSON.stringify(handoff.excludedRoutes || []).includes(word))) throw new Error('handoff does not preserve all excluded routes');
  await Promise.all([
    verifyFile(handoff.technicalManifest, 'technicalManifest'),
    verifyFile(handoff.sourceLedger, 'sourceLedger'),
    verifyFile(handoff.automatedAudit, 'automatedAudit'),
    verifyFile(handoff.originalResolutionVisualQa, 'originalResolutionVisualQa'),
    verifyFile(handoff.sheetFriendlyIndex, 'sheetFriendlyIndex')
  ]);
  if (handoff.automatedAudit.status !== 'PASS' || handoff.originalResolutionVisualQa.status !== 'PASS') throw new Error('handoff QA is not PASS');
  const manifest = (await readJson(handoff.technicalManifest.path)).value;
  const assets = new Map(manifest.assets.map((asset) => [String(asset.ticker).toUpperCase(), asset]));
  const expectedManifestOrder = handoff.canonicalOrder.map((ticker) => String(ticker).toUpperCase());
  if (JSON.stringify([...assets.keys()]) !== JSON.stringify(expectedManifestOrder)) throw new Error('manifest order does not match handoff canonicalOrder');
  if (assets.size !== handoff.assetCount) throw new Error('manifest asset count does not match handoff');
  const expectedRoster = roster.order.map((ticker) => String(ticker).toUpperCase());
  for (const lane of ['dailyPackets', 'weeklyPackets']) {
    const actual = base[lane].map((packet) => String(packet.ticker).toUpperCase());
    if (JSON.stringify(actual) !== JSON.stringify(expectedRoster)) throw new Error(`${lane} does not match current production roster order`);
  }
  for (const asset of assets.values()) {
    if (asset.as_of !== handoff.completedSessionDate || asset.completed_bar?.date !== handoff.completedSessionDate) throw new Error(`${asset.ticker} is not fresh through ${handoff.completedSessionDate}`);
    await verifyFile({ path: asset.source, sha256: asset.source_sha256 }, `${asset.ticker} source`);
    await verifyFile({ path: asset.path, sha256: asset.sha256 }, `${asset.ticker} image`);
    const basePacket = base.dailyPackets.find((packet) => String(packet.ticker).toUpperCase() === String(asset.ticker).toUpperCase());
    const expectedClose = Number(basePacket?.priceSnapshot?.value);
    if (!Number.isFinite(expectedClose) || Math.abs(expectedClose - Number(asset.completed_bar.close)) > Math.max(0.011, Math.abs(expectedClose) * 0.000001)) throw new Error(`${asset.ticker} completed close does not match base packet`);
  }
  const batchId = options.batchId || `COVERAGE-${cleanDate(handoff.analysisDate)}-TECHNICAL-RECONCILIATION-${options.revision}`;
  const context = { batchId, revision: options.revision, handoff, handoffPath: options.handoff, handoffHash: handoffFile.hash };
  const optionalArtifacts = [];
  for (const [label, file] of [['Routing correction', options.routingCorrection], ['Technical routing lock', options.routingLock]]) {
    if (!file) continue;
    const contents = await fs.readFile(file);
    optionalArtifacts.push({ label, path: file, sha256: sha256(contents) });
  }
  const output = {
    ...structuredClone(base),
    batchId,
    packageId: batchId,
    createdAt: new Date().toISOString(),
    status: 'approved-technical-reconciliation',
    correctionScope: 'technical-content',
    supersedesBatchId: base.batchId,
    inputArtifacts: [
      ...(Array.isArray(base.inputArtifacts) ? base.inputArtifacts : []),
      { label: 'Iris Universal Refresh technical handoff', path: options.handoff, sha256: handoffFile.hash },
      { label: 'Technical manifest', path: handoff.technicalManifest.path, sha256: handoff.technicalManifest.sha256 },
      ...optionalArtifacts
    ],
    dailyPackets: base.dailyPackets.map((packet) => updateDailyPacket(packet, assets.get(String(packet.ticker).toUpperCase()), context)),
    weeklyPackets: base.weeklyPackets.map((packet) => updateWeeklyPacket(packet, context, assets.has(String(packet.ticker).toUpperCase()))),
    disclosures: [
      ...(Array.isArray(base.disclosures) ? base.disclosures : []),
      '本批次只校正 14 檔日線技術層；AVGO、MU 與全部週線分析維持原值。',
      '本批次不授權 Joanne、Clara、Google Drive、Instagram、Threads 或任何社群操作。'
    ]
  };
  const outputText = `${JSON.stringify(output, null, 2)}\n`;
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, outputText, 'utf8');
  const qa = {
    status: 'PASS',
    batchId,
    baseBatchId: base.batchId,
    packetSha256: sha256(outputText),
    handoffSha256: handoffFile.hash,
    technicalManifestSha256: handoff.technicalManifest.sha256,
    productionRoster: expectedRoster,
    technicalTickers: expectedManifestOrder,
    preservedDailyTickers: expectedRoster.filter((ticker) => !assets.has(ticker)),
    dailyPackets: output.dailyPackets.length,
    weeklyPackets: output.weeklyPackets.length,
    excludedRoutes: handoff.excludedRoutes
  };
  if (options.qaOutput) {
    await fs.mkdir(path.dirname(options.qaOutput), { recursive: true });
    await fs.writeFile(options.qaOutput, `${JSON.stringify(qa, null, 2)}\n`, 'utf8');
  }
  return qa;
}

build(parseArgs(process.argv.slice(2))).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
  console.error(JSON.stringify({ status: 'FAILED_GATE', reason: error.message }, null, 2));
  process.exitCode = 1;
});
