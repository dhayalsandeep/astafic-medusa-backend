/**
 * Razorpay Payment Provider for MedusaJS v2
 *
 * File: src/modules/razorpay/provider.ts
 *
 * Implements all required AbstractPaymentProvider methods.
 * Handles INR payments, refunds, and captures via Razorpay API.
 */

import {
  AbstractPaymentProvider,
  PaymentProviderError,
  PaymentProviderSessionResponse,
} from '@medusajs/framework/utils';
import {
  CreatePaymentProviderSession,
  UpdatePaymentProviderSession,
  ProviderWebhookPayload,
  WebhookActionResult,
  PaymentSessionStatus,
} from '@medusajs/framework/types';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// ── Types ──────────────────────────────────────────────────────────────────────

interface RazorpayOptions {
  key_id: string;
  key_secret: string;
  webhook_secret: string;
}

interface RazorpayPaymentData {
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  status?: string;
  amount?: number;
  currency?: string;
  notes?: Record<string, string>;
}

// ── Provider Implementation ────────────────────────────────────────────────────

export class RazorpayPaymentProvider extends AbstractPaymentProvider<RazorpayOptions> {
  static identifier = 'razorpay';

  private razorpay: Razorpay;
  private webhookSecret: string;

  constructor(container: any, options: RazorpayOptions) {
    super(container, options);
    this.razorpay = new Razorpay({
      key_id: options.key_id,
      key_secret: options.key_secret,
    });
    this.webhookSecret = options.webhook_secret;
  }

  // ── 1. initiatePayment ────────────────────────────────────────────────────
  /**
   * Creates a Razorpay Order that the frontend will use to open the checkout
   * modal. Amount is converted from lowest currency unit (paise for INR).
   */
  async initiatePayment(
    input: CreatePaymentProviderSession,
  ): Promise<PaymentProviderSessionResponse> {
    const { amount, currency_code, context } = input;

    try {
      // Razorpay requires amount in paise (1 INR = 100 paise)
      const razorpayOrder = await this.razorpay.orders.create({
        amount: Math.round(amount), // already in paise from Medusa
        currency: currency_code.toUpperCase(),
        receipt: `medusa_${Date.now()}`,
        notes: {
          medusa_cart_id: context?.cart_id as string ?? '',
          customer_email: context?.customer?.email as string ?? '',
          customer_name:
            `${context?.customer?.first_name ?? ''} ${context?.customer?.last_name ?? ''}`.trim(),
        },
      });

      return {
        id: razorpayOrder.id,
        data: {
          razorpay_order_id: razorpayOrder.id,
          status: razorpayOrder.status,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          notes: razorpayOrder.notes,
        } as RazorpayPaymentData,
      };
    } catch (err: any) {
      return this.buildError('Failed to initiate Razorpay payment', err);
    }
  }

  // ── 2. authorizePayment ───────────────────────────────────────────────────
  /**
   * Verifies the Razorpay payment signature after the frontend completes the
   * checkout flow. This is the critical security step.
   */
  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<{ status: PaymentSessionStatus; data: Record<string, unknown> }> {
    const data = paymentSessionData as RazorpayPaymentData;

    // If no payment ID yet, payment not completed
    if (!data.razorpay_payment_id) {
      return { status: 'pending', data: paymentSessionData };
    }

    // Verify signature
    const isValid = this.verifySignature(
      data.razorpay_order_id,
      data.razorpay_payment_id,
      data.razorpay_signature ?? '',
    );

    if (!isValid) {
      return {
        status: 'error',
        data: { ...paymentSessionData, error: 'Invalid payment signature' },
      };
    }

    return {
      status: 'authorized',
      data: { ...paymentSessionData, status: 'authorized' },
    };
  }

  // ── 3. capturePayment ─────────────────────────────────────────────────────
  /**
   * Captures a previously authorized payment.
   * (For Razorpay, payment is captured automatically by default,
   *  but manual capture is supported for specific account settings.)
   */
  async capturePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as RazorpayPaymentData;
    const paymentId = data.razorpay_payment_id;

    if (!paymentId) {
      return this.buildError('capturePayment: Missing razorpay_payment_id', {});
    }

