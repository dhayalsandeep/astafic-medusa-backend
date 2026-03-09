/**
 * PayU India — MedusaJS v2 Payment Provider
 * File: src/providers/payu/index.ts
 *
 * Integrates PayU India as a payment provider in MedusaJS v2.
 * Works alongside the existing Razorpay integration.
 *
 * PayU Flow:
 * 1. initiatePayment()  → generate txnid + hash
 * 2. Frontend submits HTML form to PayU URL
 * 3. PayU redirects to surl/furl on the backend
 * 4. authorizePayment() → verify response hash
 * 5. capturePayment()   → mark as captured
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
import axios from 'axios';
import {
  generateRequestHash,
  generateVerifyHash,
  generateRefundHash,
  generateTxnId,
  formatAmountForPayU,
  verifyResponseHash,
} from './hash';
import type {
  PayUOptions,
  PayUSessionData,
  PayUPaymentResponse,
  PayUVerifyResponse,
  PayURefundResponse,
} from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYU_TEST_URL = 'https://test.payu.in/_payment';
const PAYU_PROD_URL = 'https://secure.payu.in/_payment';
const PAYU_TEST_VERIFY_URL = 'https://test.payu.in/merchant/postservice.php?form=2';
const PAYU_PROD_VERIFY_URL = 'https://info.payu.in/merchant/postservice.php?form=2';

// ── Provider Class ────────────────────────────────────────────────────────────

export class PayUPaymentProvider extends AbstractPaymentProvider<PayUOptions> {
  static identifier = 'payu';

  private merchantKey: string;
  private merchantSalt: string;
  private isProduction: boolean;
  private paymentUrl: string;
  private verifyUrl: string;
  private backendUrl: string;
  private frontendUrl: string;

  constructor(container: any, options: PayUOptions) {
    super(container, options);
    this.merchantKey = options.merchantKey;
    this.merchantSalt = options.merchantSalt;
    this.isProduction = options.mode === 'production';
    this.paymentUrl = this.isProduction ? PAYU_PROD_URL : PAYU_TEST_URL;
    this.verifyUrl = this.isProduction ? PAYU_PROD_VERIFY_URL : PAYU_TEST_VERIFY_URL;
    this.backendUrl = process.env.BACKEND_URL ?? 'http://localhost:9000';
    this.frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  }

  // ── 1. initiatePayment ───────────────────────────────────────────────────
  /**
   * Creates a PayU payment session with a unique txnid and SHA512 hash.
   * Returns the formData the frontend needs to POST to PayU.
   */
  async initiatePayment(
    input: CreatePaymentProviderSession,
  ): Promise<PaymentProviderSessionResponse> {
    const { amount, currency_code, context } = input;

    if (currency_code.toUpperCase() !== 'INR') {
      return this.buildError('PayU India only supports INR payments', {});
    }

    const txnid = generateTxnId('ast');
    const amountStr = formatAmountForPayU(amount); // paise → "₹xxx.xx"
    const cartId = (context?.cart_id as string) ?? '';
    const firstname = (context?.customer?.first_name as string) ?? 'Customer';
    const email = (context?.customer?.email as string) ?? '';
    const productinfo = `Astafic Order ${cartId.slice(-8)}`;

    const hash = generateRequestHash({
      key: this.merchantKey,
      txnid,
      amount: amountStr,
      productinfo,
      firstname,
      email,
      udf1: cartId,
      salt: this.merchantSalt,
    });

    const sessionData: PayUSessionData = {
      txnid,
      amount: amountStr,
      cart_id: cartId,
    };

    return {
      id: txnid,
      data: {
        ...sessionData,
        // formData for the frontend to POST to PayU
        paymentUrl: this.paymentUrl,
        formData: {
          key: this.merchantKey,
          txnid,
          amount: amountStr,
          productinfo,
          firstname,
          email,
          surl: `${this.backendUrl}/hooks/payu/success`,
          furl: `${this.backendUrl}/hooks/payu/failure`,
          hash,
          udf1: cartId,
        },
      },
    };
  }

  // ── 2. authorizePayment ──────────────────────────────────────────────────
  /**
   * Verifies the PayU response hash after payment redirect.
   * Called with the POST data PayU sends to surl/furl.
   */
  async authorizePayment(
    paymentSessionData: Record<string, unknown>,
    context: Record<string, unknown>,
  ): Promise<{ status: PaymentSessionStatus; data: Record<string, unknown> }> {
    const response = context as unknown as PayUPaymentResponse;

    if (!response?.hash) {
      return { status: 'error', data: { ...paymentSessionData, error: 'Missing hash in PayU response' } };
    }

    // Verify response hash (reversed sequence)
    const isValid = verifyResponseHash(
      {
        salt: this.merchantSalt,
        status: response.status,
        udf5: response.udf5,
        udf4: response.udf4,
        udf3: response.udf3,
        udf2: response.udf2,
        udf1: response.udf1,
        email: response.email,
        firstname: response.firstname,
        productinfo: response.productinfo,
        amount: response.amount,
        txnid: response.txnid,
        key: response.key,
      },
      response.hash,
    );

    if (!isValid) {
      return {
        status: 'error',
        data: { ...paymentSessionData, error: 'Hash verification failed — possible tampered response' },
      };
    }

    const updatedData: PayUSessionData = {
      ...(paymentSessionData as PayUSessionData),
      payu_txn_id: response.mihpayid,
      status: response.status,
      mode: response.mode,
      bank_ref_num: response.bank_ref_num,
      error: response.error_Message,
    };

    if (response.status === 'success') {
      return { status: 'authorized', data: updatedData };
    } else if (response.status === 'pending') {
      return { status: 'pending', data: updatedData };
    } else {
      return { status: 'error', data: { ...updatedData, error: response.error_Message ?? 'Payment failed' } };
    }
  }

  // ── 3. capturePayment ────────────────────────────────────────────────────
  /**
   * PayU auto-captures on success. This marks the session as captured in Medusa.
   */
  async capturePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as PayUSessionData;

    if (!data.payu_txn_id) {
      return this.buildError('capturePayment: Missing payu_txn_id', {});
    }

    // Optionally verify the payment status via PayU API for extra safety
    try {
      const detail = await this.fetchPaymentDetail(data.txnid);
      if (detail && detail.status === 'success') {
        return { ...paymentSessionData, status: 'captured', captured: true };
      }
      return this.buildError(`capturePayment: PayU status is "${detail?.status ?? 'unknown'}"`, {});
    } catch {
      // If verify fails, trust the redirect response
      return { ...paymentSessionData, status: 'captured', captured: true };
    }
  }

  // ── 4. refundPayment ─────────────────────────────────────────────────────
  /**
   * Initiates a full or partial refund via PayU's cancel_refund_transaction API.
   */
  async refundPayment(
    paymentSessionData: Record<string, unknown>,
    refundAmount: number,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as PayUSessionData;

    if (!data.payu_txn_id) {
      return this.buildError('refundPayment: Missing payu_txn_id (mihpayid)', {});
    }

    const amountStr = formatAmountForPayU(refundAmount);
    const hash = generateRefundHash(this.merchantKey, data.payu_txn_id, this.merchantSalt);

    try {
      const params = new URLSearchParams({
        key: this.merchantKey,
        command: 'cancel_refund_transaction',
        var1: data.payu_txn_id,
        var2: amountStr,
        hash,
      });

      const res = await axios.post<PayURefundResponse>(this.verifyUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (res.data.status === 1) {
        return {
          ...paymentSessionData,
          refund_request_id: res.data.request_id,
          refunded_amount: amountStr,
          refund_status: 'pending',
        };
      }
      return this.buildError(`PayU refund failed: ${res.data.msg}`, res.data);
    } catch (err: any) {
      return this.buildError('refundPayment: API call failed', err);
    }
  }

  // ── 5. cancelPayment ─────────────────────────────────────────────────────
  /**
   * Cancels a pending PayU payment. If already captured, triggers a refund.
   */
  async cancelPayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as PayUSessionData;

    if (data.status === 'success' && data.payu_txn_id) {
      // Already captured — issue full refund
      return this.refundPayment(paymentSessionData, parseFloat(data.amount) * 100);
    }

    // Not yet completed — mark cancelled (PayU pending sessions expire automatically)
    return { ...paymentSessionData, status: 'cancelled' };
  }

  // ── 6. retrievePayment ───────────────────────────────────────────────────
  /**
   * Fetches the current payment status from PayU's verify_payment API.
   */
  async retrievePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    const data = paymentSessionData as PayUSessionData;

    try {
      const detail = await this.fetchPaymentDetail(data.txnid);
      if (!detail) return this.buildError('retrievePayment: no transaction found', {});

      return {
        ...paymentSessionData,
        status: detail.status,
        payu_txn_id: detail.mihpayid,
        mode: detail.mode,
        bank_ref_num: detail.bank_ref_num,
        error: detail.error_Message,
      };
    } catch (err: any) {
      return this.buildError('retrievePayment: API call failed', err);
    }
  }

  // ── 7. getPaymentStatus ──────────────────────────────────────────────────
  /**
   * Maps PayU status to MedusaJS PaymentSessionStatus.
   */
  async getPaymentStatus(
    paymentSessionData: Record<string, unknown>,
  ): Promise<PaymentSessionStatus> {
    const data = paymentSessionData as PayUSessionData;

    switch (data.status) {
      case 'success': return data.captured ? 'captured' : 'authorized';
      case 'pending': return 'pending';
      case 'failure': return 'error';
      case 'cancelled': return 'canceled';
      default: return 'pending';
    }
  }

  // ── 8. updatePayment ─────────────────────────────────────────────────────
  /**
   * Re-initiates with updated cart data (e.g., amount changed).
   */
  async updatePayment(
    input: UpdatePaymentProviderSession,
  ): Promise<PaymentProviderSessionResponse> {
    return this.initiatePayment(input);
  }

  // ── 9. deletePayment ─────────────────────────────────────────────────────
  async deletePayment(
    paymentSessionData: Record<string, unknown>,
  ): Promise<Record<string, unknown> | PaymentProviderError> {
    return this.cancelPayment(paymentSessionData);
  }

  // ── 10. getWebhookActionAndData ──────────────────────────────────────────
  /**
   * Processes PayU server-to-server (S2S) webhook callbacks.
   * Verifies hash before processing.
   */
  async getWebhookActionAndData(
    webhookPayload: ProviderWebhookPayload,
  ): Promise<WebhookActionResult> {
    const body = webhookPayload.payload.data as unknown as PayUPaymentResponse;

    if (!body?.hash) {
      throw new Error('PayU webhook: missing hash');
    }

    const isValid = verifyResponseHash(
      {
        salt: this.merchantSalt,
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

    if (!isValid) throw new Error('PayU webhook: invalid hash');

    const cartId = body.udf1 ?? '';

    switch (body.status) {
      case 'success':
        return {
          action: 'captured',
          data: { session_id: cartId, amount: Math.round(parseFloat(body.amount) * 100) },
        };
      case 'failure':
        return {
          action: 'failed',
          data: { session_id: cartId, amount: Math.round(parseFloat(body.amount) * 100) },
        };
      default:
        return { action: 'not_supported' };
    }
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /** Fetches payment transaction details from PayU's verify API */
  private async fetchPaymentDetail(txnid: string) {
    const command = 'verify_payment';
    const hash = generateVerifyHash(this.merchantKey, command, txnid, this.merchantSalt);

    const params = new URLSearchParams({
      key: this.merchantKey,
      command,
      var1: txnid,
      hash,
    });

    const res = await axios.post<PayUVerifyResponse>(this.verifyUrl, params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return res.data?.transaction_details?.[txnid] ?? null;
  }

  private buildError(msg: string, err: any): PaymentProviderError {
    return {
      error: msg,
      code: 'PAYU_ERROR',
      detail: err?.message ?? JSON.stringify(err),
    };
  }
}

export default PayUPaymentProvider;
