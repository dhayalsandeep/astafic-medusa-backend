/**
 * PayU India — SHA512 Hash Utility
 * File: src/providers/payu/hash.ts
 *
 * PayU uses SHA512 for both request signing and response verification.
 *
 * REQUEST hash sequence:
 *   key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt
 *
 * RESPONSE hash sequence (REVERSED):
 *   salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 */

import crypto from 'crypto';

// ── Core hash function ────────────────────────────────────────────────────────

/**
 * Computes SHA512 hash of the input string and returns hex digest.
 */
function sha512(input: string): string {
  return crypto.createHash('sha512').update(input).digest('hex');
}

// ── Request Hash ──────────────────────────────────────────────────────────────

export interface RequestHashInput {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  salt: string;
}

/**
 * Generates the payment request hash.
 *
 * Formula: SHA512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
 *
 * @example
 * const hash = generateRequestHash({
 *   key: 'gtKFFx',
 *   txnid: 'txn_abc123',
 *   amount: '1500.00',
 *   productinfo: 'Marble Tiles',
 *   firstname: 'Rohan',
 *   email: 'rohan@example.com',
 *   udf1: 'cart_01...',
 *   salt: 'eCwWELxi',
 * });
 */
export function generateRequestHash(input: RequestHashInput): string {
  const {
    key, txnid, amount, productinfo, firstname, email,
    udf1 = '', udf2 = '', udf3 = '', udf4 = '', udf5 = '',
    salt,
  } = input;

  // Six empty pipes at the end are PayU's reserved udf6-udf10 placeholders
  const hashString = [
    key, txnid, amount, productinfo, firstname, email,
    udf1, udf2, udf3, udf4, udf5,
    '', '', '', '', '',  // udf6–udf10 (always empty)
    salt,
  ].join('|');

  return sha512(hashString);
}

// ── Response Hash Verification ────────────────────────────────────────────────

export interface ResponseHashInput {
  salt: string;
  status: string;
  udf5?: string;
  udf4?: string;
  udf3?: string;
  udf2?: string;
  udf1?: string;
  email: string;
  firstname: string;
  productinfo: string;
  amount: string;
  txnid: string;
  key: string;
}

/**
 * Verifies the hash returned by PayU on payment redirect/callback.
 *
 * PayU response hash sequence (REVERSE of request):
 * salt|status|field9|field8|field7|field6|field5|field4|field3|field2|field1|
 * udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 *
 * Note: field1–field9 are always empty strings in the standard integration.
 * Returns true if the received hash matches the computed hash.
 */
export function verifyResponseHash(
  input: ResponseHashInput,
  receivedHash: string,
): boolean {
  const {
    salt, status,
    udf5 = '', udf4 = '', udf3 = '', udf2 = '', udf1 = '',
    email, firstname, productinfo, amount, txnid, key,
  } = input;

  // PayU response hash: 9 empty fields (field9..field1) then 5 udfs
  const hashString = [
    salt, status,
    '', '', '', '', '', '', '', '', '',  // field9, field8, ... field1 (9 empties)
    udf5, udf4, udf3, udf2, udf1,
    email, firstname, productinfo, amount, txnid, key,
  ].join('|');

  const computed = sha512(hashString);
  return timingSafeCompare(computed, receivedHash);
}

// ── Verify API Hash ───────────────────────────────────────────────────────────

/**
 * Generates the hash for PayU's verify_payment API call.
 *
 * Formula: SHA512(key|command|var1|salt)
 */
export function generateVerifyHash(key: string, command: string, var1: string, salt: string): string {
  return sha512(`${key}|${command}|${var1}|${salt}`);
}

// ── Refund API Hash ───────────────────────────────────────────────────────────

/**
 * Generates the hash for PayU's cancel_refund_transaction API call.
 *
 * Formula: SHA512(key|command|var1|salt)
 * where var1 = mihpayid (PayU transaction ID)
 */
export function generateRefundHash(key: string, var1: string, salt: string): string {
  return sha512(`${key}|cancel_refund_transaction|${var1}|${salt}`);
}

// ── Transaction ID ────────────────────────────────────────────────────────────

/**
 * Generates a unique transaction ID for PayU.
 * Format: payu_<timestamp>_<8-char random hex>
 * Max 25 chars. PayU accepts alphanumerics, hyphen, and underscore.
 */
export function generateTxnId(prefix: string = 'ast'): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${ts}_${rand}`.slice(0, 25);
}

// ── Amount formatting ─────────────────────────────────────────────────────────

/**
 * Formats an INR amount (in rupees) to a 2-decimal string for PayU.
 * If the input is in paise (Medusa's default), convert first.
 */
export function formatAmountForPayU(amountInPaise: number): string {
  return (amountInPaise / 100).toFixed(2);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
