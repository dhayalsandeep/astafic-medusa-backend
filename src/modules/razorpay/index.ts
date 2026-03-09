/**
 * Razorpay Payment Provider — Module Entry Point
 * File: src/modules/razorpay/index.ts
 *
 * Medusa v2 expects payment provider modules to export:
 *   - `default`: an object with `services` array containing the provider class
 */
import { RazorpayPaymentProvider } from './provider';

export const RAZORPAY_MODULE = 'razorpay';

// Medusa v2 payment provider module format
export default {
  services: [RazorpayPaymentProvider],
};
