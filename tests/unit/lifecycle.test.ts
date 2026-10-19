import { EventEmitter } from "events";
import Fastify from "fastify";
import { installShutdownHandlers } from "@/core/lifecycle";

function setup(timeoutMs = 1_000, closeDelayMs = 0) {
  const proc = new EventEmitter();
  const exit = jest.fn();
  const closed = jest.fn();
  const app = Fastify({ logger: false });
  app.addHook("onClose", async () => {
    await new Promise((resolve) => setTimeout(resolve, closeDelayMs));
    closed();
  });
  const uninstall = installShutdownHandlers(app, {
    timeoutMs,
    exit,
    processRef: proc as unknown as NodeJS.Process,
  });
  return { proc, exit, closed, app, uninstall };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("installShutdownHandlers", () => {
  it.each(["SIGTERM", "SIGINT"])("closes the app and exits 0 on %s", async (signal) => {
    const { proc, exit, closed, app } = setup();
    await app.ready();
    proc.emit(signal, signal);
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("forces exit 1 when closing exceeds the timeout", async () => {
    const { proc, exit, app } = setup(20, 500);
    await app.ready();
    proc.emit("SIGTERM", "SIGTERM");
    await flush();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("a second signal forces exit", async () => {
    const { proc, exit, app } = setup(1_000, 200);
    await app.ready();
    proc.emit("SIGTERM", "SIGTERM");
    proc.emit("SIGTERM", "SIGTERM");
    await flush();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("closes and exits 1 on unhandled rejections", async () => {
    const { proc, exit, closed, app } = setup();
    await app.ready();
    proc.emit("unhandledRejection", new Error("boom"));
    await flush();
    expect(closed).toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("can be uninstalled", async () => {
    const { proc, exit, app, uninstall } = setup();
    await app.ready();
    uninstall();
    proc.emit("SIGTERM", "SIGTERM");
    await flush();
    expect(exit).not.toHaveBeenCalled();
    await app.close();
  });
});