    try {
      const payment = await this.razorpay.payments.capture(
        paymentId,
        data.amount ?? 0,
        data.currency ?? 'INR',
      );
      return { ...paymentSessionData, status: 'captured', captured_at: payment.created_at };
    } catch (err: any) {
      // If already captured, treat as success
      if (err?.error?.code === 'BAD_REQUEST_ERROR') {
        return { ...paymentSessionData, status: 'captured' };
      }
      return this.buildError('capturePayment failed', err);
    }
  }

  // ── 4. refundPayment ──────────────────────────────────────────────────────
  /**
   * Initiates a full or partial refund via Razorpay.
   */
  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as RazorpayPaymentData;
    const paymentId = data.razorpay_payment_id;

    if (!paymentId) {
      return this.buildError('refundPayment: Missing razorpay_payment_id', {});
    }

    try {
      const refund = await this.razorpay.payments.refund(paymentId, {
        amount: Math.round(refundAmount),
        notes: { medusa_refund: 'true' },
      });
      return {
        ...paymentSessionData,
        refund_id: refund.id,
        refund_status: refund.status,
        refunded_amount: refund.amount,
      };
    } catch (err: any) {
      return this.buildError('refundPayment failed', err);
    }
  }

  // ── 5. cancelPayment ──────────────────────────────────────────────────────
  /**
   * Cancels the payment (refunds if captured, voids if only authorized).
   */
  async cancelPayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as RazorpayPaymentData;

    // If payment was already captured, refund the full amount
    if (data.razorpay_payment_id && data.status === 'captured') {
      return this.refundPayment(paymentSessionData, data.amount ?? 0);
    }

    // Otherwise just mark as cancelled locally (Razorpay orders auto-expire)
    return { ...paymentSessionData, status: 'cancelled' };
  }

  // ── 6. retrievePayment ────────────────────────────────────────────────────
  /**
   * Fetches the current state of a payment from Razorpay.
   */
  async retrievePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as RazorpayPaymentData;

    if (!data.razorpay_payment_id) {
      // No payment ID yet — fetch the order
      try {
        const order = await this.razorpay.orders.fetch(data.razorpay_order_id);
        return { ...paymentSessionData, order_status: order.status };
      } catch (err: any) {
        return this.buildError('retrievePayment: order fetch failed', err);
      }
    }

    try {
      const payment = await this.razorpay.payments.fetch(data.razorpay_payment_id);
      return { ...paymentSessionData, status: payment.status };
    } catch (err: any) {
      return this.buildError('retrievePayment failed', err);
    }
  }

  // ── 7. getPaymentStatus ───────────────────────────────────────────────────
  /**
   * Maps Razorpay's payment statuses to Medusa's PaymentSessionStatus enum.
   */
  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentSessionStatus> {
    const data = paymentSessionData as RazorpayPaymentData;
    const status = data.status;

    switch (status) {
      case 'authorized':
        return 'authorized';
      case 'captured':
        return 'captured';
      case 'cancelled':
        return 'canceled';
      case 'failed':
        return 'error';
      case 'created':
      case 'attempted':
        return 'pending';
      default:
        return 'pending';
    }
  }

  // ── 8. updatePayment ──────────────────────────────────────────────────────
  /**
   * Called when cart details change (e.g., address updated).
   * For Razorpay, we cancel the old order and create a new one.
   */
  async updatePayment(
    input: UpdatePaymentProviderSession,
  ): Promise<PaymentProviderSessionResponse> {
    // Re-initiate to get a fresh Razorpay order with the updated amount
    return this.initiatePayment(input);
  }

  // ── 9. deletePayment ──────────────────────────────────────────────────────
  async deletePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    return this.cancelPayment(paymentSessionData);
  }

  // ── 10. getWebhookActionAndData ───────────────────────────────────────────
  /**
   * Processes incoming Razorpay webhooks. Verifies signature and maps events
   * to Medusa webhook actions.
   */
  async getWebhookActionAndData(
    webhookPayload: ProviderWebhookPayload,
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = webhookPayload.payload;

    // Verify webhook signature
    const signature = headers['x-razorpay-signature'] as string;
    const body = typeof rawData === 'string' ? rawData : JSON.stringify(data);
    const expectedSig = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSig) {
      throw new Error('Invalid Razorpay webhook signature');
    }

    const event = (data as any).event as string;
    const paymentEntity = (data as any).payload?.payment?.entity;
    const refundEntity = (data as any).payload?.refund?.entity;

    switch (event) {
      case 'payment.captured':
        return {
          action: 'captured',
          data: {
            session_id: paymentEntity?.notes?.medusa_cart_id ?? '',
            amount: paymentEntity?.amount ?? 0,
          },
        };

      case 'payment.failed':
        return {
          action: 'failed',
          data: {
            session_id: paymentEntity?.notes?.medusa_cart_id ?? '',
            amount: paymentEntity?.amount ?? 0,
          },
        };

      case 'refund.created':
        return {
          action: 'captured', // Medusa processes refund as a captured state change
          data: {
            session_id: refundEntity?.notes?.medusa_cart_id ?? '',
            amount: refundEntity?.amount ?? 0,
          },
        };

      default:
        return { action: 'not_supported' };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private verifySignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto
      .createHmac('sha256', this.options.key_secret)
      .update(body)
      .digest('hex');
    return expected === signature;
  }

  private buildError(
    msg: string,
    err: any,
  ): PaymentProviderError {
    return {
      error: msg,
      code: err?.error?.code ?? 'RAZORPAY_ERROR',
      detail: err?.error?.description ?? err?.message ?? JSON.stringify(err),
    };
  }
}

export default RazorpayPaymentProvider;
