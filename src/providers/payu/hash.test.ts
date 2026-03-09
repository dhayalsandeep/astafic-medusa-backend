/**
 * PayU Hash Utility — Unit Tests
 * File: src/providers/payu/hash.test.ts
 *
 * Run: npx jest src/providers/payu/hash.test.ts
 *
 * Uses PayU's official test credentials:
 *   key:  gtKFFx
 *   salt: eCwWELxi
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateRequestHash,
  verifyResponseHash,
  generateVerifyHash,
  generateRefundHash,
  generateTxnId,
  formatAmountForPayU,
} from './hash';
import crypto from 'crypto';

const TEST_KEY = 'gtKFFx';
const TEST_SALT = 'eCwWELxi';

// ─────────────────────────────────────────────────────────────────────────────

describe('generateRequestHash', () => {
  it('should produce a 128-char hex SHA512 string', () => {
    const hash = generateRequestHash({
      key: TEST_KEY,
      txnid: 'txn123',
      amount: '100.00',
      productinfo: 'TestProduct',
      firstname: 'Rohan',
      email: 'rohan@test.com',
      salt: TEST_SALT,
    });
    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('should be deterministic for the same inputs', () => {
    const input = {
      key: TEST_KEY,
      txnid: 'txn_abc',
      amount: '1500.00',
      productinfo: 'Marble',
      firstname: 'Rohan',
      email: 'rohan@test.com',
      udf1: 'cart_01',
      salt: TEST_SALT,
    };
    expect(generateRequestHash(input)).toBe(generateRequestHash(input));
  });

  it('should change when any field changes', () => {
    const base = {
      key: TEST_KEY, txnid: 'txn', amount: '100.00',
      productinfo: 'P', firstname: 'F', email: 'e@e.com', salt: TEST_SALT,
    };
    const h1 = generateRequestHash(base);
    const h2 = generateRequestHash({ ...base, amount: '200.00' });
    expect(h1).not.toBe(h2);
  });

  it('should match a manually computed SHA512', () => {
    const txnid = 'txntest1';
    const amount = '500.00';
    // Request: key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|<5 empty>|salt
    const reqParts = [
      TEST_KEY, txnid, amount, 'Product', 'John', 'john@test.com',
      '', '', '', '', '',   // udf1-5 (empty)
      '', '', '', '', '',   // udf6–udf10 trailing empties (reserved)
      TEST_SALT,
    ];
    const expected = crypto.createHash('sha512').update(reqParts.join('|')).digest('hex');

    const result = generateRequestHash({
      key: TEST_KEY, txnid, amount,
      productinfo: 'Product', firstname: 'John',
      email: 'john@test.com', salt: TEST_SALT,
    });
    expect(result).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('verifyResponseHash', () => {
  it('should return true for a valid response hash', () => {
    const status = 'success';
    // Matches exactly what verifyResponseHash computes:
    // salt|status|<9 empty fields>|<5 empty udfs>|email|firstname|productinfo|amount|txnid|key
    const parts = [
      TEST_SALT, status,
      // 9 empty field slots (field9..field1)
      '', '', '', '', '', '', '', '', '',
      // 5 empty udf slots (udf5..udf1)
      '', '', '', '', '',
      // actual fields
      'john@test.com', 'John', 'Product', '500.00', 'txntest2', TEST_KEY,
    ];
    const hashStr = parts.join('|');
    const validHash = crypto.createHash('sha512').update(hashStr).digest('hex');

    const result = verifyResponseHash(
      {
        salt: TEST_SALT,
        status,
        email: 'john@test.com',
        firstname: 'John',
        productinfo: 'Product',
        amount: '500.00',
        txnid: 'txntest2',
        key: TEST_KEY,
      },
      validHash,
    );
    expect(result).toBe(true);
  });

  it('should return false for a tampered hash', () => {
    const result = verifyResponseHash(
      {
        salt: TEST_SALT, status: 'success',
        email: 'john@test.com', firstname: 'John',
        productinfo: 'Product', amount: '500.00',
        txnid: 'txntest3', key: TEST_KEY,
      },
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(result).toBe(false);
  });

  it('should return false if hash is empty', () => {
    const result = verifyResponseHash(
      { salt: TEST_SALT, status: 'success', email: 'a@b.com', firstname: 'A', productinfo: 'P', amount: '100.00', txnid: 'x', key: TEST_KEY },
      '',
    );
    expect(result).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('generateVerifyHash', () => {
  it('should produce SHA512(key|command|var1|salt)', () => {
    const expected = crypto
      .createHash('sha512')
      .update(`${TEST_KEY}|verify_payment|txn1|${TEST_SALT}`)
      .digest('hex');
    expect(generateVerifyHash(TEST_KEY, 'verify_payment', 'txn1', TEST_SALT)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('generateRefundHash', () => {
  it('should produce SHA512(key|cancel_refund_transaction|var1|salt)', () => {
    const expected = crypto
      .createHash('sha512')
      .update(`${TEST_KEY}|cancel_refund_transaction|mihpay123|${TEST_SALT}`)
      .digest('hex');
    expect(generateRefundHash(TEST_KEY, 'mihpay123', TEST_SALT)).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('generateTxnId', () => {
  it('should be max 25 characters', () => {
    const txnid = generateTxnId('ast');
    expect(txnid.length).toBeLessThanOrEqual(25);
  });

  it('should start with the prefix', () => {
    expect(generateTxnId('ast')).toMatch(/^ast_/);
  });

  it('should be unique on each call', () => {
    const a = generateTxnId();
    const b = generateTxnId();
    expect(a).not.toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('formatAmountForPayU', () => {
  it('converts paise to rupees with 2 decimals', () => {
    expect(formatAmountForPayU(150000)).toBe('1500.00');
    expect(formatAmountForPayU(50)).toBe('0.50');
    expect(formatAmountForPayU(100)).toBe('1.00');
  });
});
