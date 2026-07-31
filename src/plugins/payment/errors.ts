import { PaymentGatewayName } from "./types";

export enum PaymentErrorCode {
  Payment = "PAYMENT_ERROR",
  Gateway = "PAYMENT_GATEWAY_ERROR",
  InvalidAmount = "PAYMENT_INVALID_AMOUNT",
  InvalidSignature = "PAYMENT_INVALID_SIGNATURE",
  NotConfigured = "PAYMENT_NOT_CONFIGURED",
  Unsupported = "PAYMENT_UNSUPPORTED_OPERATION",
  UnknownGateway = "PAYMENT_UNKNOWN_GATEWAY",
  Timeout = "PAYMENT_GATEWAY_TIMEOUT",
}

/** Base class for all public payment failures. */
export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: PaymentErrorCode = PaymentErrorCode.Payment,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class PaymentGatewayError extends PaymentError {
  constructor(
    message: string,
    public readonly gateway: PaymentGatewayName,
    cause?: unknown,
  ) {
    super(message, PaymentErrorCode.Gateway, cause);
  }
}

export class PaymentInvalidAmountError extends PaymentError {
  constructor(
    message = "Payment amount must be a positive integer in minor currency units (e.g. paise)",
  ) {
    super(message, PaymentErrorCode.InvalidAmount);
  }
}

export class PaymentInvalidSignatureError extends PaymentError {
  constructor(message = "Payment signature verification failed") {
    super(message, PaymentErrorCode.InvalidSignature);
  }
}

export class PaymentNotConfiguredError extends PaymentError {
  constructor(message: string) {
    super(message, PaymentErrorCode.NotConfigured);
  }
}

export class PaymentUnsupportedError extends PaymentError {
  constructor(
    message: string,
    public readonly gateway?: PaymentGatewayName,
  ) {
    super(message, PaymentErrorCode.Unsupported);
  }
}

export class PaymentUnknownGatewayError extends PaymentError {
  constructor(provider: string) {
    super(
      `Unknown payment gateway "${provider}"`,
      PaymentErrorCode.UnknownGateway,
    );
  }
}
