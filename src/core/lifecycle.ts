import type { FastifyInstance } from "fastify";

export interface ShutdownOptions {
  /** Force exit if graceful close takes longer than this. */
  timeoutMs: number;
  signals?: NodeJS.Signals[];
  /** Injectable for tests. */
  exit?: (code: number) => void;
  processRef?: Pick<NodeJS.Process, "on" | "off">;
}

/**
 * Closes the app on SIGTERM/SIGINT: stops accepting connections, runs every
 * plugin's onClose hook (database, redis, queues) and exits 0. Exits 1 if
 * closing fails or exceeds `timeoutMs`; a second signal forces exit.
 * Fatal process errors close the app and exit 1.
 *
 * Returns a function that removes the handlers.
 */
export function installShutdownHandlers(app: FastifyInstance, options: ShutdownOptions): () => void {
  const signals = options.signals ?? ["SIGTERM", "SIGINT"];
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const proc = options.processRef ?? process;
  let shuttingDown = false;

  const shutdown = async (reason: string, exitCode: number) => {
    if (shuttingDown) {
      app.log.warn({ reason }, "Second shutdown request — forcing exit");
      exit(1);
      return;
    }
    shuttingDown = true;
    app.log.info({ reason }, "Shutting down");

    const timer = setTimeout(() => {
      app.log.error({ timeoutMs: options.timeoutMs }, "Graceful shutdown timed out — forcing exit");
      exit(1);
    }, options.timeoutMs);
    timer.unref();

    try {
      await app.close();
      clearTimeout(timer);
      app.log.info("Shutdown complete");
      exit(exitCode);
    } catch (err) {
      clearTimeout(timer);
      app.log.error({ err }, "Error during shutdown");
      exit(1);
    }
  };

  const onSignal = (signal: NodeJS.Signals) => void shutdown(signal, 0);
  const onFatal = (err: unknown) => {
    app.log.fatal({ err }, "Fatal process error");
    void shutdown("fatal error", 1);
  };

  for (const signal of signals) proc.on(signal, onSignal);
  proc.on("uncaughtException", onFatal);
  proc.on("unhandledRejection", onFatal);

  return () => {
    for (const signal of signals) proc.off(signal, onSignal);
    proc.off("uncaughtException", onFatal);
    proc.off("unhandledRejection", onFatal);
  };
}
