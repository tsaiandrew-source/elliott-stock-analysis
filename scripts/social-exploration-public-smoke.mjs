#!/usr/bin/env node
const base = (process.env.PUBLIC_BASE_URL || 'https://tsaiandrew-source.github.io/elliott-stock-analysis').replace(/\/$/, '');
const expectedDataThrough = process.env.EXPECTED_SOCIAL_DATA_THROUGH || '';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function read(route) {
  const response = await fetch(`${base}${route}${route.includes('?') ? '&' : '?'}refresh=${Date.now()}`, {
    cache:'no-store',
    signal:AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status}`);
  return response.text();
}

let lastError;
for (let attempt = 1; attempt <= 12; attempt += 1) {
  try {
    const [page, bundle, topbar] = await Promise.all([
      read('/social-exploration.html'),
      read('/data-model/social-exploration-data.js'),
      read('/shared-topbar.js')
    ]);
    for (const marker of ['<title>E+ Social Exploration</title>', '<h1>E+ Social Exploration</h1>', 'data-current="exploration"']) {
      if (!page.includes(marker)) throw new Error(`page marker missing: ${marker}`);
    }
    if (!topbar.includes("label:'Social Exploration'")) throw new Error('shared topbar third destination is missing');
    if (expectedDataThrough && !bundle.includes(`\"dataThrough\":\"${expectedDataThrough}\"`)) {
      throw new Error(`published dataThrough has not reached ${expectedDataThrough}`);
    }
    if (!bundle.includes('\"status\":\"PASS\"')) throw new Error('published dataset is not PASS');
    console.log(JSON.stringify({ status:'PASS', base, expectedDataThrough, attempt }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    if (attempt < 12) await delay(30_000);
  }
}

console.error(JSON.stringify({ status:'FAIL', base, expectedDataThrough, error:lastError?.message || 'unknown' }, null, 2));
process.exit(1);
