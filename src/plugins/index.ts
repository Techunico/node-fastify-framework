import { FastifyInstance } from "fastify";
import { config } from "@/config";

import dbPlugin from "./db.plugin";
import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";
import jwtPlugin from "./jwt.plugin";
import metricsPlugin from "./metrics.plugin";

import redisPlugin from "./redis/redis.plugin";
import cachePlugin from "./cache/cache.plugin";
import queuePlugin from "./queue/queue.plugin";
import eventsPlugin from "./events/events.plugin";

export async function registerPlugins(app: FastifyInstance) {
  // ✅ CORE (always loaded)
  await app.register(dbPlugin);
  await app.register(jwtPlugin);
  await app.register(responsePlugin);
  await app.register(metricsPlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin);

  // 🔌 OPTIONAL (env driven)
  const enabled = config.app.plugins;

  if (enabled.includes("redis")) {
    await app.register(redisPlugin);
  }

  if (enabled.includes("cache")) {
    if (!enabled.includes("redis")) {
      await app.register(cachePlugin);
    } else {
      console.warn(
        "Cache plugin requires Redis plugin. Please enable Redis plugin to use cache features.",
      );
    }
  }

  if (enabled.includes("queue")) {
    if (!enabled.includes("redis")) {
      await app.register(queuePlugin);
    } else {
      console.warn(
        "Queue plugin requires Redis plugin. Please enable Redis plugin to use queue features.",
      );
    }
  }

  if (enabled.includes("events")) {
    if (!enabled.includes("redis")) {
      await app.register(eventsPlugin);
    } else {
      console.warn(
        "Events plugin requires Redis plugin. Please enable Redis plugin to use event features.",
      );
    }
  }
}
