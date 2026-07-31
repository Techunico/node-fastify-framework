import type {
  NormalizedPaymentEvent,
  ParsedWebhookPayload,
  ParseWebhookInput,
  PaymentAuthorizationResult,
  PaymentCancelResult,
  PaymentCaptureResult,
  PaymentContext,
  PaymentFetchResult,
  PaymentGatewayCapabilities,
  PaymentGatewayName,
  PaymentHealthReport,
  PaymentRefundResult,
  PaymentSignatureInput,
  PaymentSignatureResult,
} from "./types";

/**
 * PaymentGatewayAdapter — boundary over an external payment gateway.
 *
 * Implement one adapter per gateway (Razorpay, Cashfree, Stripe, PhonePe, Mock).
 * Business modules never see this interface; they call PaymentService only.
 *
 * Naming: "Adapter" (not "Provider") stresses that this wraps a foreign API.
 */
export interface PaymentGatewayAdapter {
  readonly name: PaymentGatewayName;

  /** Create an authorization / payment intent (not a final capture). */
  authorizePayment(context: PaymentContext): Promise<PaymentAuthorizationResult>;

  /** Capture funds for a prior authorization or auto-capture payment. */
  capturePayment(context: PaymentContext): Promise<PaymentCaptureResult>;

  /** Cancel a pending authorization when the gateway supports it. */
  cancelPayment(context: PaymentContext): Promise<PaymentCancelResult>;

  /** Full or partial refund of a captured payment. */
  refundPayment(context: PaymentContext): Promise<PaymentRefundResult>;

  /** Fetch current payment / authorization state. */
  fetchPayment(context: PaymentContext): Promise<PaymentFetchResult>;

  /** Cryptographic signature check (checkout or webhook). */
  verifySignature(input: PaymentSignatureInput): Promise<PaymentSignatureResult>;

  /**
   * Parse raw HTTP body/headers into a structured envelope.
   * Does not verify authenticity — call verifySignature first (or use service helper).
   */
  parseWebhook(input: ParseWebhookInput): Promise<ParsedWebhookPayload>;

  /** Map a parsed payload into NormalizedPaymentEvent (business-safe). */
  normalizeWebhookEvent(
    parsed: ParsedWebhookPayload,
    options?: { eventId?: string },
  ): Promise<NormalizedPaymentEvent>;

  /** Feature flags for this gateway. */
  capabilities(): PaymentGatewayCapabilities;

  /** Structured health for ops / readiness probes. */
  health(): Promise<PaymentHealthReport>;
}
