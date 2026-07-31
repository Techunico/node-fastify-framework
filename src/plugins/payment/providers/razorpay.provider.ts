import { createHmac, timingSafeEqual } from "node:crypto";
import Razorpay from "razorpay";
import type { PaymentGatewayAdapter } from "../adapter";
import {
  PaymentGatewayError,
  PaymentInvalidSignatureError,
  PaymentNotConfiguredError,
  PaymentUnsupportedError,
} from "../errors";
import {
  assertMinorAmount,
  assertOptionalMinorAmount,
  toMinorInteger,
} from "../money";
import type {
  NormalizedPaymentEvent,
  NormalizedPaymentEventType,
  ParsedWebhookPayload,
  ParseWebhookInput,
  PaymentAuthorizationResult,
  PaymentCancelResult,
  PaymentCaptureResult,
  PaymentContext,
  PaymentFetchResult,
  PaymentGatewayCapabilities,
  PaymentHealthReport,
  PaymentMetadata,
  PaymentRefundResult,
  PaymentSignatureInput,
  PaymentSignatureResult,
  PaymentStatus,
  RazorpayGatewayConfig,
} from "../types";
import {
  PAYMENT_PLUGIN_VERSION,
  PaymentGatewayName,
} from "../types";

/**
 * Razorpay SDK is imported ONLY in this file.
 * No other module may import `razorpay`.
 *
 * Internal mapping (never leaked to business):
 *   authorizePayment → orders.create
 *   capturePayment   → payments.capture
 *   fetchPayment     → payments.fetch | orders.fetch
 *   refundPayment    → payments.refund
 *   cancelPayment    → not natively supported for orders (throws unsupported)
 */
