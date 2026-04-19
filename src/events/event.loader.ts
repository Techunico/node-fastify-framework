import path from "path";
import { loadFilesRecursively } from "../utils/file-loader";
import { EventService } from './event.service';

export async function loadEventListeners(eventService:EventService) {
  const basePath = path.join(process.cwd(), "dist/events/listeners");

  const files = loadFilesRecursively(basePath);

  for (const file of files) {
    if (!file.endsWith(".listener.js")) continue;

    const module = await import(file);
    const listener = module.default;

    if (!listener?.event || !listener?.handler) {
      console.warn(`Invalid listener: ${file}`);
      continue;
    }

    if (typeof listener.handler !== "function") {
      throw new Error(`Invalid handler in ${file}`);
    }

    eventService.register(listener);
  }
}
