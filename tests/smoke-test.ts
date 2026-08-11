/**
 * Smoke Test - Verify critical endpoints work
 * Run with: npx ts-node tests/smoke-test.ts
 */

import {
  buildLaunchSmokeTargets,
  extractFirstListingPathFromSitemap,
  type LaunchSmokeTarget,
} from '../src/lib/release/launch-smoke';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  passed: boolean;
  statusCode?: number;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function ensureBaseUrlReachable(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    await fetch(BASE_URL, { method: 'GET', signal: controller.signal });
  } catch (error) {
    console.log(`❌ Smoke precheck failed: cannot reach ${BASE_URL}`);
    console.log(
      'Start the app first (for example `npm run dev`) or set TEST_URL to a reachable deployment.'
    );
    console.log(
      `Reason: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverListingPathFromSitemap(): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${BASE_URL}/sitemap.xml`, {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return extractFirstListingPathFromSitemap(await response.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function recordMissingTarget(target: LaunchSmokeTarget): void {
  const reason = target.missingReason || 'Missing smoke target endpoint.';

  console.log(`❌ ${target.name}: ${reason}`);
  results.push({
    name: target.name,
    passed: false,
    error: reason,
    duration: 0,
  });
}

async function test(
  name: string,
  endpoint: string,
  method: LaunchSmokeTarget['method'] = 'GET',
  expectedStatus: LaunchSmokeTarget['expectedStatus'] = 200
): Promise<void> {
  const start = Date.now();
  try {
    const url = `${BASE_URL}${endpoint}`;
    const response = await fetch(url, { method });
    const duration = Date.now() - start;

    const passed = response.status === expectedStatus;

    if (passed) {
      console.log(`✅ ${name} (${duration}ms)`);
    } else {
      console.log(`❌ ${name}: Expected ${expectedStatus}, got ${response.status}`);
    }

    results.push({
      name,
      passed,
      statusCode: response.status,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`❌ ${name}: ${error}`);
    results.push({
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration,
    });
  }
}

async function runSmokeTests(): Promise<void> {
  console.log('\n🧪 Smoke Tests - Critical Endpoints\n');
  console.log(`Base URL: ${BASE_URL}\n`);

  await ensureBaseUrlReachable();
  const listingPath = await discoverListingPathFromSitemap();
  const targets = buildLaunchSmokeTargets({ listingPath });

  for (const target of targets) {
    if (!target.endpoint) {
      recordMissingTarget(target);
      continue;
    }

    await test(target.name, target.endpoint, target.method, target.expectedStatus);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SMOKE TEST SUMMARY\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  const avgTime = Math.round(totalTime / results.length);

  console.log(`Passed: ${passed}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log(`Avg Response Time: ${avgTime}ms`);
  console.log(`Total Time: ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.error || `Status ${r.statusCode}`}`);
      });
    process.exit(1);
  }

  console.log('\n✅ All smoke tests passed!\n');
}

// Run tests
runSmokeTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
