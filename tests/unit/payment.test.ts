import { createHmac } from "crypto";
import { Writable } from "stream";
import Fastify, { FastifyInstance } from "fastify";
import PaymentPlugin from "@/plugins/payment/plugin";
import { assertPaymentConfigForStartup, loadPaymentConfig } from "@/plugins/payment/config";
import { MockPaymentGatewayAdapter } from "@/plugins/payment/providers/mock.provider";
import { RazorpayPaymentGatewayAdapter } from "@/plugins/payment/providers/razorpay.provider";
import { PaymentGatewayName, PaymentPluginConfig } from "@/plugins/payment/types";

const KEY_ID = "rzp_test_ABCdef123456";
const KEY_SECRET = "razorpay-key-secret-value-for-tests";
const WEBHOOK_SECRET = "razorpay-webhook-secret-value-for-tests";

function config(env: Record<string, string>): PaymentPluginConfig {
  return loadPaymentConfig(env as NodeJS.ProcessEnv);
}

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, stream };
}

async function start(cfg: PaymentPluginConfig, logs = captureLogs()) {
  const app = Fastify({ logger: { level: "info", stream: logs.stream } });
  await app.register(PaymentPlugin, { config: cfg });
  await app.ready();
  return app;
}

describe("payment configuration — production", () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("fails to start without Razorpay credentials", async () => {
    const cfg = config({ NODE_ENV: "production", PAYMENT_PROVIDER: "razorpay" });
    await expect(start(cfg)).rejects.toThrow(/RAZORPAY_KEY_ID is missing/);
  });

  it("fails to start with placeholder or malformed credentials", async () => {
    await expect(
      start(config({ NODE_ENV: "production", RAZORPAY_KEY_ID: "rzp_test_dummy_key_id", RAZORPAY_KEY_SECRET: "dummy_razorpay_secret_not_for_live" })),
    ).rejects.toThrow(/Razorpay is not configured/);
    await expect(
      start(config({ NODE_ENV: "production", RAZORPAY_KEY_ID: "not-a-key", RAZORPAY_KEY_SECRET: KEY_SECRET })),
    ).rejects.toThrow(/rzp_live_/);
  });

  it("refuses PAYMENT_PROVIDER=mock", async () => {
    await expect(start(config({ NODE_ENV: "production", PAYMENT_PROVIDER: "mock" }))).rejects.toThrow(
      /mock is not allowed/,
    );
  });

  it("refuses a config object that enables the mock gateway", async () => {
    const cfg = { ...config({ NODE_ENV: "production", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET }), allowMock: true };
    await expect(start(cfg)).rejects.toThrow(/cannot be enabled/);
  });

  it("starts with valid credentials and never registers the mock gateway", async () => {
    const app = await start(
      config({ NODE_ENV: "production", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET, RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET }),
    );
    apps.push(app);
    expect(app.payment?.listGateways()).toEqual([PaymentGatewayName.Razorpay]);
    await expect(
      app.payment!.verifySignature({ payload: "x", signature: "mock-valid", provider: "mock" }),
    ).rejects.toThrow();
  });

  it("does not log credential values", async () => {
    const logs = captureLogs();
    const app = await start(
      config({ NODE_ENV: "production", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET }),
      logs,
    );
    apps.push(app);
    const output = logs.lines.join("");
    expect(output).toContain("Payment plugin registered");
    expect(output).not.toContain(KEY_SECRET);
    expect(output).toContain("RAZORPAY_WEBHOOK_SECRET is not set");

    // Errors name variables, not values.
    try {
      assertPaymentConfigForStartup(config({ NODE_ENV: "production", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: "placeholder-secret" }));
    } catch (error) {
      expect(String(error)).not.toContain("placeholder-secret");
    }
  });
});

describe("payment configuration — development", () => {
  it("falls back to the mock gateway with a warning when credentials are missing", async () => {
    const logs = captureLogs();
    const app = await start(config({ NODE_ENV: "development" }), logs);
    expect(app.payment?.listGateways()).toEqual([PaymentGatewayName.Mock]);
    expect(logs.lines.join("")).toContain("using the mock payment gateway");
    await app.close();
  });

  it("registers both gateways when credentials exist", async () => {
    const app = await start(
      config({ NODE_ENV: "development", RAZORPAY_KEY_ID: KEY_ID, RAZORPAY_KEY_SECRET: KEY_SECRET }),
    );
    expect(app.payment?.listGateways().sort()).toEqual(
      [PaymentGatewayName.Mock, PaymentGatewayName.Razorpay].sort(),
    );
    await app.close();
  });
});

describe("mock gateway signatures", () => {
  it("no longer accepts the magic 'mock-valid' signature or the old unkeyed hash", async () => {
    const mock = new MockPaymentGatewayAdapter({ defaultCurrency: "INR", stableIds: false });
    const { createHash } = await import("crypto");
    const legacy = createHash("sha256").update("mock|payload").digest("hex");

    expect((await mock.verifySignature({ payload: "payload", signature: "mock-valid" })).valid).toBe(false);
    expect((await mock.verifySignature({ payload: "payload", signature: legacy })).valid).toBe(false);
  });

  it("accepts signatures produced by signForTesting on the same instance only", async () => {
    const mock = new MockPaymentGatewayAdapter({ defaultCurrency: "INR", stableIds: false });
    const other = new MockPaymentGatewayAdapter({ defaultCurrency: "INR", stableIds: false });
    const signature = mock.signForTesting("payload");

    expect((await mock.verifySignature({ payload: "payload", signature })).valid).toBe(true);
    expect((await other.verifySignature({ payload: "payload", signature })).valid).toBe(false);
  });
});

describe("Razorpay webhook verification", () => {
  const adapter = new RazorpayPaymentGatewayAdapter({
    keyId: KEY_ID,
    keySecret: KEY_SECRET,
    webhookSecret: WEBHOOK_SECRET,
    defaultCurrency: "INR",
    mode: "test",
  });
  const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", amount: 100, currency: "INR" } } } });
  const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("hex");

  it("accepts the HMAC-SHA256 of the raw body with the webhook secret", async () => {
    const result = await adapter.verifySignature({ payload: body, signature: sign(body, WEBHOOK_SECRET), purpose: "webhook" });
    expect(result.valid).toBe(true);
  });

  it("rejects signatures made with the key secret, a tampered body, or garbage", async () => {
    const valid = sign(body, WEBHOOK_SECRET);
    expect((await adapter.verifySignature({ payload: body, signature: sign(body, KEY_SECRET), purpose: "webhook" })).valid).toBe(false);
    expect((await adapter.verifySignature({ payload: `${body} `, signature: valid, purpose: "webhook" })).valid).toBe(false);
    expect((await adapter.verifySignature({ payload: body, signature: "mock-valid", purpose: "webhook" })).valid).toBe(false);
  });

  it("verifies checkout signatures with the key secret", async () => {
    const payload = "order_1|pay_1";
    expect((await adapter.verifySignature({ payload, signature: sign(payload, KEY_SECRET), purpose: "checkout" })).valid).toBe(true);
  });

  it("refuses webhook verification when no webhook secret is configured", async () => {
    const noWebhook = new RazorpayPaymentGatewayAdapter({
      keyId: KEY_ID, keySecret: KEY_SECRET, webhookSecret: "", defaultCurrency: "INR", mode: "test",
    });
    await expect(
      noWebhook.verifySignature({ payload: body, signature: "x", purpose: "webhook" }),
    ).rejects.toThrow(/RAZORPAY_WEBHOOK_SECRET/);
  });
});
