import { createHash, randomBytes } from "node:crypto";
import type { PaymentGatewayAdapter } from "../adapter";
import {
  PaymentInvalidSignatureError,
  PaymentUnsupportedError,
} from "../errors";
import { assertMinorAmount, assertOptionalMinorAmount } from "../money";
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
  MockGatewayConfig,
} from "../types";
import {
  PAYMENT_PLUGIN_VERSION,
  PaymentGatewayName,
} from "../types";

/**
 * In-memory gateway for development and tests.
 * No external network calls.
 */
export class MockPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly name = PaymentGatewayName.Mock;

  private readonly authorizations = new Map<string, PaymentAuthorizationResult>();
  private readonly payments = new Map<string, PaymentCaptureResult>();
  private readonly refunds = new Map<string, PaymentRefundResult>();
  private seq = 0;

  constructor(private readonly config: MockGatewayConfig) {}

  async authorizePayment(
    context: PaymentContext,
  ): Promise<PaymentAuthorizationResult> {
    assertMinorAmount(context.amount);
    const authorizationId = this.nextId("auth");
    const currency = context.currency || this.config.defaultCurrency;
    const result: PaymentAuthorizationResult = {
      authorizationId,
      paymentId: null,
      provider: this.name,
      amount: context.amount,
      currency,
      status: "authorized",
      receipt: context.receipt ?? null,
      metadata: this.mergeMetadata(context),
      clientHints: {
        provider: this.name,
        publicKey: "mock_public_key",
      },
      occurredAt: new Date(),
    };
    this.authorizations.set(authorizationId, result);
    return result;
  }

  async capturePayment(context: PaymentContext): Promise<PaymentCaptureResult> {
    assertMinorAmount(context.amount);
    const paymentId = context.paymentId || this.nextId("pay");
    const currency = context.currency || this.config.defaultCurrency;
    const result: PaymentCaptureResult = {
      paymentId,
      authorizationId: context.authorizationId ?? null,
      provider: this.name,
      amount: context.amount,
      currency,
      status: "captured",
      method: "mock",
      metadata: this.mergeMetadata(context),
      occurredAt: new Date(),
    };
    this.payments.set(paymentId, result);

    if (context.authorizationId) {
      const auth = this.authorizations.get(context.authorizationId);
      if (auth) {
        this.authorizations.set(context.authorizationId, {
          ...auth,
          paymentId,
          status: "captured",
        });
      }
    }

    return result;
  }

  async cancelPayment(context: PaymentContext): Promise<PaymentCancelResult> {
    if (context.authorizationId) {
      const auth = this.authorizations.get(context.authorizationId);
      if (auth) {
        this.authorizations.set(context.authorizationId, {
          ...auth,
          status: "cancelled",
        });
      }
    }
    return {
      paymentId: context.paymentId ?? null,
      authorizationId: context.authorizationId ?? null,
      provider: this.name,
      status: "cancelled",
      metadata: this.mergeMetadata(context),
      occurredAt: new Date(),
    };
  }

  async refundPayment(context: PaymentContext): Promise<PaymentRefundResult> {
    if (!context.paymentId) {
      throw new PaymentUnsupportedError("refundPayment requires paymentId");
    }
    assertOptionalMinorAmount(context.amount);
    const payment = this.payments.get(context.paymentId);
    const amount = context.amount ?? payment?.amount ?? 0;
    const refundId = this.nextId("rfnd");
    const result: PaymentRefundResult = {
      refundId,
      paymentId: context.paymentId,
      provider: this.name,
      amount,
      currency: payment?.currency || this.config.defaultCurrency,
      status: context.partial ? "partially_refunded" : "refunded",
      metadata: this.mergeMetadata(context),
      occurredAt: new Date(),
    };
    this.refunds.set(refundId, result);
    if (payment && !context.partial) {
      this.payments.set(context.paymentId, {
        ...payment,
        status: "refunded",
      });
    }
    return result;
  }

  async fetchPayment(context: PaymentContext): Promise<PaymentFetchResult> {
    if (context.paymentId && this.payments.has(context.paymentId)) {
      const p = this.payments.get(context.paymentId)!;
      return {
        paymentId: p.paymentId,
        authorizationId: p.authorizationId,
        provider: this.name,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        method: p.method,
        metadata: p.metadata,
        occurredAt: p.occurredAt,
      };
    }
    if (
      context.authorizationId &&
      this.authorizations.has(context.authorizationId)
    ) {
      const a = this.authorizations.get(context.authorizationId)!;
      return {
        paymentId: a.paymentId,
        authorizationId: a.authorizationId,
        provider: this.name,
        amount: a.amount,
        currency: a.currency,
        status: a.status,
        method: null,
        metadata: a.metadata,
        occurredAt: a.occurredAt,
      };
    }
    return {
      paymentId: context.paymentId ?? null,
      authorizationId: context.authorizationId ?? null,
      provider: this.name,
      amount: 0,
      currency: this.config.defaultCurrency,
      status: "unknown",
      method: null,
      metadata: {},
      occurredAt: null,
    };
  }

  async verifySignature(
    input: PaymentSignatureInput,
  ): Promise<PaymentSignatureResult> {
    const expected = this.sign(input.payload);
    const valid =
      input.signature === expected || input.signature === "mock-valid";
    return { valid, provider: this.name };
  }

  async parseWebhook(input: ParseWebhookInput): Promise<ParsedWebhookPayload> {
    const body =
      typeof input.body === "string"
        ? (JSON.parse(input.body) as Record<string, unknown>)
        : input.body;

    return {
      provider: this.name,
      providerEvent:
        typeof body.event === "string" ? body.event : "payment.captured",
      body,
      headers: input.headers,
    };
  }

  async normalizeWebhookEvent(
    parsed: ParsedWebhookPayload,
    options?: { eventId?: string },
  ): Promise<NormalizedPaymentEvent> {
    const entity = this.extractEntity(parsed.body);
    const event = this.mapEventType(parsed.providerEvent);

    return {
      eventId:
        options?.eventId ||
        (typeof parsed.body.id === "string"
          ? parsed.body.id
          : this.nextId("evt")),
      provider: this.name,
      event,
      paymentId: entity.paymentId,
      authorizationId: entity.authorizationId,
      refundId: entity.refundId,
      amount: entity.amount,
      currency: entity.currency,
      status: entity.status,
      metadata: entity.metadata,
      occurredAt: new Date(),
      raw: parsed.body,
    };
  }

  capabilities(): PaymentGatewayCapabilities {
    return {
      authorize: true,
      capture: true,
      cancel: true,
      refund: true,
      partialRefund: true,
      partialCapture: true,
      webhook: true,
      subscriptions: true,
      upi: true,
      cards: true,
      netBanking: true,
      wallets: true,
    };
  }

  async health(): Promise<PaymentHealthReport> {
    const caps = this.capabilities();
    return {
      provider: this.name,
      mode: "mock",
      configured: true,
      healthy: true,
      supportsRefund: caps.refund,
      supportsWebhook: caps.webhook,
      supportsPartialRefund: caps.partialRefund,
      version: PAYMENT_PLUGIN_VERSION,
      message: "Mock payment gateway is healthy",
      checkedAt: new Date(),
      details: {
        authorizations: this.authorizations.size,
        payments: this.payments.size,
        refunds: this.refunds.size,
      },
    };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private nextId(prefix: string): string {
    if (this.config.stableIds) {
      this.seq += 1;
      return `mock_${prefix}_${String(this.seq).padStart(8, "0")}`;
    }
    return `mock_${prefix}_${randomBytes(8).toString("hex")}`;
  }

  private sign(payload: string): string {
    return createHash("sha256").update(`mock|${payload}`).digest("hex");
  }

  private mergeMetadata(context: PaymentContext): PaymentMetadata {
    return {
      ...(context.metadata || {}),
      invoiceId: context.invoiceId,
      tripId: context.tripId,
      customerId: context.customerId,
      driverId: context.driverId,
      vendorId: context.vendorId,
      requestId: context.requestId,
      paymentType: context.paymentType,
    };
  }

  private mapEventType(providerEvent: string | null): NormalizedPaymentEventType {
    switch (String(providerEvent || "").toLowerCase()) {
      case "payment.authorized":
        return "payment.authorized";
      case "payment.captured":
      case "order.paid":
        return "payment.captured";
      case "payment.failed":
        return "payment.failed";
      case "payment.cancelled":
        return "payment.cancelled";
      case "refund.processed":
        return "refund.processed";
      case "refund.failed":
        return "refund.failed";
      default:
        return "unknown";
    }
  }

  private extractEntity(body: Record<string, unknown>): {
    paymentId: string | null;
    authorizationId: string | null;
    refundId: string | null;
    amount: number | null;
    currency: string | null;
    status: PaymentStatus;
    metadata: PaymentMetadata;
  } {
    const nested =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : body;
    const payment =
      nested.payment && typeof nested.payment === "object"
        ? (nested.payment as Record<string, unknown>)
        : nested;
    const entity =
      payment.entity && typeof payment.entity === "object"
        ? (payment.entity as Record<string, unknown>)
        : payment;

    return {
      paymentId:
        typeof entity.paymentId === "string"
          ? entity.paymentId
          : typeof entity.id === "string"
            ? entity.id
            : null,
      authorizationId:
        typeof entity.authorizationId === "string"
          ? entity.authorizationId
          : typeof entity.order_id === "string"
            ? entity.order_id
            : null,
      refundId:
        typeof entity.refundId === "string" ? entity.refundId : null,
      amount: typeof entity.amount === "number" ? entity.amount : null,
      currency: typeof entity.currency === "string" ? entity.currency : null,
      status: "captured",
      metadata: {},
    };
  }
}

/** @deprecated Prefer MockPaymentGatewayAdapter */
export const MockPaymentProvider = MockPaymentGatewayAdapter;
