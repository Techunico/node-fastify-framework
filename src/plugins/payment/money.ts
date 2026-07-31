import { PaymentInvalidAmountError } from "./errors";
import type { PaymentAmountMinor } from "./types";

/**
 * Money helpers — minor units only, integer arithmetic.
 * The plugin owns any future major↔minor conversion at the adapter edge.
 */

export function assertMinorAmount(
  amount: PaymentAmountMinor | undefined,
  field = "amount",
): asserts amount is PaymentAmountMinor {
  if (amount === undefined || amount === null) {
    throw new PaymentInvalidAmountError(`${field} is required`);
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PaymentInvalidAmountError(
      `${field} must be a positive integer in minor currency units (no floats)`,
    );
  }
}

export function assertOptionalMinorAmount(
  amount: PaymentAmountMinor | undefined,
  field = "amount",
): void {
  if (amount === undefined || amount === null) return;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new PaymentInvalidAmountError(
      `${field} must be a positive integer in minor currency units (no floats)`,
    );
  }
}

/** Coerce provider numeric/string amounts to minor integers safely. */
export function toMinorInteger(value: unknown): PaymentAmountMinor {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    // Reject floats that are not whole minor units.
    if (!Number.isInteger(value)) {
      throw new PaymentInvalidAmountError(
        "Provider returned a non-integer amount; refusing float money",
      );
    }
    return value;
  }
  throw new PaymentInvalidAmountError("Invalid money amount from provider");
}
