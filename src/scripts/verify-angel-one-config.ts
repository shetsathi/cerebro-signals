#!/usr/bin/env tsx

/**
 * VERIFY ANGEL ONE CONFIGURATION
 *
 * Checks that all required environment variables are set.
 * Does NOT make API calls or reveal credential values.
 * Safe to run to verify setup before data acquisition.
 */

import {
  hasAngelOneCredentials,
  validateCredentials,
  getRequiredCredentialsInfo
} from '../adapters/angel-one-config';

console.log('\n========================================');
console.log('ANGEL ONE CONFIGURATION VERIFICATION');
console.log('========================================\n');

// Check if any credentials are configured
const hasCredentials = hasAngelOneCredentials();

if (!hasCredentials) {
  console.log('❌ STATUS: No Angel One credentials configured\n');
  console.log(getRequiredCredentialsInfo());
  process.exit(1);
}

// Validate credential format
const validation = validateCredentials(
  process.env.ANGEL_ONE_API_KEY,
  process.env.ANGEL_ONE_CLIENT_CODE,
  process.env.ANGEL_ONE_PASSWORD,
  process.env.ANGEL_ONE_TOTP_SECRET,
);

console.log('✓ Configuration Check Results:\n');

if (validation.isValid) {
  console.log('✓ All required credentials are configured');
  console.log('  - ANGEL_ONE_API_KEY: ✓ Set');
  console.log('  - ANGEL_ONE_CLIENT_CODE: ✓ Set');
  console.log('  - ANGEL_ONE_PASSWORD: ✓ Set');
  console.log('  - ANGEL_ONE_TOTP_SECRET: ✓ Set');

  console.log('\n✓ STATUS: Configuration is complete and ready for data acquisition');
  console.log('\nNext steps:');
  console.log('  1. Run: npm run acquire-nifty-data');
  console.log('  2. Monitor: Data acquisition progress and results');
  console.log('  3. Review: Dataset manifest and validation report');

  process.exit(0);
} else {
  console.log('❌ Configuration issues found:\n');

  if (validation.missingVariables.length > 0) {
    console.log('Missing variables:');
    validation.missingVariables.forEach(v => {
      console.log(`  - ${v}`);
    });
  }

  if (validation.errors.length > 0) {
    console.log('\nValidation errors:');
    validation.errors.forEach(e => {
      console.log(`  - ${e}`);
    });
  }

  console.log('\n' + getRequiredCredentialsInfo());

  process.exit(1);
}