export class RazorpayPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly name = PaymentGatewayName.Razorpay;
  private readonly client: Razorpay;

  constructor(private readonly config: RazorpayGatewayConfig) {
    if (!config.keyId || !config.keySecret) {
      throw new PaymentNotConfiguredError(
        "Razorpay requires RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET",
      );
    }
    this.client = new Razorpay({
      key_id: config.keyId,
      key_secret: config.keySecret,
    });
  }

  async authorizePayment(
    context: PaymentContext,
  ): Promise<PaymentAuthorizationResult> {
    assertMinorAmount(context.amount);
    const currency = context.currency || this.config.defaultCurrency;

    try {
      const raw = (await this.client.orders.create({
        amount: context.amount,
        currency,
        receipt: context.receipt,
        notes: this.toGatewayNotes(context),
        partial_payment: false,
      })) as RazorpayOrderResponse;

      return {
        authorizationId: String(raw.id),
        paymentId: null,
        provider: this.name,
        amount: toMinorInteger(raw.amount),
        currency: String(raw.currency || currency),
        status: this.mapOrderStatus(raw.status),
        receipt: raw.receipt != null ? String(raw.receipt) : null,
        metadata: this.fromNotes(raw.notes),
        clientHints: {
          provider: this.name,
          publicKey: this.config.keyId,
        },
        occurredAt: raw.created_at
          ? new Date(Number(raw.created_at) * 1000)
          : new Date(),
      };
    } catch (err) {
      throw this.wrap(err, "authorizePayment failed");
    }
  }

  async capturePayment(context: PaymentContext): Promise<PaymentCaptureResult> {
    assertMinorAmount(context.amount);
    if (!context.paymentId) {
      throw new PaymentUnsupportedError(
        "capturePayment requires context.paymentId",
        this.name,
      );
    }
    const currency = context.currency || this.config.defaultCurrency;

    try {
      const raw = (await this.client.payments.capture(
        context.paymentId,
        context.amount,
        currency,
      )) as RazorpayPaymentResponse;

      return this.mapCapture(raw);
    } catch (err) {
      throw this.wrap(err, `capturePayment failed for ${context.paymentId}`);
    }
  }

  async cancelPayment(_context: PaymentContext): Promise<PaymentCancelResult> {
    // Razorpay does not expose a general order/payment cancel for all modes.
    throw new PaymentUnsupportedError(
      "Razorpay adapter does not support cancelPayment; expire checkout or refund after capture",
      this.name,
    );
  }

  async refundPayment(context: PaymentContext): Promise<PaymentRefundResult> {
    if (!context.paymentId) {
      throw new PaymentUnsupportedError(
        "refundPayment requires context.paymentId",
        this.name,
      );
    }
    assertOptionalMinorAmount(context.amount);

    try {
      const raw = (await this.client.payments.refund(context.paymentId, {
        amount: context.amount,
        notes: this.toGatewayNotes(context),
        receipt: context.receipt,
      })) as RazorpayRefundResponse;

      return {
        refundId: String(raw.id),
        paymentId:
          raw.payment_id != null
            ? String(raw.payment_id)
            : context.paymentId,
        provider: this.name,
        amount: toMinorInteger(raw.amount),
        currency: String(raw.currency || this.config.defaultCurrency),
        status: this.mapRefundStatus(raw.status, context.partial),
        metadata: this.fromNotes(raw.notes),
        occurredAt: raw.created_at
          ? new Date(Number(raw.created_at) * 1000)
          : new Date(),
      };
    } catch (err) {
      throw this.wrap(err, `refundPayment failed for ${context.paymentId}`);
    }
  }

  async fetchPayment(context: PaymentContext): Promise<PaymentFetchResult> {
    try {
      if (context.paymentId) {
        const raw = (await this.client.payments.fetch(
          context.paymentId,
        )) as RazorpayPaymentResponse;
        const mapped = this.mapCapture(raw);
        return {
          paymentId: mapped.paymentId,
          authorizationId: mapped.authorizationId,
          provider: this.name,
          amount: mapped.amount,
          currency: mapped.currency,
          status: mapped.status,
          method: mapped.method,
          metadata: mapped.metadata,
          occurredAt: mapped.occurredAt,
        };
      }

      if (context.authorizationId) {
        const raw = (await this.client.orders.fetch(
          context.authorizationId,
        )) as RazorpayOrderResponse;
        return {
          paymentId: null,
          authorizationId: String(raw.id),
          provider: this.name,
          amount: toMinorInteger(raw.amount),
          currency: String(raw.currency || this.config.defaultCurrency),
          status: this.mapOrderStatus(raw.status),
          method: null,
          metadata: this.fromNotes(raw.notes),
          occurredAt: raw.created_at
            ? new Date(Number(raw.created_at) * 1000)
            : null,
        };
      }

      throw new PaymentUnsupportedError(
        "fetchPayment requires paymentId or authorizationId",
        this.name,
      );
    } catch (err) {
      if (err instanceof PaymentUnsupportedError) throw err;
      throw this.wrap(err, "fetchPayment failed");
    }
  }

  async verifySignature(
    input: PaymentSignatureInput,
  ): Promise<PaymentSignatureResult> {
    const secret =
      input.purpose === "webhook"
        ? this.config.webhookSecret
        : this.config.keySecret;

    if (!secret) {
      throw new PaymentNotConfiguredError(
        input.purpose === "webhook"
          ? "RAZORPAY_WEBHOOK_SECRET is not configured"
          : "RAZORPAY_KEY_SECRET is not configured",
      );
    }

    const expected = this.hmac(input.payload, secret);
    const valid = this.secureCompare(expected, input.signature);
    return { valid, provider: this.name };
  }

  async parseWebhook(input: ParseWebhookInput): Promise<ParsedWebhookPayload> {
    const body =
      typeof input.body === "string"
        ? (JSON.parse(input.body) as Record<string, unknown>)
        : input.body;

    return {
      provider: this.name,
      providerEvent: typeof body.event === "string" ? body.event : null,
      body,
      headers: input.headers,
    };
  }

  async normalizeWebhookEvent(
    parsed: ParsedWebhookPayload,
    options?: { eventId?: string },
  ): Promise<NormalizedPaymentEvent> {
    const eventType = this.mapProviderEvent(parsed.providerEvent);
    const entity = this.extractPrimaryEntity(parsed.body);

    const eventId =
      options?.eventId ||
      (typeof parsed.body.id === "string" ? parsed.body.id : null) ||
      this.syntheticEventId(parsed);

    return {
      eventId,
      provider: this.name,
      event: eventType,
      paymentId: entity.paymentId,
      authorizationId: entity.authorizationId,
      refundId: entity.refundId,
      amount: entity.amount,
      currency: entity.currency,
      status: entity.status,
      metadata: entity.metadata,
      occurredAt: entity.occurredAt,
      raw: parsed.body,
    };
  }

  capabilities(): PaymentGatewayCapabilities {
    return {
      authorize: true,
      capture: true,
      cancel: false,
      refund: true,
      partialRefund: true,
      partialCapture: true,
      webhook: Boolean(this.config.webhookSecret),
      subscriptions: false,
      upi: true,
      cards: true,
      netBanking: true,
      wallets: true,
    };
  }

  async health(): Promise<PaymentHealthReport> {
    const caps = this.capabilities();
    const configured = Boolean(this.config.keyId && this.config.keySecret);
    return {
      provider: this.name,
      mode: this.config.mode,
      configured,
      healthy: configured,
      supportsRefund: caps.refund,
      supportsWebhook: caps.webhook,
      supportsPartialRefund: caps.partialRefund,
      version: PAYMENT_PLUGIN_VERSION,
      message: configured
        ? "Razorpay credentials present"
        : "Razorpay credentials missing",
      checkedAt: new Date(),
      details: {
        keyIdConfigured: Boolean(this.config.keyId),
        webhookSecretConfigured: Boolean(this.config.webhookSecret),
      },
    };
  }

  // ─── mapping ─────────────────────────────────────────────────────────────

  private mapCapture(raw: RazorpayPaymentResponse): PaymentCaptureResult {
    return {
      paymentId: String(raw.id),
      authorizationId: raw.order_id != null ? String(raw.order_id) : null,
      provider: this.name,
      amount: toMinorInteger(raw.amount),
      currency: String(raw.currency || this.config.defaultCurrency),
      status: this.mapPaymentStatus(raw.status),
      method: raw.method != null ? String(raw.method) : null,
      metadata: this.fromNotes(raw.notes),
      occurredAt: raw.created_at
        ? new Date(Number(raw.created_at) * 1000)
        : null,
    };
  }

  private mapOrderStatus(status: unknown): PaymentStatus {
    switch (String(status || "").toLowerCase()) {
      case "created":
        return "authorized";
      case "attempted":
        return "pending";
      case "paid":
        return "captured";
      default:
        return "unknown";
    }
  }

  private mapPaymentStatus(status: unknown): PaymentStatus {
    switch (String(status || "").toLowerCase()) {
      case "created":
        return "pending";
      case "authorized":
        return "authorized";
      case "captured":
        return "captured";
      case "refunded":
        return "refunded";
      case "failed":
        return "failed";
      default:
        return "unknown";
    }
  }

  private mapRefundStatus(
    status: unknown,
    partial?: boolean,
  ): PaymentStatus {
    const s = String(status || "").toLowerCase();
    if (s === "processed" || s === "completed") {
      return partial ? "partially_refunded" : "refunded";
    }
    if (s === "pending") return "pending";
    if (s === "failed") return "failed";
    return partial ? "partially_refunded" : "refunded";
  }

  private mapProviderEvent(
    providerEvent: string | null,
  ): NormalizedPaymentEventType {
    switch (String(providerEvent || "")) {
      case "payment.authorized":
        return "payment.authorized";
      case "payment.captured":
      case "order.paid":
        return "payment.captured";
      case "payment.failed":
        return "payment.failed";
      case "refund.processed":
      case "refund.created":
        return "refund.processed";
      case "refund.failed":
        return "refund.failed";
      default:
        return "unknown";
    }
  }

  private extractPrimaryEntity(body: Record<string, unknown>): {
    paymentId: string | null;
    authorizationId: string | null;
    refundId: string | null;
    amount: number | null;
    currency: string | null;
    status: PaymentStatus;
    metadata: PaymentMetadata;
    occurredAt: Date | null;
  } {
    const nested =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};

    const paymentEntity = this.entityFrom(nested, "payment");
    const orderEntity = this.entityFrom(nested, "order");
    const refundEntity = this.entityFrom(nested, "refund");
    const primary = paymentEntity || orderEntity || refundEntity || {};

    const amountRaw = primary.amount;
    let amount: number | null = null;
    if (amountRaw !== undefined && amountRaw !== null) {
      try {
        amount = toMinorInteger(amountRaw);
      } catch {
        amount = null;
      }
    }

    return {
      paymentId:
        this.asString(paymentEntity?.id) ||
        this.asString(primary.payment_id),
      authorizationId:
        this.asString(primary.order_id) || this.asString(orderEntity?.id),
      refundId: this.asString(refundEntity?.id),
      amount,
      currency: this.asString(primary.currency),
      status: this.mapPaymentStatus(primary.status),
      metadata: this.fromNotes(primary.notes),
      occurredAt: primary.created_at
        ? new Date(Number(primary.created_at) * 1000)
        : null,
    };
  }

  private entityFrom(
    nested: Record<string, unknown>,
    key: string,
  ): Record<string, unknown> | null {
    const block = nested[key];
    if (!block || typeof block !== "object") return null;
    const entity = (block as Record<string, unknown>).entity;
    if (entity && typeof entity === "object") {
      return entity as Record<string, unknown>;
    }
    return block as Record<string, unknown>;
  }

  private syntheticEventId(parsed: ParsedWebhookPayload): string {
    const basis = `${parsed.providerEvent || "evt"}:${JSON.stringify(parsed.body).slice(0, 200)}`;
    return createHmac("sha256", "event-id")
      .update(basis)
      .digest("hex")
      .slice(0, 32);
  }

  // ─── crypto / utils ──────────────────────────────────────────────────────

  private hmac(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  private secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private toGatewayNotes(
    context: PaymentContext,
  ): Record<string, string | number> | undefined {
    const notes: Record<string, string | number> = {};
    const put = (k: string, v: string | number | boolean | null | undefined) => {
      if (v === undefined || v === null) return;
      notes[k] = typeof v === "boolean" ? String(v) : v;
    };

    put("invoiceId", context.invoiceId);
    put("tripId", context.tripId);
    put("customerId", context.customerId);
    put("driverId", context.driverId);
    put("vendorId", context.vendorId);
    put("requestId", context.requestId);
    put("paymentType", context.paymentType);

    if (context.metadata) {
      for (const [key, value] of Object.entries(context.metadata)) {
        put(key, value);
      }
    }

    return Object.keys(notes).length ? notes : undefined;
  }

  private fromNotes(notes: unknown): PaymentMetadata {
    if (!notes || typeof notes !== "object") return {};
    return notes as PaymentMetadata;
  }

  private asString(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
  }

  private wrap(err: unknown, message: string): PaymentGatewayError {
    if (err instanceof PaymentInvalidSignatureError) throw err;
    if (err instanceof PaymentUnsupportedError) throw err;
    if (err instanceof PaymentNotConfiguredError) throw err;

    const detail =
      err && typeof err === "object" && "error" in err
        ? JSON.stringify((err as { error: unknown }).error)
        : err instanceof Error
          ? err.message
          : String(err);

    return new PaymentGatewayError(
      `${message}: ${detail}`,
      this.name,
      err,
    );
  }
}

/** @deprecated Prefer RazorpayPaymentGatewayAdapter */
export const RazorpayPaymentProvider = RazorpayPaymentGatewayAdapter;

// Minimal SDK response shapes — prevents SDK any leakage into the plugin core.
interface RazorpayOrderResponse {
  id: string;
  amount: number | string;
  currency?: string;
  receipt?: string | null;
  status?: string;
  notes?: Record<string, string | number>;
  created_at?: number;
}

interface RazorpayPaymentResponse {
  id: string;
  order_id?: string | null;
  amount: number | string;
  currency?: string;
  status?: string;
  method?: string | null;
  notes?: Record<string, string | number>;
  captured?: boolean;
  created_at?: number;
}

interface RazorpayRefundResponse {
  id: string;
  payment_id?: string;
  amount: number | string;
  currency?: string;
  status?: string;
  notes?: Record<string, string | number>;
  created_at?: number;
}
