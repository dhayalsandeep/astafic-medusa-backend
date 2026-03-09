/**
 * PayU India — TypeScript Type Definitions
 * File: src/providers/payu/types.ts
 */

// ── Provider Options ──────────────────────────────────────────────────────────

export interface PayUOptions {
  /** PayU Merchant Key (from PayU Dashboard) */
  merchantKey: string;
  /** PayU Merchant Salt (from PayU Dashboard) */
  merchantSalt: string;
  /** 'test' or 'production' */
  mode: 'test' | 'production';
}

// ── Payment Request ───────────────────────────────────────────────────────────

export interface PayUPaymentRequest {
  key: string;
  txnid: string;
  amount: string;           // string, 2 decimal places e.g. "1500.00"
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;             // success redirect URL
  furl: string;             // failure redirect URL
  hash: string;
  udf1?: string;            // custom field 1 (used for cart_id)
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  pg?: string;              // payment gateway hint: 'CC', 'DC', 'NB', 'UPI'
  bankcode?: string;
  ccnum?: string;
  ccname?: string;
  ccvv?: string;
  ccexpmon?: string;
  ccexpyr?: string;
  curl?: string;            // cancel redirect URL
}

// ── Payment Response (from PayU redirect) ─────────────────────────────────────

export interface PayUPaymentResponse {
  mihpayid: string;         // PayU transaction ID
  mode: string;             // CC, DC, NB, UPI, etc.
  status: PayUStatus;
  unmappedstatus: string;
  key: string;
  txnid: string;
  amount: string;
  addedon: string;
  productinfo: string;
  firstname: string;
  lastname?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state?: string;
  country?: string;
  zipcode?: string;
  email: string;
  phone?: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
  hash: string;
  field1?: string;
  field2?: string;
  field3?: string;
  field4?: string;
  field5?: string;
  field6?: string;
  field7?: string;
  field8?: string;
  field9?: string;
  payment_source?: string;
  PG_TYPE?: string;
  bank_ref_num?: string;
  bankcode?: string;
  error?: string;
  error_Message?: string;
  net_amount_debit?: string;
}

// ── Verify API ─────────────────────────────────────────────────────────────────

export interface PayUVerifyRequest {
  key: string;
  command: 'verify_payment';
  var1: string;             // comma-separated txnids
  hash: string;
}

export interface PayUVerifyResponse {
  status: number;
  msg: string;
  transaction_details: Record<string, PayUTransactionDetail>;
}

export interface PayUTransactionDetail {
  mihpayid: string;
  status: PayUStatus;
  disc: string;
  mode: string;
  net_amount_debit: string;
  amt: string;
  error: string;
  error_Message: string;
  bank_ref_num: string;
  unmappedstatus: string;
  addedon: string;
  txnid: string;
  additional_charges?: string;
}

// ── Refund API ────────────────────────────────────────────────────────────────

export interface PayURefundRequest {
  key: string;
  command: 'cancel_refund_transaction';
  var1: string;             // mihpayid (PayU transaction ID)
  var2: string;             // net refund amount (string)
  hash: string;
}

export interface PayURefundResponse {
  status: number;
  msg: string;
  request_id?: string;
  bank_ref_num?: string;
  mihpayid?: string;
}

// ── Statuses ──────────────────────────────────────────────────────────────────

export type PayUStatus = 'success' | 'failure' | 'pending';

// ── Session Data stored in Medusa ─────────────────────────────────────────────

export interface PayUSessionData {
  txnid: string;
  payu_txn_id?: string;     // mihpayid from PayU after payment
  amount: string;
  status?: PayUStatus;
  mode?: string;
  bank_ref_num?: string;
  error?: string;
  cart_id?: string;
  hash_sequence?: string;
}

// ── Initiate API Request/Response ─────────────────────────────────────────────

export interface PayUInitiateRequest {
  amount: number;           // in INR (not paise)
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  cartId: string;
  udf2?: string;
  udf3?: string;
}

export interface PayUInitiateResponse {
  paymentUrl: string;
  formData: Omit<PayUPaymentRequest, 'hash'> & { hash: string };
}
