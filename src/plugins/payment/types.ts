/**
 * Enterprise payment types — business domain only.
 *
 * Gateway SDKs (Razorpay, Stripe, …) must never appear here.
 * Adapters map these types to provider-specific APIs.
 */

// ─── Gateway registry ────────────────────────────────────────────────────────

/** Registered gateway adapters. Extend when adding Cashfree / Stripe / PhonePe. */
export enum PaymentGatewayName {
  Razorpay = "razorpay",
  Mock = "mock",
  // Cashfree = "cashfree",
  // Stripe = "stripe",
  // PhonePe = "phonepe",
}

/** Optional per-call routing override (multi-provider ready). */
export interface PaymentRoutingOptions {
  /**
   * Target gateway. When omitted, the configured default provider is used.
   * Example: app.payment.authorizePayment(ctx, { provider: "razorpay" })
   */
  provider?: PaymentGatewayName | string;
}

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * Amount in **minor currency units** (paise, cents).
 * Never use floating-point major units inside the plugin.
 */
export type PaymentAmountMinor = number;

export type PaymentCurrency = string;

// ─── Business payment types (future product modes) ───────────────────────────

export type PaymentBusinessType =
  | "ride"
  | "wallet"
  | "corporate"
  | "subscription"
  | "penalty"
  | "rental"
  | "tip"
  | "other";

// ─── PaymentContext (provider-agnostic request) ──────────────────────────────

/**
 * Universal payment context shared by all product flows.
 * Gateways receive only what the adapter chooses to map.
 */
export interface PaymentContext {
  /** Amount in minor units (required for authorize / capture / refund amount). */
  amount?: PaymentAmountMinor;
  currency?: PaymentCurrency;

  /** Business correlation — preferred over free-form metadata for logging. */
  invoiceId?: string;
  tripId?: string;
  customerId?: string;
  driverId?: string;
  vendorId?: string;

  /**
   * Provider payment / charge id (capture, refund, fetch, cancel).
   * Not a gateway "order" concept — business-facing payment reference.
   */
  paymentId?: string;

  /**
   * Authorization / intent id returned by authorizePayment.
   * Razorpay maps this to order_id internally; Stripe to PaymentIntent, etc.
   */
  authorizationId?: string;

  /** Human / system receipt key (invoice number, trip number). */
  receipt?: string;

  /** Distributed-trace / request correlation id. */
  requestId?: string;

  /** Product mode for routing / analytics. */
  paymentType?: PaymentBusinessType;

  /** Opaque business metadata (safe for gateway notes when stringifiable). */
  metadata?: PaymentMetadata;

  /** Partial capture / refund hints. */
  partial?: boolean;
}

export interface PaymentMetadata {
  [key: string]: string | number | boolean | null | undefined;
}

// ─── Normalized statuses ─────────────────────────────────────────────────────

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "captured"
  | "failed"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "unknown";

// ─── Operation results ───────────────────────────────────────────────────────

/** Result of authorizePayment — hold / intent created, not necessarily captured. */
export interface PaymentAuthorizationResult {
  /** Authorization / intent id (provider-opaque). */
  authorizationId: string;
  /** Sometimes also a payment id at authorize time (provider-dependent). */
  paymentId: string | null;
  provider: PaymentGatewayName;
  amount: PaymentAmountMinor;
  currency: PaymentCurrency;
  status: PaymentStatus;
  receipt: string | null;
  metadata: PaymentMetadata;
  /** Client checkout hints (e.g. publishable key id) — never secrets. */
  clientHints: PaymentClientHints;
  occurredAt: Date | null;
}

export interface PaymentClientHints {
  /** Public key / key id safe for mobile clients (Razorpay key_id, Stripe pk_…). */
  publicKey?: string | null;
  /** Provider name for client SDK selection. */
  provider: PaymentGatewayName;
  [key: string]: string | number | boolean | null | undefined;
}

export interface PaymentCaptureResult {
  paymentId: string;
  authorizationId: string | null;
  provider: PaymentGatewayName;
  amount: PaymentAmountMinor;
  currency: PaymentCurrency;
  status: PaymentStatus;
  method: string | null;
  metadata: PaymentMetadata;
  occurredAt: Date | null;
}

export interface PaymentCancelResult {
  paymentId: string | null;
  authorizationId: string | null;
  provider: PaymentGatewayName;
  status: PaymentStatus;
  metadata: PaymentMetadata;
  occurredAt: Date | null;
}

