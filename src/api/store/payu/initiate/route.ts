/**
 * PayU Initiate Route
 * POST /store/payu/initiate
 *
 * Generates txnid + SHA512 hash on the backend (key never exposed to frontend).
 * Returns the paymentUrl and formData the frontend needs to submit.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { generateRequestHash, generateTxnId, formatAmountForPayU } from '../../../../providers/payu/hash';
import type { PayUInitiateRequest, PayUInitiateResponse } from '../../../../providers/payu/types';

const MERCHANT_KEY = process.env.PAYU_MERCHANT_KEY ?? '';
const MERCHANT_SALT = process.env.PAYU_MERCHANT_SALT ?? '';
const MODE = (process.env.PAYU_MODE ?? 'test') as 'test' | 'production';
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:9000';

const PAYU_URL =
  MODE === 'production'
    ? 'https://secure.payu.in/_payment'
    : 'https://test.payu.in/_payment';

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as PayUInitiateRequest;

  // ── Validate required fields ─────────────────────────────────────────────
  const required: (keyof PayUInitiateRequest)[] = ['amount', 'productinfo', 'firstname', 'email', 'phone', 'cartId'];
  for (const field of required) {
    if (!body[field]) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  if (!MERCHANT_KEY || !MERCHANT_SALT) {
    return res.status(500).json({ error: 'PayU credentials not configured on server' });
  }

  // ── Build form data ──────────────────────────────────────────────────────
  const txnid = generateTxnId('ast');
  // body.amount is in INR rupees from the frontend; multiply by 100 for paise then format
  const amountStr = (typeof body.amount === 'number' && body.amount < 10000)
    ? body.amount.toFixed(2)                          // already in rupees
    : formatAmountForPayU(body.amount);               // in paise → rupees

  const hash = generateRequestHash({
    key: MERCHANT_KEY,
    txnid,
    amount: amountStr,
    productinfo: body.productinfo,
    firstname: body.firstname,
    email: body.email,
    udf1: body.cartId,
    udf2: body.udf2 ?? '',
    udf3: body.udf3 ?? '',
    salt: MERCHANT_SALT,
  });

  const formData = {
    key: MERCHANT_KEY,
    txnid,
    amount: amountStr,
    productinfo: body.productinfo,
    firstname: body.firstname,
    email: body.email,
    phone: body.phone,
    surl: `${BACKEND_URL}/hooks/payu/success`,
    furl: `${BACKEND_URL}/hooks/payu/failure`,
    curl: `${BACKEND_URL}/hooks/payu/cancel`,
    udf1: body.cartId,
    udf2: body.udf2 ?? '',
    udf3: body.udf3 ?? '',
    hash,
  };

  const response: PayUInitiateResponse = {
    paymentUrl: PAYU_URL,
    formData,
  };

  return res.status(200).json(response);
}
