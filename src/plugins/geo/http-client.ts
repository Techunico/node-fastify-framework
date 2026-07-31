import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, GenericAbortSignal } from "axios";
import { ProviderError, ProviderTimeoutError } from "./errors";
import { GeoProviderName, ProviderHttpConfig } from "./types";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

const delay = async (milliseconds: number, signal?: GenericAbortSignal): Promise<void> => {
  if (signal?.aborted) throw new Error("Request aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener?.("abort", () => {
      clearTimeout(timer);
      reject(new Error("Request aborted"));
    }, { once: true });
  });
};

/** Shared axios client with bounded exponential retries and typed provider errors. */
export class GeoHttpClient {
  private readonly client: AxiosInstance;

  constructor(
    private readonly provider: GeoProviderName,
    private readonly config: ProviderHttpConfig,
  ) {
    this.client = axios.create({ timeout: config.timeoutMs });
  }

  async request<T>(request: AxiosRequestConfig): Promise<T> {
    for (let attempt = 0; attempt <= this.config.retries; attempt += 1) {
      try {
        const response = await this.client.request<T>(request);
        return response.data;
      } catch (error: unknown) {
        const axiosError = error instanceof AxiosError ? error : undefined;
        if (axiosError?.code === "ERR_CANCELED") throw error;
        const timedOut = axiosError?.code === "ECONNABORTED" || axiosError?.code === "ETIMEDOUT";
        const retryable = timedOut || !axiosError?.response || RETRYABLE_STATUS.has(axiosError.response.status);

        if (retryable && attempt < this.config.retries) {
          await delay(this.config.retryDelayMs * 2 ** attempt, request.signal);
          continue;
        }
        if (timedOut) throw new ProviderTimeoutError(this.provider, this.config.timeoutMs, error);
        throw new ProviderError(
          `${this.provider} request failed${axiosError?.response ? ` with status ${axiosError.response.status}` : ""}`,
          this.provider,
          error,
        );
      }
    }
    throw new ProviderError(`${this.provider} request failed`, this.provider);
  }
}