export interface PaymentRefundResult {
  refundId: string;
  paymentId: string;
  provider: PaymentGatewayName;
  amount: PaymentAmountMinor;
  currency: PaymentCurrency;
  status: PaymentStatus;
  metadata: PaymentMetadata;
  occurredAt: Date | null;
}

export interface PaymentFetchResult {
  paymentId: string | null;
  authorizationId: string | null;
  provider: PaymentGatewayName;
  amount: PaymentAmountMinor;
  currency: PaymentCurrency;
  status: PaymentStatus;
  method: string | null;
  metadata: PaymentMetadata;
  occurredAt: Date | null;
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export interface PaymentSignatureInput {
  /** Raw body string or structured payload to sign/verify. */
  payload: string;
  signature: string;
  /** order = client checkout signature; webhook = server webhook secret. */
  purpose?: "checkout" | "webhook";
  provider?: PaymentGatewayName | string;
}

export interface PaymentSignatureResult {
  valid: boolean;
  provider: PaymentGatewayName;
}

/**
 * Opaque parsed webhook envelope before normalization.
 * Still provider-agnostic at the type level; adapters own the shape.
 */
export interface ParsedWebhookPayload {
  provider: PaymentGatewayName;
  /** Raw event name from gateway (not for business branching). */
  providerEvent: string | null;
  body: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}

export interface ParseWebhookInput {
  body: string | Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  provider?: PaymentGatewayName | string;
}

/**
 * NormalizedPaymentEvent — the only webhook shape business modules should consume.
 * eventId enables future Payment Module idempotency (duplicate delivery rejection).
 */
export interface NormalizedPaymentEvent {
  /** Stable unique id for this delivery / event (required for idempotency). */
  eventId: string;
  provider: PaymentGatewayName;
  /**
   * Normalized business event:
   * payment.authorized | payment.captured | payment.failed |
   * payment.cancelled | refund.processed | refund.failed | unknown
   */
  event: NormalizedPaymentEventType;
  paymentId: string | null;
  authorizationId: string | null;
  refundId: string | null;
  amount: PaymentAmountMinor | null;
  currency: PaymentCurrency | null;
  status: PaymentStatus;
  metadata: PaymentMetadata;
  occurredAt: Date | null;
  /**
   * Original payload for audit / reprocessing only.
   * Business logic must not branch on provider-specific fields here.
   */
  raw: Record<string, unknown>;
}

export type NormalizedPaymentEventType =
  | "payment.authorized"
  | "payment.captured"
  | "payment.failed"
  | "payment.cancelled"
  | "refund.processed"
  | "refund.failed"
  | "unknown";

export interface VerifyWebhookInput {
  body: string | Record<string, unknown>;
  signature: string;
  headers?: Record<string, string | string[] | undefined>;
  eventId?: string;
  provider?: PaymentGatewayName | string;
}

// ─── Capabilities & health ───────────────────────────────────────────────────

export interface PaymentGatewayCapabilities {
  authorize: boolean;
  capture: boolean;
  cancel: boolean;
  refund: boolean;
  partialRefund: boolean;
  partialCapture: boolean;
  webhook: boolean;
  subscriptions: boolean;
  upi: boolean;
  cards: boolean;
  netBanking: boolean;
  wallets: boolean;
}

export interface PaymentHealthReport {
  provider: PaymentGatewayName;
  /** live | test | mock */
  mode: "live" | "test" | "mock";
  configured: boolean;
  healthy: boolean;
  supportsRefund: boolean;
  supportsWebhook: boolean;
  supportsPartialRefund: boolean;
  version: string;
  message: string;
  checkedAt: Date;
  details?: Record<string, unknown>;
}

// ─── Plugin config ───────────────────────────────────────────────────────────

export interface RazorpayGatewayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  defaultCurrency: PaymentCurrency;
  /** When key_id starts with rzp_test_ → test mode. */
  mode: "live" | "test";
}

export interface MockGatewayConfig {
  defaultCurrency: PaymentCurrency;
  stableIds: boolean;
}

export interface PaymentPluginConfig {
  /** Default gateway when routing omits provider. */
  defaultProvider: PaymentGatewayName;
  defaultCurrency: PaymentCurrency;
  razorpay: RazorpayGatewayConfig;
  mock: MockGatewayConfig;
  /** NODE_ENV snapshot for startup validation. */
  nodeEnv: string;
}

/** Plugin package version reported in health. */
export const PAYMENT_PLUGIN_VERSION = "payment-plugin-v2";
