import { FastifyInstance, FastifyPluginAsync } from "fastify";
import { config } from "@/config";

// core plugins
import responsePlugin from "./response.plugin";
import contextPlugin from "./context.plugin";
import servicesPlugin from "./services.plugin";
import jwtPlugin from "./jwt.plugin";
import metricsPlugin from "./metrics.plugin";

// optional plugins
import redisPlugin from "./redis/redis.plugin";
import cachePlugin from "./cache/cache.plugin";
import queuePlugin from "./queue/queue.plugin";
import eventsPlugin from "./events/events.plugin";
import GeoPlugin from "./geo/plugin";
import CloudinaryPlugin from "./cloudinary/cloudinary.plugin";
import PaymentPlugin from "./payment/plugin";

type DbProvider = "postgresql" | "mongodb";

const dbPluginMap: Record<
  DbProvider,
  () => Promise<{ default: FastifyPluginAsync }>
> = {
  postgresql: () => import("./db-prisma/prisma.plugin"),
  mongodb: () => import("./db-mongoose/mongoose.plugin"),
};

export async function registerPlugins(app: FastifyInstance) {
  // 🔌 DB Plugin
  const provider = config.db.provider as DbProvider;
  const loader = dbPluginMap[provider];

  if (!loader) {
    throw new Error(`Unsupported DB provider: ${provider}`);
  }

  const dbPlugin = await loader();
  await app.register(dbPlugin.default);

  // 🧠 Core plugins (order matters)
  await app.register(jwtPlugin);
  await app.register(responsePlugin);
  await app.register(metricsPlugin);
  await app.register(contextPlugin);
  await app.register(servicesPlugin);

  // 🔌 Optional plugins (driven by PLUGINS env)
  const enabled = config.app.plugins;
  const isEnabled = (name: string) => enabled.includes(name);

  // ✅ Redis
  if (isEnabled("redis")) {
    await app.register(redisPlugin);
  }

  // ✅ Cache (depends on Redis)
  if (isEnabled("cache")) {
    if (!isEnabled("redis")) {
      app.log.warn("Cache plugin requires Redis plugin.");
    } else {
      await app.register(cachePlugin);
    }
  }

  // ✅ Geo (optional cache integration when cache was registered first)
  if (isEnabled("geo")) {
    await app.register(GeoPlugin);
  }

  // ✅ Cloudinary media
  if (isEnabled("cloudinary")) {
    await app.register(CloudinaryPlugin);
  }

  // ✅ Payment gateways (Razorpay / Mock)
  if (isEnabled("payment")) {
    await app.register(PaymentPlugin);
  }

  // ✅ Queue (depends on Redis)
  if (isEnabled("queue")) {
    if (!isEnabled("redis")) {
      app.log.warn("Queue plugin requires Redis plugin.");
    } else {
      await app.register(queuePlugin);
    }
  }

  // ✅ Events (depends on Redis)
  if (isEnabled("events")) {
    if (!isEnabled("redis")) {
      app.log.warn("Events plugin requires Redis plugin.");
    } else {
      await app.register(eventsPlugin);
    }
  }
}
