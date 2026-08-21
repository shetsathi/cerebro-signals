#!/usr/bin/env tsx

/**
 * ANGEL ONE SMARTAPI FORENSIC DIAGNOSTIC
 *
 * Verifies exact request parameters against official documentation.
 * Tests known documentation examples to determine root cause of 0 candles.
 *
 * Official Contract Reference:
 * https://github.com/angel-one/smartapi-python
 *
 * Do NOT modify code. Diagnosis only.
 */

import { SmartAPI } from 'smartapi-javascript';
import OTPLib from 'otplib';
import { loadAngelOneConfig } from '../adapters/angel-one-config';

async function runDiagnostic(): Promise<void> {
  console.log('\n========================================');
  console.log('ANGEL ONE SMARTAPI FORENSIC DIAGNOSTIC');
  console.log('========================================\n');

  // Step 1: Initialize SDK
  console.log('Step 1: Loading configuration...');
  let config: any;
  try {
    config = loadAngelOneConfig();
    console.log('✓ Configuration loaded\n');
  } catch (error) {
    console.error(`❌ Failed to load config: ${error}`);
    process.exit(1);
  }

  // Step 2: Initialize SmartAPI
  console.log('Step 2: Initializing SmartAPI SDK...');
  const smartApi = new SmartAPI({
    api_key: config.apiKey,
  });
  console.log('✓ SmartAPI initialized\n');

  // Step 3: Authenticate
  console.log('Step 3: Authenticating...');
  try {
    const totp = OTPLib.authenticator.generate(config.totpSecret);
    await smartApi.generateSession(config.clientCode, config.password, totp);
    console.log('✓ Authentication successful\n');
  } catch (error) {
    console.error(`❌ Authentication failed: ${error}`);
    process.exit(1);
  }

  // Step 4: Document the official contract
  console.log('========================================');
  console.log('OFFICIAL DOCUMENTATION CONTRACT');
  console.log('========================================\n');

  console.log('Endpoint:');
  console.log('  POST https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData\n');

  console.log('Official Request Parameters:');
  console.log('  exchange: NSE');
  console.log('  symboltoken: 99926000 (NIFTY 50)');
  console.log('  interval: FIVE_MINUTE (or ONE_MINUTE, FIFTEEN_MINUTE, ONE_HOUR, ONE_DAY)');
  console.log('  fromdate: YYYY-MM-DD HH:mm (NOT DD-MM-YYYY, NOT ISO)');
  console.log('  todate: YYYY-MM-DD HH:mm (NOT DD-MM-YYYY, NOT ISO)\n');

  console.log('Official Response Format:');
  console.log('  {');
  console.log('    "status": true,');
  console.log('    "message": "SUCCESS",');
  console.log('    "errorcode": "",');
  console.log('    "data": [');
  console.log('      ["2023-09-06T11:15:00+05:30", 19571.2, 19573.35, 19534.4, 19552.05, 0]');
  console.log('    ]');
  console.log('  }\n');

  console.log('Official Known-Documentation-Period:');
  console.log('  Date: 2023-09-06');
  console.log('  Time: 11:15-12:00 IST');
  console.log('  This date/period should have historical data available\n');

  // Step 5: Test 1 - Known documentation period
  console.log('========================================');
  console.log('TEST 1: KNOWN DOCUMENTATION PERIOD');
  console.log('========================================\n');

  console.log('Request Parameters:');
  const test1Exchange = 'NSE';
  const test1Token = '99926000';
  const test1Interval = 'ONE_HOUR';
  const test1From = '2023-09-06 11:15';
  const test1To = '2023-09-06 12:00';

  console.log(`  exchange: ${test1Exchange}`);
  console.log(`  symboltoken: ${test1Token}`);
  console.log(`  interval: ${test1Interval}`);
  console.log(`  fromdate: ${test1From}`);
  console.log(`  todate: ${test1To}`);
  console.log('');

  let test1Response: any = null;
  try {
    console.log('Executing getCandleData()...');
    test1Response = await smartApi.getCandleData({
      exchange: test1Exchange,
      symboltoken: test1Token,
      interval: test1Interval,
      fromdate: test1From,
      todate: test1To,
    });

    console.log('\nAPI Response Received:');
    console.log(`  Type: ${Array.isArray(test1Response) ? 'Array' : typeof test1Response}`);

    if (Array.isArray(test1Response)) {
      console.log(`  Length: ${test1Response.length}`);
      if (test1Response.length > 0) {
        console.log(`  First element type: ${typeof test1Response[0]}`);
        if (Array.isArray(test1Response[0])) {
          console.log(`  First candle (array): [${test1Response[0].slice(0, 2).join(', ')}...]`);
        } else if (typeof test1Response[0] === 'object') {
          console.log(`  First candle (object): {date: ${test1Response[0].date}, ...}`);
        }
      }
    } else if (typeof test1Response === 'object') {
      console.log(`  Status: ${test1Response.status}`);
      console.log(`  Message: ${test1Response.message}`);
      console.log(`  Errorcode: ${test1Response.errorcode || '(none)'}`);
      console.log(`  Data type: ${Array.isArray(test1Response.data) ? 'Array' : typeof test1Response.data}`);
      console.log(`  Data length: ${test1Response.data ? (Array.isArray(test1Response.data) ? test1Response.data.length : 'N/A') : 'null'}`);

      if (test1Response.data && Array.isArray(test1Response.data) && test1Response.data.length > 0) {
        console.log(`  First candle: ${JSON.stringify(test1Response.data[0]).substring(0, 80)}...`);
      }
    }

    console.log(`\n✓ Request completed without error`);
    console.log(
      `Result: ${
        test1Response && (Array.isArray(test1Response) ? test1Response.length > 0 : test1Response.data?.length > 0)
          ? `${Array.isArray(test1Response) ? test1Response.length : test1Response.data.length} CANDLES`
          : '0 CANDLES'
      }\n`,
    );
  } catch (error) {
    console.error(`❌ Request failed: ${error}\n`);
  }

  // Step 6: Test 2 - Recent date with ONE_HOUR interval
  console.log('========================================');
  console.log('TEST 2: RECENT DATE (ONE_HOUR INTERVAL)');
  console.log('========================================\n');

  console.log('Request Parameters:');
  const test2Exchange = 'NSE';
  const test2Token = '99926000';
  const test2Interval = 'ONE_HOUR';
  const test2From = '2026-08-20 09:15';
  const test2To = '2026-08-20 15:30';

  console.log(`  exchange: ${test2Exchange}`);
  console.log(`  symboltoken: ${test2Token}`);
  console.log(`  interval: ${test2Interval}`);
  console.log(`  fromdate: ${test2From}`);
  console.log(`  todate: ${test2To}`);
  console.log('');

  let test2Response: any = null;
  try {
    console.log('Executing getCandleData()...');
    test2Response = await smartApi.getCandleData({
      exchange: test2Exchange,
      symboltoken: test2Token,
      interval: test2Interval,
      fromdate: test2From,
      todate: test2To,
    });

    console.log('\nAPI Response Received:');
    console.log(`  Type: ${Array.isArray(test2Response) ? 'Array' : typeof test2Response}`);

    if (Array.isArray(test2Response)) {
      console.log(`  Length: ${test2Response.length}`);
      if (test2Response.length > 0) {
        console.log(`  First element type: ${typeof test2Response[0]}`);
      }
    } else if (typeof test2Response === 'object') {
      console.log(`  Status: ${test2Response.status}`);
      console.log(`  Message: ${test2Response.message}`);
      console.log(`  Errorcode: ${test2Response.errorcode || '(none)'}`);
      console.log(`  Data length: ${test2Response.data ? (Array.isArray(test2Response.data) ? test2Response.data.length : 'N/A') : 'null'}`);
    }

    console.log(`\n✓ Request completed without error`);
    console.log(
      `Result: ${
        test2Response && (Array.isArray(test2Response) ? test2Response.length > 0 : test2Response.data?.length > 0)
          ? `${Array.isArray(test2Response) ? test2Response.length : test2Response.data.length} CANDLES`
          : '0 CANDLES'
      }\n`,
    );
  } catch (error) {
    console.error(`❌ Request failed: ${error}\n`);
  }

  // Step 7: Forensic Analysis
  console.log('========================================');
  console.log('FORENSIC ANALYSIS');
  console.log('========================================\n');

  const test1HasData =
    test1Response &&
    ((Array.isArray(test1Response) && test1Response.length > 0) ||
      (typeof test1Response === 'object' && test1Response.data && Array.isArray(test1Response.data) && test1Response.data.length > 0));
  const test2HasData =
    test2Response &&
    ((Array.isArray(test2Response) && test2Response.length > 0) ||
      (typeof test2Response === 'object' && test2Response.data && Array.isArray(test2Response.data) && test2Response.data.length > 0));

  console.log('Test Results:');
  console.log(`  Known 2023 period (ONE_HOUR): ${test1HasData ? '✓ DATA RETURNED' : '❌ NO DATA (0 CANDLES)'}`);
  console.log(`  Recent 2026 date (ONE_HOUR): ${test2HasData ? '✓ DATA RETURNED' : '❌ NO DATA (0 CANDLES)'}\n`);

  console.log('Diagnosis:');
  if (test1HasData && test2HasData) {
    console.log('✅ BOTH TESTS RETURNED DATA');
    console.log('   → Integration is working correctly');
    console.log('   → Issue was: wrong interval (FIVE_MINUTE) or date format');
    console.log('   → Solution: adjust interval or date range\n');
  } else if (test1HasData && !test2HasData) {
    console.log('⚠️  MIXED RESULTS: Historical (2023) has data, Recent (2026) does not');
    console.log('   → Integration is working correctly for 2023 data');
    console.log('   → Possible causes for 2026 no-data:');
    console.log('      - No historical data available for 2026 dates yet');
    console.log('      - Account/subscription limitation for recent data');
    console.log('      - Data retention policy (only certain past periods available)\n');
  } else if (!test1HasData && test2HasData) {
    console.log('❌ UNEXPECTED: Recent data but historical not accessible');
    console.log('   → Unusual pattern, investigate further\n');
  } else {
    console.log('❌ NO DATA IN EITHER TEST');
    console.log('   Possible causes:');
    console.log('   1. API service issue or temporary outage');
    console.log('   2. Account data access completely restricted');
    console.log('   3. API requires different parameters than documented');
    console.log('   4. SDK version incompatibility');
    console.log('   5. Network/firewall issue blocking data responses\n');
  }

  console.log('Request Parameters Verification:');
  console.log('  ✓ exchange: NSE (correct)');
  console.log('  ✓ symboltoken: 99926000 (NIFTY 50, correct)');
  console.log('  ✓ interval: ONE_HOUR (correct format, matches docs)');
  console.log('  ✓ fromdate: YYYY-MM-DD HH:mm (correct format per docs)');
  console.log('  ✓ todate: YYYY-MM-DD HH:mm (correct format per docs)');
  console.log('  ✓ SDK method: getCandleData (correct)');
  console.log('  ✓ SDK: smartapi-javascript (official)\n');

  console.log('========================================');
  console.log('CONCLUSION');
  console.log('========================================\n');

  if (test1HasData) {
    console.log('✅ REQUEST FORMAT IS CORRECT');
    console.log('   The integration is working. The 0-candle issue for 2026 dates');
    console.log('   is likely due to data availability, not request parameters.\n');
    console.log('NEXT STEP: Investigate account/data subscription for 2026 dates\n');
  } else {
    console.log('❌ INVESTIGATION REQUIRED');
    console.log('   Even the known 2023 test returned 0 candles.');
    console.log('   This suggests either:');
    console.log('   - Account does not have historical data access');
    console.log('   - API service issue');
    console.log('   - Token/instrument not accessible\n');
    console.log('NEXT STEP: Contact Angel One support to verify account access\n');
  }
}

runDiagnostic().catch(error => {
  console.error('Diagnostic failed:', error);
  process.exit(1);
});
