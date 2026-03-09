/**
 * PayU Redirect Hook Routes
 * POST /hooks/payu/success   — PayU redirects here on successful payment
 * POST /hooks/payu/failure   — PayU redirects here on payment failure
 * POST /hooks/payu/cancel    — PayU redirects here when user cancels
 *
 * PayU sends a POST form body, NOT JSON.
 * Use express urlencoded middleware (already enabled in Medusa).
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { verifyResponseHash } from '../../../providers/payu/hash';
import type { PayUPaymentResponse } from '../../../providers/payu/types';

const MERCHANT_KEY = process.env.PAYU_MERCHANT_KEY ?? '';
const MERCHANT_SALT = process.env.PAYU_MERCHANT_SALT ?? '';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const MEDUSA_URL = process.env.BACKEND_URL ?? 'http://localhost:9000';
const MEDUSA_PUB_KEY = process.env.MEDUSA_PUBLISHABLE_KEY ?? '';

// ── Shared hash verifier ─────────────────────────────────────────────────────

function verifyPayUHash(body: PayUPaymentResponse): boolean {
  return verifyResponseHash(
    {
      salt: MERCHANT_SALT,
      status: body.status,
      udf5: body.udf5, udf4: body.udf4, udf3: body.udf3,
      udf2: body.udf2, udf1: body.udf1,
      email: body.email,
      firstname: body.firstname,
      productinfo: body.productinfo,
      amount: body.amount,
      txnid: body.txnid,
      key: body.key,
    },
    body.hash,
  );
}

// ── Success redirect ─────────────────────────────────────────────────────────

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
  const route = req.path; // /hooks/payu/success | /hooks/payu/failure

  const body = req.body as PayUPaymentResponse;

  // Always verify hash on EVERY callback — security critical
  if (!verifyPayUHash(body)) {
    logger.error(`[PayU hook ${route}] Invalid hash — possible tampering. txnid=${body.txnid}`);
    return res.redirect(`${FRONTEND_URL}/checkout?error=invalid_signature`);
  }

  const cartId = body.udf1 ?? '';
  logger.info(`[PayU hook ${route}] txnid=${body.txnid} mihpayid=${body.mihpayid} status=${body.status} cart=${cartId}`);

  if (body.status === 'success') {
    // ── Complete the Medusa cart ────────────────────────────────────────────
    try {
      const completeRes = await fetch(`${MEDUSA_URL}/store/carts/${cartId}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-publishable-api-key': MEDUSA_PUB_KEY,
        },
      });

      const data = await completeRes.json();

      if (data?.type === 'order') {
        const orderId = data.order?.id;
        const displayId = data.order?.display_id;
        logger.info(`[PayU] Order created: ${displayId} (${orderId})`);
        return res.redirect(
          `${FRONTEND_URL}/order/confirmed?` +
          `order_id=${encodeURIComponent(orderId)}&` +
          `display_id=${encodeURIComponent(displayId)}&` +
          `txnid=${encodeURIComponent(body.txnid)}`,
        );
      }

      logger.warn(`[PayU] Cart complete returned non-order: ${JSON.stringify(data)}`);
      return res.redirect(`${FRONTEND_URL}/order/confirmed?txnid=${body.txnid}&status=success`);
    } catch (err: any) {
      logger.error(`[PayU] Cart complete failed: ${err.message}`);
      // Payment succeeded but order creation failed — redirect to a recovery page
      return res.redirect(
        `${FRONTEND_URL}/order/recovery?txnid=${body.txnid}&cart_id=${cartId}`,
      );
    }
  }

  if (body.status === 'pending') {
    return res.redirect(
      `${FRONTEND_URL}/checkout?pending=1&txnid=${encodeURIComponent(body.txnid)}`,
    );
  }

  // failure / cancelled
  const errMsg = encodeURIComponent(body.error_Message ?? 'Payment failed');
  return res.redirect(`${FRONTEND_URL}/checkout?error=${errMsg}&txnid=${body.txnid}`);
}
