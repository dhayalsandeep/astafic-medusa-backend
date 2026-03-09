/**
 * PayU Payment Provider — Module Entry Point
 * File: src/providers/payu/module.ts
 *
 * Medusa v2 expects payment provider modules to export:
 *   - `default`: an object with `services` array containing the provider class
 */
import { PayUPaymentProvider } from './index';

export const PAYU_MODULE = 'payu';

// Medusa v2 payment provider module format
export default {
  services: [PayUPaymentProvider],
};
