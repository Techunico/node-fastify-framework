import { PaymentError, PaymentNotConfiguredError } from "./errors";
import {
  PaymentGatewayName,
  PaymentPluginConfig,
} from "./types";

const gatewayName = (raw: string): PaymentGatewayName => {
  const normalized = raw.toLowerCase();
  if (
    normalized === PaymentGatewayName.Razorpay ||
    normalized === PaymentGatewayName.Mock
  ) {
    return normalized;
  }
  if (!normalized) return PaymentGatewayName.Razorpay;
  throw new PaymentError(
    `PAYMENT_PROVIDER must be one of: razorpay, mock (got "${raw}")`,
  );
};

const razorpayMode = (keyId: string): "live" | "test" => {
  if (keyId.startsWith("rzp_live_")) return "live";
  return "test";
};

const RAZORPAY_KEY_ID_FORMAT = /^rzp_(live|test)_[A-Za-z0-9]+$/;

/**
 * Reads payment configuration from an environment record.
 *
 * PAYMENT_PROVIDER=razorpay|mock   (default: razorpay)
 * RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET
 * PAYMENT_CURRENCY=INR
 *
 * The mock gateway is only allowed outside production.
 */
export function loadPaymentConfig(env: Readonly<Record<string, string | undefined>>): PaymentPluginConfig {
  const value = (name: string): string => env[name]?.trim() ?? "";
  const defaultCurrency = value("PAYMENT_CURRENCY") || "INR";
  const keyId = value("RAZORPAY_KEY_ID");
  const keySecret = value("RAZORPAY_KEY_SECRET");
  const nodeEnv = value("NODE_ENV") || "development";

  return {
    defaultProvider: gatewayName(value("PAYMENT_PROVIDER")),
    defaultCurrency,
    nodeEnv,
    allowMock: nodeEnv !== "production",
    razorpay: {
      keyId,
      keySecret,
      webhookSecret: value("RAZORPAY_WEBHOOK_SECRET"),
      defaultCurrency,
      mode: razorpayMode(keyId),
    },
    mock: {
      defaultCurrency,
      stableIds: value("PAYMENT_MOCK_STABLE_IDS") === "true",
    },
  };
}

function isPlaceholderCredential(value: string): boolean {
  const v = value.toLowerCase();
  return !v || v.includes("dummy") || v.includes("placeholder") || v.includes("changeme");
}

/**
 * True when real-looking Razorpay credentials are present (not empty, not
 * placeholders, key id in Razorpay's `rzp_live_…` / `rzp_test_…` format).
 */
export function isRazorpayConfigured(config: PaymentPluginConfig): boolean {
  const { keyId, keySecret } = config.razorpay;
  if (isPlaceholderCredential(keyId) || isPlaceholderCredential(keySecret)) return false;
  return RAZORPAY_KEY_ID_FORMAT.test(keyId);
}

/**
 * Startup validation. Fails closed in production:
 * - the mock gateway can never be enabled or selected;
 * - the selected Razorpay gateway must have valid credentials.
 *
 * Returns non-fatal warnings for the caller to log. Error messages name the
 * variables involved, never their values.
 */
export function assertPaymentConfigForStartup(config: PaymentPluginConfig): string[] {
  const warnings: string[] = [];
  const production = config.nodeEnv === "production";
  const { keyId, keySecret, webhookSecret } = config.razorpay;

  if (production && config.allowMock) {
    throw new PaymentNotConfiguredError(
      "The mock payment gateway cannot be enabled when NODE_ENV=production",
    );
  }

  if (production && config.defaultProvider === PaymentGatewayName.Mock) {
    throw new PaymentNotConfiguredError(
      "PAYMENT_PROVIDER=mock is not allowed when NODE_ENV=production",
    );
  }

  // Validate Razorpay credentials when they are required (production default
  // provider) or when any of them was supplied (catches typos early).
  const credentialsSupplied = Boolean(keyId || keySecret);
  const credentialsRequired =
    production && config.defaultProvider === PaymentGatewayName.Razorpay;

  if (credentialsRequired || credentialsSupplied) {
    const problems: string[] = [];
    if (!keyId) problems.push("RAZORPAY_KEY_ID is missing");
    else if (isPlaceholderCredential(keyId) || !RAZORPAY_KEY_ID_FORMAT.test(keyId)) {
      problems.push("RAZORPAY_KEY_ID must look like rzp_live_… or rzp_test_…");
    }
    if (!keySecret) problems.push("RAZORPAY_KEY_SECRET is missing");
    else if (isPlaceholderCredential(keySecret)) {
      problems.push("RAZORPAY_KEY_SECRET is a placeholder value");
    }

    if (problems.length && production) {
      throw new PaymentNotConfiguredError(
        `Razorpay is not configured: ${problems.join("; ")}`,
      );
    }
    if (problems.length) {
      warnings.push(`Razorpay credentials are incomplete (${problems.join("; ")})`);
    }
  }

  if (production && config.defaultProvider === PaymentGatewayName.Razorpay && !webhookSecret) {
    warnings.push("RAZORPAY_WEBHOOK_SECRET is not set; webhook verification will be rejected");
  }

  return warnings;
}
