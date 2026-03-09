/**
 * Razorpay Module Entry Point
 * File: src/modules/razorpay/index.ts
 */
import { Module } from '@medusajs/framework/utils';
import { RazorpayPaymentProvider } from './provider';

export const RAZORPAY_MODULE = 'razorpay';

export default Module(RAZORPAY_MODULE, {
  service: RazorpayPaymentProvider,
});
