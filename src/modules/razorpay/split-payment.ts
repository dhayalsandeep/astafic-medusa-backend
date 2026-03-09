/**
 * Razorpay Multi-Vendor Split Payment (Route)
 * File: src/modules/razorpay/split-payment.ts
 *
 * Uses Razorpay Route to automatically split a captured payment between:
 *  - The platform account (commission)
 *  - One or more vendor linked accounts
 *
 * Prerequisites:
 *  - Each vendor must have a Razorpay linked account (route_account_id)
 *  - Razorpay Route must be enabled on your account
 *  - Use Razorpay Transfer API after payment capture
 */

import Razorpay from 'razorpay';

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VendorSplit {
  /** Razorpay linked account ID of the vendor: e.g. "acc_AbCdEfGhIjKl12" */
  vendorAccountId: string;
  /** Share in paise (1 INR = 100 paise) */
  amount: number;
  /** Optional description shown on vendor statement */
  description?: string;
  /** Whether this vendor amount should be on hold until released */
  onHold?: boolean;
  /** Auto-release delay in seconds (if onHold = true) */
  onHoldUntil?: number;
}

export interface SplitPaymentInput {
  /** Razorpay payment ID after capture */
  paymentId: string;
  /** Total payment amount in paise */
  totalAmount: number;
  /** Platform commission percentage (0–100) */
  platformCommissionPct: number;
  /** Array of vendor splits. Amounts must sum to (totalAmount - platformCommission) */
  vendors: VendorSplit[];
  /** Optional order reference for tracking */
  orderId?: string;
}

export interface SplitPaymentResult {
  success: boolean;
  transfers: TransferRecord[];
  platformAmount: number;
  errors: string[];
}

interface TransferRecord {
  vendorAccountId: string;
  transferId: string;
  amount: number;
  status: string;
}

// ── Main Split Function ──────────────────────────────────────────────────────

/**
 * Splits a captured Razorpay payment among multiple vendors using Route.
 *
 * @example
 * await splitPayment({
 *   paymentId: 'pay_AbCdEf123456',
 *   totalAmount: 100000,            // ₹1000 in paise
 *   platformCommissionPct: 10,      // Platform keeps ₹100
 *   vendors: [
 *     { vendorAccountId: 'acc_Vendor1', amount: 60000 }, // ₹600
 *     { vendorAccountId: 'acc_Vendor2', amount: 40000 }, // ₹400
 *   ],
 * });
 */
export async function splitPayment(input: SplitPaymentInput): Promise<SplitPaymentResult> {
  const { paymentId, totalAmount, platformCommissionPct, vendors, orderId } = input;

  const platformAmount = Math.floor((totalAmount * platformCommissionPct) / 100);
  const transferableAmount = totalAmount - platformAmount;

  // Validate that vendor splits add up
  const vendorTotal = vendors.reduce((sum, v) => sum + v.amount, 0);
  if (vendorTotal > transferableAmount) {
    throw new Error(
      `Vendor splits (${vendorTotal} paise) exceed transferable amount (${transferableAmount} paise)`
    );
  }

  const transfers: TransferRecord[] = [];
  const errors: string[] = [];

  // Create a transfer to each vendor linked account
  for (const vendor of vendors) {
    try {
      const transfer = await (razorpay.payments as any).transfer(paymentId, {
        transfers: [
          {
            account: vendor.vendorAccountId,
            amount: vendor.amount,
            currency: 'INR',
            notes: {
              order_id: orderId ?? '',
              description: vendor.description ?? 'Vendor payment',
            },
            linked_account_notes: ['description'],
            on_hold: vendor.onHold ? 1 : 0,
            on_hold_until: vendor.onHold ? (vendor.onHoldUntil ?? 0) : undefined,
          },
        ],
      });

      const transferItem = transfer.items?.[0];
      transfers.push({
        vendorAccountId: vendor.vendorAccountId,
        transferId: transferItem?.id ?? '',
        amount: vendor.amount,
        status: transferItem?.status ?? 'created',
      });

      console.log(
        `[Split] ✓ Vendor ${vendor.vendorAccountId}: ₹${vendor.amount / 100} transferred`
      );
    } catch (err: any) {
      const msg = `Transfer to ${vendor.vendorAccountId} failed: ${err?.error?.description ?? err.message}`;
      console.error(`[Split] ✗ ${msg}`);
      errors.push(msg);
    }
  }

  return {
    success: errors.length === 0,
    transfers,
    platformAmount,
    errors,
  };
}

// ── Vendor Linked Account Setup Helper ──────────────────────────────────────

/**
 * Creates a Razorpay Route linked account for a new vendor.
 * Call this once when onboarding a vendor.
 *
 * @returns The linked account ID to store in your vendor record.
 */
export async function createVendorLinkedAccount(vendor: {
  businessName: string;
  email: string;
  phone: string;
  legalBusinessName: string;
  businessType?: 'route' | 'submerchant';
  bankAccount: {
    beneficiaryName: string;
    accountNumber: string;
    ifsc: string;
    accountType?: 'savings' | 'current';
  };
}): Promise<{ accountId: string }> {
  try {
    const account = await (razorpay as any).accounts.create({
      email: vendor.email,
      profile: {
        category: 'ecommerce',
        subcategory: 'fashion_and_lifestyle',
        description: vendor.businessName,
        business_model: 'B2C',
        addresses: {
          registered: {
            street1: 'India',
            city: 'Mumbai',
            state: 'MH',
            postal_code: '400001',
            country: 'IN',
          },
        },
      },
      legal_info: {
        pan: 'AAAPZ1234C', // Replace with actual PAN at runtime
        gst: '',
      },
      legal_business_name: vendor.legalBusinessName,
      business_type: vendor.businessType ?? 'route',
      contact_name: vendor.businessName,
      contact_info: {
        phone: { primary: vendor.phone },
      },
    });

    // Attach bank account
    await (razorpay as any).stakeholders.create(account.id, {
      name: vendor.bankAccount.beneficiaryName,
      email: vendor.email,
    });

    return { accountId: account.id };
  } catch (err: any) {
    throw new Error(
      `createVendorLinkedAccount failed: ${err?.error?.description ?? err.message}`
    );
  }
}

// ── Release On-Hold Transfers ────────────────────────────────────────────────

/**
 * Releases a transfer that was put on hold (e.g., after dispute resolution).
 */
export async function releaseTransfer(transferId: string): Promise<void> {
  try {
    await (razorpay as any).transfers.edit(transferId, { on_hold: 0 });
    console.log(`[Split] Released transfer ${transferId}`);
  } catch (err: any) {
    throw new Error(`releaseTransfer failed: ${err?.error?.description ?? err.message}`);
  }
}
