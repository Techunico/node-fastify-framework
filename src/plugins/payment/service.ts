import type { FastifyBaseLogger } from "fastify";
import type { PaymentGatewayAdapter } from "./adapter";
import {
  PaymentInvalidSignatureError,
  PaymentUnknownGatewayError,
  PaymentUnsupportedError,
} from "./errors";
import { assertMinorAmount, assertOptionalMinorAmount } from "./money";
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
  PaymentRoutingOptions,
  PaymentSignatureInput,
  PaymentSignatureResult,
  VerifyWebhookInput,
} from "./types";
import { PaymentGatewayName as Gateway } from "./types";

/**
 * PaymentService — sole public surface for business modules (`app.payment`).
 *
 * Translates business actions → gateway adapters.
 * Never exposes Razorpay/Stripe concepts (orders, PaymentIntents, …).
 */
export class PaymentService {
  constructor(
    private readonly adapters: Map<PaymentGatewayName, PaymentGatewayAdapter>,
    private readonly defaultProvider: PaymentGatewayName,
    private readonly log?: FastifyBaseLogger,
  ) {}

  /** Configured default gateway name. */
  get providerName(): PaymentGatewayName {
    return this.defaultProvider;
  }

  /** All registered gateway names (for multi-provider routing UIs). */
  listGateways(): PaymentGatewayName[] {
    return Array.from(this.adapters.keys());
  }

  //====================================================
  // Business operations
  //====================================================

  /**
   * Authorize / create a payment intent for later capture or client checkout.
   * Internally Razorpay creates an order; callers only see authorizationId.
   */
  async authorizePayment(
    context: PaymentContext,
    options: PaymentRoutingOptions = {},
  ): Promise<PaymentAuthorizationResult> {
    assertMinorAmount(context.amount);
    const adapter = this.resolve(options.provider);
    this.correlate("authorizePayment", adapter.name, context);
    return adapter.authorizePayment(this.withDefaults(context));
  }

  async capturePayment(
    context: PaymentContext,
    options: PaymentRoutingOptions = {},
  ): Promise<PaymentCaptureResult> {
    assertMinorAmount(context.amount);
    if (!context.paymentId) {
      throw new PaymentUnsupportedError(
        "capturePayment requires context.paymentId",
      );
    }
    const adapter = this.resolve(options.provider);
    this.correlate("capturePayment", adapter.name, context);
    return adapter.capturePayment(this.withDefaults(context));
  }

  async cancelPayment(
    context: PaymentContext,
    options: PaymentRoutingOptions = {},
  ): Promise<PaymentCancelResult> {
    const adapter = this.resolve(options.provider);
    if (!adapter.capabilities().cancel) {
      throw new PaymentUnsupportedError(
        `Gateway ${adapter.name} does not support cancelPayment`,
        adapter.name,
      );
    }
    this.correlate("cancelPayment", adapter.name, context);
    return adapter.cancelPayment(this.withDefaults(context));
  }

  async refundPayment(
    context: PaymentContext,
    options: PaymentRoutingOptions = {},
  ): Promise<PaymentRefundResult> {
    if (!context.paymentId) {
      throw new PaymentUnsupportedError(
        "refundPayment requires context.paymentId",
      );
    }
    assertOptionalMinorAmount(context.amount);
    const adapter = this.resolve(options.provider);
    const caps = adapter.capabilities();
    if (!caps.refund) {
      throw new PaymentUnsupportedError(
        `Gateway ${adapter.name} does not support refunds`,
        adapter.name,
      );
    }
    if (context.partial && !caps.partialRefund) {
      throw new PaymentUnsupportedError(
        `Gateway ${adapter.name} does not support partial refunds`,
        adapter.name,
      );
    }
    this.correlate("refundPayment", adapter.name, context);
    return adapter.refundPayment(this.withDefaults(context));
  }

  async fetchPayment(
    context: PaymentContext,
    options: PaymentRoutingOptions = {},
  ): Promise<PaymentFetchResult> {
    if (!context.paymentId && !context.authorizationId) {
      throw new PaymentUnsupportedError(
        "fetchPayment requires context.paymentId or context.authorizationId",
      );
    }
    const adapter = this.resolve(options.provider);
    this.correlate("fetchPayment", adapter.name, context);
    return adapter.fetchPayment(this.withDefaults(context));
  }

  //====================================================
  // Webhooks (split responsibilities)
  //====================================================

  async verifySignature(
    input: PaymentSignatureInput,
  ): Promise<PaymentSignatureResult> {
    const adapter = this.resolve(input.provider);
    return adapter.verifySignature(input);
  }

