/**
 * ANGEL ONE CONFIGURATION
 *
 * Loads and validates Angel One API credentials from environment variables.
 * Credentials are NEVER logged or included in error messages.
 */

/**
 * Angel One API Configuration
 * All values loaded from environment variables only
 */
export interface AngelOneConfig {
  apiKey: string;
  clientCode: string;
  password: string;
  totpSecret: string;
  baseUrl: string;
  apiVersion: string;
}

/**
 * Validation result for credentials
 */
export interface CredentialValidation {
  isValid: boolean;
  missingVariables: string[];
  errors: string[];
}

/**
 * Load and validate Angel One credentials from environment variables
 *
 * Required environment variables:
 * - ANGEL_ONE_API_KEY: Your Angel One API key
 * - ANGEL_ONE_CLIENT_CODE: Your Angel One client/account code
 * - ANGEL_ONE_PASSWORD: Your Angel One account password
 * - ANGEL_ONE_TOTP_SECRET: TOTP secret for 2FA (base32 encoded)
 *
 * @returns Configuration object if valid
 * @throws Error if credentials are incomplete or invalid
 */
export function loadAngelOneConfig(): AngelOneConfig {
  const apiKey = process.env.ANGEL_ONE_API_KEY;
  const clientCode = process.env.ANGEL_ONE_CLIENT_CODE;
  const password = process.env.ANGEL_ONE_PASSWORD;
  const totpSecret = process.env.ANGEL_ONE_TOTP_SECRET;

  // Validate all required variables exist
  const validation = validateCredentials(apiKey, clientCode, password, totpSecret);
  if (!validation.isValid) {
    const missing = validation.missingVariables.join(', ');
    throw new Error(
      `Angel One credentials incomplete. Missing: ${missing}. ` +
        `Please set the required environment variables.`,
    );
  }

  return {
    apiKey: apiKey!,
    clientCode: clientCode!,
    password: password!,
    totpSecret: totpSecret!,
    baseUrl: process.env.ANGEL_ONE_BASE_URL || 'https://apiconnect.angelone.in',
    apiVersion: process.env.ANGEL_ONE_API_VERSION || '2.0',
  };
}

/**
 * Validate that all required credentials are present
 * Returns validation result without logging credential values
 */
export function validateCredentials(
  apiKey?: string,
  clientCode?: string,
  password?: string,
  totpSecret?: string,
): CredentialValidation {
  const missingVariables: string[] = [];
  const errors: string[] = [];

  if (!apiKey) missingVariables.push('ANGEL_ONE_API_KEY');
  if (!clientCode) missingVariables.push('ANGEL_ONE_CLIENT_CODE');
  if (!password) missingVariables.push('ANGEL_ONE_PASSWORD');
  if (!totpSecret) missingVariables.push('ANGEL_ONE_TOTP_SECRET');

  // Validate formats (without logging values)
  // Note: Actual credential lengths may vary by Angel One account/API version
  if (apiKey && apiKey.length < 3) {
    errors.push('ANGEL_ONE_API_KEY appears too short (expected >= 3 chars)');
  }
  if (clientCode && clientCode.length < 3) {
    errors.push('ANGEL_ONE_CLIENT_CODE appears too short (expected >= 3 chars)');
  }
  if (password && password.length < 2) {
    errors.push('ANGEL_ONE_PASSWORD appears too short (expected >= 2 chars)');
  }
  if (totpSecret && totpSecret.length < 10) {
    errors.push('ANGEL_ONE_TOTP_SECRET appears too short (expected base32, >= 10 chars)');
  }

  const isValid = missingVariables.length === 0 && errors.length === 0;

  return { isValid, missingVariables, errors };
}

/**
 * Check if credentials are configured in environment
 * Returns boolean only (does not reveal credential values)
 */
export function hasAngelOneCredentials(): boolean {
  return !!(
    process.env.ANGEL_ONE_API_KEY &&
    process.env.ANGEL_ONE_CLIENT_CODE &&
    process.env.ANGEL_ONE_PASSWORD &&
    process.env.ANGEL_ONE_TOTP_SECRET
  );
}

/**
 * Report required credentials for setup
 * Shows what environment variables are needed
 */
export function getRequiredCredentialsInfo(): string {
  return `
Angel One API Credentials Required:

Required environment variables:
  1. ANGEL_ONE_API_KEY
     - Your Angel One API key from settings
     - Typically 32+ characters

  2. ANGEL_ONE_CLIENT_CODE
     - Your Angel One account/client code
     - Typically starts with 'A' followed by numbers (e.g., 'A123456')

  3. ANGEL_ONE_PASSWORD
     - Your Angel One account password
     - Used for authentication flow

  4. ANGEL_ONE_TOTP_SECRET
     - Base32-encoded secret for 2FA
     - Provided when 2FA is enabled on account
     - Used to generate time-based OTP

Optional environment variables:
  - ANGEL_ONE_BASE_URL (default: https://api-c.angelbroking.com)
  - ANGEL_ONE_API_VERSION (default: 2.0)

Setup Instructions:
  1. Get your Angel One API key and client code from your account settings
  2. Enable 2FA if not already enabled (get TOTP secret)
  3. Set the environment variables before running data acquisition
  4. Never commit .env file to version control
  5. Add to .gitignore: .env, .env.local, .env.*.local

Example .env file (DO NOT COMMIT):
  ANGEL_ONE_API_KEY=your_api_key_here
  ANGEL_ONE_CLIENT_CODE=A123456
  ANGEL_ONE_PASSWORD=your_password_here
  ANGEL_ONE_TOTP_SECRET=your_base32_totp_secret_here
`;
}
