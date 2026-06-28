import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { config } from "@/config";

import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";
import jwtPlugin from "./jwt.plugin";
import metricsPlugin from "./metrics.plugin";

import redisPlugin from "./redis/redis.plugin";
import cachePlugin from "./cache/cache.plugin";
import queuePlugin from "./queue/queue.plugin";
import eventsPlugin from "./events/events.plugin";

type DbProvider = "mongodb";

const dbPluginMap: Record<
  DbProvider,
  () => Promise<{ default: FastifyPluginAsync }>
> = {
  mongodb: () => import("./db-mongoose/mongoose.plugin"),
};

export async function registerPlugins(app: FastifyInstance) {
  const provider = config.db.provider as DbProvider;
  const loader = dbPluginMap[provider];

  if (!loader) {
    throw new Error(`Unsupported DB provider: ${provider}`);
  }

  const dbPlugin = await loader();
  await app.register(dbPlugin.default);

  await app.register(jwtPlugin);
  await app.register(responsePlugin);
  await app.register(metricsPlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin);

  const enabled = config.app.plugins;
  const isEnabled = (name: string) => enabled.includes(name);

  if (isEnabled("redis")) {
    await app.register(redisPlugin);
  }

  if (isEnabled("cache")) {
    if (!isEnabled("redis")) {
      app.log.warn("Cache plugin requires Redis plugin.");
    } else {
      await app.register(cachePlugin);
    }
  }

  if (isEnabled("queue")) {
    if (!isEnabled("redis")) {
      app.log.warn("Queue plugin requires Redis plugin.");
    } else {
      await app.register(queuePlugin);
    }
  }

  if (isEnabled("events")) {
    if (!isEnabled("redis")) {
      app.log.warn("Events plugin requires Redis plugin.");
    } else {
      await app.register(eventsPlugin);
    }
  }
}