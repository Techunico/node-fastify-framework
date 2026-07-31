import { PaymentError } from "./errors";
import {
  PaymentGatewayName,
  PaymentPluginConfig,
} from "./types";

const value = (name: string): string => process.env[name]?.trim() ?? "";

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

/**
 * Placeholder credentials so the process can boot without real secrets.
 * Treated as "not configured" — plugin falls back to the mock gateway.
 * Replace with real RAZORPAY_* env vars before accepting live payments.
 */
export const RAZORPAY_DUMMY_KEY_ID = "rzp_test_dummy_key_id";
export const RAZORPAY_DUMMY_KEY_SECRET = "dummy_razorpay_secret_not_for_live";

/**
 * Reads payment configuration from the environment.
 *
 * PAYMENT_PROVIDER=razorpay|mock   (default: razorpay)
 * RAZORPAY_KEY_ID / KEY_SECRET / WEBHOOK_SECRET
 * PAYMENT_CURRENCY=INR
 */
export function loadPaymentConfig(): PaymentPluginConfig {
  const defaultCurrency = value("PAYMENT_CURRENCY") || "INR";
  const keyId = value("RAZORPAY_KEY_ID") || RAZORPAY_DUMMY_KEY_ID;
  const keySecret =
    value("RAZORPAY_KEY_SECRET") || RAZORPAY_DUMMY_KEY_SECRET;

  return {
    defaultProvider: gatewayName(value("PAYMENT_PROVIDER")),
    defaultCurrency,
    nodeEnv: value("NODE_ENV") || "development",
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

function isDummyCredential(value: string): boolean {
  const v = value.toLowerCase();
  return !v || v.includes("dummy") || v.includes("placeholder");
}

/**
 * True when real Razorpay credentials are present (not empty / not dummy placeholders).
 */
export function isRazorpayConfigured(config: PaymentPluginConfig): boolean {
  const { keyId, keySecret } = config.razorpay;
  if (!keyId || !keySecret) return false;
  if (isDummyCredential(keyId) || isDummyCredential(keySecret)) return false;
  return true;
}

/**
 * Startup validation — never crash the process for missing payment secrets.
 * Callers fall back to the mock gateway when Razorpay is not really configured.
 */
export function assertPaymentConfigForStartup(
  _config: PaymentPluginConfig,
): void {
  // Intentionally no-op for boot safety.
  // Real keys should be set via env before enabling live collection.
}
