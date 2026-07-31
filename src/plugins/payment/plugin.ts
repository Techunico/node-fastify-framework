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

// FastifyInstance.payment is declared optionally in src/types/fastify.d.ts

/**
 * Build the adapter registry.
 * Always registers Mock for optional routing { provider: "mock" }.
 * Registers Razorpay when credentials exist (or when selected as default after validation).
 */
function buildAdapterRegistry(
  config: PaymentPluginConfig,
  log: FastifyInstance["log"],
): {
  adapters: Map<PaymentGatewayName, PaymentGatewayAdapter>;
  defaultProvider: PaymentGatewayName;
} {
  const adapters = new Map<PaymentGatewayName, PaymentGatewayAdapter>();

  // Mock is always available for tests / explicit routing.
  adapters.set(
    PaymentGatewayName.Mock,
    new MockPaymentGatewayAdapter(config.mock),
  );

  let defaultProvider = config.defaultProvider;

  if (config.defaultProvider === PaymentGatewayName.Razorpay) {
    assertPaymentConfigForStartup(config);

    if (isRazorpayConfigured(config)) {
      adapters.set(
        PaymentGatewayName.Razorpay,
        new RazorpayPaymentGatewayAdapter(config.razorpay),
      );
    } else {
      // Missing or dummy keys: never crash boot — use mock until real secrets exist.
      log.warn(
        {
          provider: PaymentGatewayName.Razorpay,
          nodeEnv: config.nodeEnv,
          hint: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for live payments",
        },
        "Razorpay credentials missing or dummy — defaulting to mock payment gateway",
      );
      defaultProvider = PaymentGatewayName.Mock;
    }
  } else if (config.defaultProvider === PaymentGatewayName.Mock) {
    defaultProvider = PaymentGatewayName.Mock;
  } else {
    throw new PaymentError(
      `Unsupported default payment provider: ${String(config.defaultProvider)}`,
    );
  }

  // If Razorpay is configured but not default, still register for multi-provider routing.
  if (
    isRazorpayConfigured(config) &&
    !adapters.has(PaymentGatewayName.Razorpay)
  ) {
    try {
      adapters.set(
        PaymentGatewayName.Razorpay,
        new RazorpayPaymentGatewayAdapter(config.razorpay),
      );
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : err },
        "Optional Razorpay adapter registration skipped",
      );
    }
  }

  if (!adapters.has(defaultProvider)) {
    throw new PaymentNotConfiguredError(
      `Default payment provider "${defaultProvider}" is not registered`,
    );
  }

  return { adapters, defaultProvider };
}

const registerPayment: FastifyPluginAsync<PaymentPluginOptions> = async (
  app: FastifyInstance,
  options: PaymentPluginOptions,
): Promise<void> => {
  const config = options.config ?? loadPaymentConfig();
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

/** Register with `await app.register(PaymentPlugin)`. */
export const PaymentPlugin = fp(registerPayment, { name: "payment" });
export default PaymentPlugin;
