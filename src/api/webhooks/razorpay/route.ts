/**
 * Razorpay Webhook Handler
 * File: src/api/webhooks/razorpay/route.ts
 *
 * Receives Razorpay webhook events, verifies signature, and triggers Medusa
 * payment module hooks. Mount this at POST /webhooks/razorpay in Medusa.
 */

import type { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? '';

// ── Signature verification ──────────────────────────────────────────────────

function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[Razorpay webhook] RAZORPAY_WEBHOOK_SECRET is not set!');
    return false;
  }
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const signature = req.headers['x-razorpay-signature'] as string | undefined;

  if (!signature) {
    return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
  }

  // Medusa gives us the raw body as req.rawBody (Buffer or string)
  const rawBody =
    (req as any).rawBody instanceof Buffer
      ? (req as any).rawBody.toString('utf8')
      : JSON.stringify(req.body);

  if (!verifyWebhookSignature(rawBody, signature)) {
    console.error('[Razorpay webhook] Signature verification FAILED');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.body as RazorpayWebhookEvent;
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  logger.info(`[Razorpay webhook] Received event: ${event.event}`);

  try {
    switch (event.event) {
      // ── payment.captured ─────────────────────────────────────
      case 'payment.captured': {
        const payment = event.payload.payment!.entity;
        logger.info(`[Razorpay] Payment captured: ${payment.id} — ₹${payment.amount / 100}`);

        // Update order status in your DB or trigger a Medusa workflow here
        await handlePaymentCaptured(req, payment);
        break;
      }

      // ── payment.failed ───────────────────────────────────────
      case 'payment.failed': {
        const payment = event.payload.payment!.entity;
        logger.warn(`[Razorpay] Payment FAILED: ${payment.id} — ${payment.error_description}`);

        await handlePaymentFailed(req, payment);
        break;
      }

      // ── refund.created ───────────────────────────────────────
      case 'refund.created': {
        const refund = event.payload.refund!.entity;
        logger.info(`[Razorpay] Refund created: ${refund.id} — ₹${refund.amount / 100}`);

        await handleRefundCreated(req, refund);
        break;
      }

      // ── order.paid (all split transfers complete) ─────────────
      case 'order.paid': {
        const order = event.payload.order!.entity;
        logger.info(`[Razorpay] Order fully paid: ${order.id}`);
        break;
      }

      default:
        logger.info(`[Razorpay webhook] Unhandled event type: ${event.event}`);
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    logger.error(`[Razorpay webhook] Handler error: ${err.message}`);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

// ── Event sub-handlers ──────────────────────────────────────────────────────

async function handlePaymentCaptured(req: MedusaRequest, payment: RazorpayPaymentEntity) {
  // You can resolve Medusa services from the container:
  // const orderService = req.scope.resolve('orderModuleService');
  //
  // Typical flow: find the Medusa order via payment.notes.medusa_cart_id
  // and mark it as payment_captured.
  //
  // For Route payments: trigger multi-vendor settlement here.
  const cartId = payment.notes?.medusa_cart_id;
  if (cartId) {
    // TODO: Trigger your `complete-cart` workflow or order capture logic
    console.log(`[handlePaymentCaptured] Cart ${cartId} — payment ${payment.id} captured`);
  }
}

async function handlePaymentFailed(req: MedusaRequest, payment: RazorpayPaymentEntity) {
  const cartId = payment.notes?.medusa_cart_id;
  if (cartId) {
    console.warn(`[handlePaymentFailed] Cart ${cartId} — payment ${payment.id} failed`);
    // TODO: Mark the cart / payment session as failed in Medusa
  }
}

async function handleRefundCreated(req: MedusaRequest, refund: RazorpayRefundEntity) {
  console.log(`[handleRefundCreated] Refund ${refund.id} — ₹${refund.amount / 100} for payment ${refund.payment_id}`);
  // TODO: Update Medusa refund record status to "refunded"
}

// ── Webhook event types ──────────────────────────────────────────────────────

interface RazorpayPaymentEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
  method?: string;
  error_code?: string;
  error_description?: string;
  notes?: Record<string, string>;
}

interface RazorpayRefundEntity {
  id: string;
  payment_id: string;
  amount: number;
  status: string;
  notes?: Record<string, string>;
}

interface RazorpayOrderEntity {
  id: string;
  amount: number;
  amount_paid: number;
  status: string;
}

interface RazorpayWebhookEvent {
  event: string;
  payload: {
    payment?: { entity: RazorpayPaymentEntity };
    refund?: { entity: RazorpayRefundEntity };
    order?: { entity: RazorpayOrderEntity };
  };
  created_at: number;
  account_id?: string;
}