  async parseWebhook(input: ParseWebhookInput): Promise<ParsedWebhookPayload> {
    const adapter = this.resolve(input.provider);
    return adapter.parseWebhook(input);
  }

  async normalizeWebhookEvent(
    parsed: ParsedWebhookPayload,
    options?: { eventId?: string; provider?: PaymentGatewayName | string },
  ): Promise<NormalizedPaymentEvent> {
    const adapter = this.resolve(options?.provider ?? parsed.provider);
    return adapter.normalizeWebhookEvent(parsed, {
      eventId: options?.eventId,
    });
  }

  /**
   * Convenience: verify → parse → normalize.
   * Preferred entry for webhook controllers.
   */
  async verifyWebhook(input: VerifyWebhookInput): Promise<NormalizedPaymentEvent> {
    const adapter = this.resolve(input.provider);
    const bodyString =
      typeof input.body === "string" ? input.body : JSON.stringify(input.body);

    const signature = await adapter.verifySignature({
      payload: bodyString,
      signature: input.signature,
      purpose: "webhook",
    });

    if (!signature.valid) {
      throw new PaymentInvalidSignatureError(
        "Payment webhook signature verification failed",
      );
    }

    const parsed = await adapter.parseWebhook({
      body: input.body,
      headers: input.headers,
    });

    return adapter.normalizeWebhookEvent(parsed, {
      eventId: input.eventId,
    });
  }

  //====================================================
  // Capabilities & health
  //====================================================

  capabilities(
    options: PaymentRoutingOptions = {},
  ): PaymentGatewayCapabilities {
    return this.resolve(options.provider).capabilities();
  }

  async health(
    options: PaymentRoutingOptions = {},
  ): Promise<PaymentHealthReport> {
    return this.resolve(options.provider).health();
  }

  /** Health for every registered gateway (ops dashboard). */
  async healthAll(): Promise<PaymentHealthReport[]> {
    const reports: PaymentHealthReport[] = [];
    for (const adapter of this.adapters.values()) {
      reports.push(await adapter.health());
    }
    return reports;
  }

  //====================================================
  // Backward-compatible aliases (v1 method names)
  // Prefer authorizePayment / capturePayment / refundPayment going forward.
  //====================================================

  /** @deprecated Use authorizePayment */
  createOrder(
    context: PaymentContext,
    options?: PaymentRoutingOptions,
  ): Promise<PaymentAuthorizationResult> {
    return this.authorizePayment(context, options);
  }

  /** @deprecated Use capturePayment */
  capture(
    context: PaymentContext,
    options?: PaymentRoutingOptions,
  ): Promise<PaymentCaptureResult> {
    return this.capturePayment(context, options);
  }

  /** @deprecated Use refundPayment */
  refund(
    context: PaymentContext,
    options?: PaymentRoutingOptions,
  ): Promise<PaymentRefundResult> {
    return this.refundPayment(context, options);
  }

  /** @deprecated Use fetchPayment */
  fetchOrder(
    context: PaymentContext,
    options?: PaymentRoutingOptions,
  ): Promise<PaymentFetchResult> {
    return this.fetchPayment(context, options);
  }

  //====================================================
  // Internals
  //====================================================

  private resolve(
    provider?: PaymentGatewayName | string,
  ): PaymentGatewayAdapter {
    const name = this.normalizeGatewayName(provider ?? this.defaultProvider);
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new PaymentUnknownGatewayError(String(provider ?? name));
    }
    return adapter;
  }

  private normalizeGatewayName(
    value: PaymentGatewayName | string,
  ): PaymentGatewayName {
    const raw = String(value).toLowerCase();
    if (raw === Gateway.Razorpay || raw === Gateway.Mock) {
      return raw;
    }
    throw new PaymentUnknownGatewayError(raw);
  }

  private withDefaults(context: PaymentContext): PaymentContext {
    return {
      ...context,
      metadata: { ...(context.metadata || {}) },
    };
  }

  /**
   * Structured correlation log for every outbound gateway call.
   * Includes requestId, invoiceId, tripId, paymentId, provider.
   */
  private correlate(
    operation: string,
    provider: PaymentGatewayName,
    context: PaymentContext,
  ): void {
    this.log?.info?.(
      {
        event: "payment.gateway_request",
        operation,
        provider,
        requestId: context.requestId ?? null,
        invoiceId: context.invoiceId ?? null,
        tripId: context.tripId ?? null,
        paymentId: context.paymentId ?? null,
        authorizationId: context.authorizationId ?? null,
        customerId: context.customerId ?? null,
        vendorId: context.vendorId ?? null,
        amount: context.amount ?? null,
        currency: context.currency ?? null,
        paymentType: context.paymentType ?? null,
      },
      `payment.${operation}`,
    );
  }
}
