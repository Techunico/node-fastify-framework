import { FastifyInstance, FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { PaymentGatewayAdapter } from "./adapter";
import {
  assertPaymentConfigForStartup,
  isRazorpayConfigured,
  loadPaymentConfig,
} from "./config";
import { PaymentError, PaymentNotConfiguredError } from "./errors";
import { MockPaymentGatewayAdapter } from "./providers/mock.provider";
import { RazorpayPaymentGatewayAdapter } from "./providers/razorpay.provider";
import { PaymentService } from "./service";
import {
  PaymentGatewayName,
  PaymentPluginConfig,
} from "./types";

export interface PaymentPluginOptions {
  config?: PaymentPluginConfig;
}

declare module "fastify" {
  interface FastifyInstance {
    /** Present when PLUGINS includes payment. */
    payment?: PaymentService;
  }
}

/**
 * Build the adapter registry.
 *
 * Fails closed in production: the mock gateway is never registered and the
 * selected Razorpay gateway must be fully configured. Outside production, a
 * default Razorpay gateway without credentials falls back to the mock gateway
 * with a warning so local development can boot without secrets.
 */
function buildAdapterRegistry(
  config: PaymentPluginConfig,
  log: FastifyInstance["log"],
): {
  adapters: Map<PaymentGatewayName, PaymentGatewayAdapter>;
  defaultProvider: PaymentGatewayName;
} {
  for (const warning of assertPaymentConfigForStartup(config)) {
    log.warn({ provider: PaymentGatewayName.Razorpay }, warning);
  }

  const production = config.nodeEnv === "production";
  const mockAllowed = config.allowMock && !production;
  const adapters = new Map<PaymentGatewayName, PaymentGatewayAdapter>();

  if (mockAllowed) {
    adapters.set(
      PaymentGatewayName.Mock,
      new MockPaymentGatewayAdapter(config.mock),
    );
  }

  if (isRazorpayConfigured(config)) {
    adapters.set(
      PaymentGatewayName.Razorpay,
      new RazorpayPaymentGatewayAdapter(config.razorpay),
    );
  }

  let defaultProvider = config.defaultProvider;

  if (
    defaultProvider === PaymentGatewayName.Razorpay &&
    !adapters.has(PaymentGatewayName.Razorpay) &&
    mockAllowed
  ) {
    log.warn(
      {
        provider: PaymentGatewayName.Razorpay,
        nodeEnv: config.nodeEnv,
        hint: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for real payments",
      },
      "Razorpay credentials missing — using the mock payment gateway (non-production only)",
    );
    defaultProvider = PaymentGatewayName.Mock;
  }

  if (
    defaultProvider !== PaymentGatewayName.Razorpay &&
    defaultProvider !== PaymentGatewayName.Mock
  ) {
    throw new PaymentError(
      `Unsupported default payment provider: ${String(defaultProvider)}`,
    );
  }

  if (!adapters.has(defaultProvider)) {
    throw new PaymentNotConfiguredError(
      defaultProvider === PaymentGatewayName.Mock
        ? "The mock payment gateway is not available in this environment"
        : `Default payment provider "${defaultProvider}" is not configured`,
    );
  }

  return { adapters, defaultProvider };
}

const registerPayment: FastifyPluginAsync<PaymentPluginOptions> = async (
  app: FastifyInstance,
  options: PaymentPluginOptions,
): Promise<void> => {
  const config = options.config ?? loadPaymentConfig(app.config.source);
  const { adapters, defaultProvider } = buildAdapterRegistry(config, app.log);

  const service = new PaymentService(adapters, defaultProvider, app.log);
  app.decorate("payment", service);

  const health = await service.health();
  app.log.info(
    {
      defaultProvider,
      registered: service.listGateways(),
      mode: health.mode,
      configured: health.configured,
      healthy: health.healthy,
      version: health.version,
    },
    "Payment plugin registered",
  );
};

/** Used by the plugin registry to validate PAYMENT_* / RAZORPAY_* only when the plugin is enabled. */
export const loadConfig = loadPaymentConfig;

/** Register with `await app.register(PaymentPlugin)`. */
export const PaymentPlugin = fp(registerPayment, { name: "payment" });
export default PaymentPlugin;
