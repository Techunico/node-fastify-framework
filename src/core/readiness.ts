export type ReadinessCheck = () => Promise<void>;

export interface ReadinessResult {
  status: "ok" | "fail";
  message?: string;
}

/**
 * Readiness checks contributed by plugins (database, redis, …).
 * `/ready` runs every check with a timeout so an unreachable dependency
 * cannot hang the probe.
 */
export class ReadinessRegistry {
  private readonly checks = new Map<string, ReadinessCheck>();

  constructor(private readonly timeoutMs = 2_000) {}

  add(name: string, check: ReadinessCheck): void {
    if (this.checks.has(name)) {
      throw new Error(`Readiness check "${name}" is already registered`);
    }
    this.checks.set(name, check);
  }

  names(): string[] {
    return [...this.checks.keys()];
  }

  async run(): Promise<{ ready: boolean; checks: Record<string, ReadinessResult>; errors: Record<string, unknown> }> {
    const checks: Record<string, ReadinessResult> = {};
    const errors: Record<string, unknown> = {};

    await Promise.all(
      [...this.checks.entries()].map(async ([name, check]) => {
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            check(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error(`timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
            }),
          ]);
          checks[name] = { status: "ok" };
        } catch (error) {
          errors[name] = error;
          checks[name] = { status: "fail", message: `${name} unreachable` };
        } finally {
          if (timer) clearTimeout(timer);
        }
      }),
    );

    return { ready: Object.values(checks).every((c) => c.status === "ok"), checks, errors };
  }
}
