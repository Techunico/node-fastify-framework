import { v2 as cloudinary } from "cloudinary";
import {
  assertCloudinaryConfigured,
  isCloudinaryConfigured,
} from "./config";
import {
  CloudinaryDeleteError,
  CloudinaryInvalidInputError,
  CloudinaryRenameError,
  CloudinaryUploadError,
} from "./errors";
import type {
  CloudinaryDeleteResult,
  CloudinaryPluginConfig,
  CloudinaryRenameOptions,
  CloudinarySignedUploadParams,
  CloudinaryUploadOptions,
  CloudinaryUploadResult,
  CloudinaryUrlOptions,
} from "./types";
import { toSafeCause } from "@/core/safe-error";

type ServiceLogger = {
  info?: (obj: object, msg?: string) => void;
  warn?: (obj: object, msg?: string) => void;
  error?: (obj: object, msg?: string) => void;
  debug?: (obj: object, msg?: string) => void;
};

/**
 * Provider-agnostic media facade over Cloudinary.
 * Business modules use `app.cloudinary` only — never import the SDK elsewhere.
 */
export class CloudinaryService {
  private readonly configured: boolean;

  constructor(
    private readonly config: CloudinaryPluginConfig,
    private readonly log?: ServiceLogger,
  ) {
    this.configured = isCloudinaryConfigured(config);
    if (this.configured) {
      cloudinary.config({
        cloud_name: config.cloudName,
        api_key: config.apiKey,
        api_secret: config.apiSecret,
        secure: config.secure,
      });
    }
  }

  /** Whether real credentials were present at construction. */
  isConfigured(): boolean {
    return this.configured;
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async uploadBuffer(
    buffer: Buffer,
    options: CloudinaryUploadOptions = {},
  ): Promise<CloudinaryUploadResult> {
    this.ensureReady();
    if (!buffer?.length) {
      throw new CloudinaryInvalidInputError("uploadBuffer requires a non-empty Buffer");
    }

    const folder = options.folder ?? this.config.defaultFolder;
    const params = this.buildUploadParams(options, folder);

    try {
      const raw = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(params, (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new CloudinaryUploadError("Empty upload response"));
          resolve(result as unknown as Record<string, unknown>);
        });
        stream.end(buffer);
      });
      return this.normalizeUpload(raw);
    } catch (err) {
      this.log?.error?.({ err: toSafeCause(err), folder }, "Cloudinary uploadBuffer failed");
      throw new CloudinaryUploadError(
        err instanceof Error ? err.message : "Cloudinary upload failed",
        toSafeCause(err),
      );
    }
  }

  async uploadPath(
    filePath: string,
    options: CloudinaryUploadOptions = {},
  ): Promise<CloudinaryUploadResult> {
    this.ensureReady();
    if (!filePath?.trim()) {
      throw new CloudinaryInvalidInputError("uploadPath requires a file path");
    }

    const folder = options.folder ?? this.config.defaultFolder;
    const params = this.buildUploadParams(options, folder);

    try {
      const raw = (await cloudinary.uploader.upload(filePath, params)) as unknown as Record<
        string,
        unknown
      >;
      return this.normalizeUpload(raw);
    } catch (err) {
      this.log?.error?.({ err: toSafeCause(err), folder, filePath }, "Cloudinary uploadPath failed");
      throw new CloudinaryUploadError(
        err instanceof Error ? err.message : "Cloudinary upload failed",
        toSafeCause(err),
      );
    }
  }

  /**
   * Upload a data URI or raw base64 string.
   * Accepts `data:image/png;base64,...` or plain base64 (with optional format).
   */
  async uploadBase64(
    data: string,
    options: CloudinaryUploadOptions = {},
  ): Promise<CloudinaryUploadResult> {
    this.ensureReady();
    if (!data?.trim()) {
      throw new CloudinaryInvalidInputError("uploadBase64 requires data");
    }

    const payload = data.startsWith("data:")
      ? data
      : `data:application/octet-stream;base64,${data}`;

    const folder = options.folder ?? this.config.defaultFolder;
    const params = this.buildUploadParams(options, folder);

    try {
      const raw = (await cloudinary.uploader.upload(payload, params)) as unknown as Record<
        string,
        unknown
      >;
      return this.normalizeUpload(raw);
    } catch (err) {
      this.log?.error?.({ err: toSafeCause(err), folder }, "Cloudinary uploadBase64 failed");
      throw new CloudinaryUploadError(
        err instanceof Error ? err.message : "Cloudinary upload failed",
        toSafeCause(err),
      );
    }
  }

  // ─── Delete / replace / rename ────────────────────────────────────────────

  async delete(
    publicId: string,
    options: { resourceType?: "image" | "video" | "raw"; invalidate?: boolean } = {},
  ): Promise<CloudinaryDeleteResult> {
    this.ensureReady();
    if (!publicId?.trim()) {
      throw new CloudinaryInvalidInputError("delete requires publicId");
    }

    try {
      const raw = (await cloudinary.uploader.destroy(publicId, {
        resource_type: options.resourceType ?? "image",
        invalidate: options.invalidate ?? true,
      })) as unknown as Record<string, unknown>;

      return {
        publicId,
        result: String(raw.result ?? "ok"),
        raw,
      };
    } catch (err) {
      this.log?.error?.({ err: toSafeCause(err), publicId }, "Cloudinary delete failed");
      throw new CloudinaryDeleteError(
        err instanceof Error ? err.message : "Cloudinary delete failed",
        toSafeCause(err),
      );
    }
  }

  async deleteMany(
    publicIds: string[],
    options: { resourceType?: "image" | "video" | "raw" } = {},
  ): Promise<CloudinaryDeleteResult[]> {
    if (!publicIds?.length) return [];
    const results: CloudinaryDeleteResult[] = [];
    for (const id of publicIds) {
      results.push(await this.delete(id, options));
    }
    return results;
  }

  /**
   * Replace an existing asset: upload new content with the same publicId (overwrite).
   */
  async replace(
    publicId: string,
    buffer: Buffer,
    options: Omit<CloudinaryUploadOptions, "publicId" | "overwrite"> = {},
  ): Promise<CloudinaryUploadResult> {
    if (!publicId?.trim()) {
      throw new CloudinaryInvalidInputError("replace requires publicId");
    }
    return this.uploadBuffer(buffer, {
      ...options,
      publicId,
      overwrite: true,
      invalidate: options.invalidate ?? true,
    });
  }

  async rename(
    fromPublicId: string,
    toPublicId: string,
    options: CloudinaryRenameOptions = {},
  ): Promise<CloudinaryUploadResult> {
    this.ensureReady();
    if (!fromPublicId?.trim() || !toPublicId?.trim()) {
      throw new CloudinaryInvalidInputError("rename requires fromPublicId and toPublicId");
    }

    try {
      const raw = (await cloudinary.uploader.rename(fromPublicId, toPublicId, {
        overwrite: options.overwrite ?? false,
        invalidate: options.invalidate ?? true,
        resource_type: options.resourceType ?? "image",
      })) as unknown as Record<string, unknown>;
      return this.normalizeUpload(raw);
    } catch (err) {
      this.log?.error?.(
        { err: toSafeCause(err), fromPublicId, toPublicId },
        "Cloudinary rename failed",
      );
      throw new CloudinaryRenameError(
        err instanceof Error ? err.message : "Cloudinary rename failed",
        toSafeCause(err),
      );
    }
  }

  // ─── URL helpers ──────────────────────────────────────────────────────────

  getUrl(publicId: string, options: CloudinaryUrlOptions = {}): string {
    this.ensureReady();
    if (!publicId?.trim()) {
      throw new CloudinaryInvalidInputError("getUrl requires publicId");
    }

    return cloudinary.url(publicId, {
      secure: options.secure ?? this.config.secure,
      transformation: options.transformation,
      format: options.format,
      version: options.version,
      resource_type: options.resourceType ?? "image",
      ...(options.extra ?? {}),
    });
  }

  /** Convenience alias with an explicit transformation. */
  getTransformedUrl(
    publicId: string,
    transformation: unknown,
    options: Omit<CloudinaryUrlOptions, "transformation"> = {},
  ): string {
    return this.getUrl(publicId, { ...options, transformation });
  }

  // ─── Signed client uploads ────────────────────────────────────────────────

  /**
   * Parameters for browser / mobile direct upload to Cloudinary.
   * Never expose api_secret to clients — only return this signed payload.
   */
  getSignedUploadParams(options: {
    folder?: string;
    publicId?: string;
    timestamp?: number;
  } = {}): CloudinarySignedUploadParams {
    this.ensureReady();

    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const folder = options.folder ?? this.config.defaultFolder;
    const paramsToSign: Record<string, string | number> = { timestamp, folder };
    if (options.publicId) paramsToSign.public_id = options.publicId;

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.config.apiSecret,
    );

    return {
      timestamp,
      signature,
      apiKey: this.config.apiKey,
      cloudName: this.config.cloudName,
      folder,
      publicId: options.publicId,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private ensureReady(): void {
    assertCloudinaryConfigured(this.config);
  }

  private buildUploadParams(
    options: CloudinaryUploadOptions,
    folder: string,
  ): Record<string, unknown> {
    return {
      folder,
      public_id: options.publicId,
      overwrite: options.overwrite,
      resource_type: options.resourceType ?? "auto",
      tags: options.tags,
      transformation: options.transformation,
      format: options.format,
      invalidate: options.invalidate,
      ...(options.extra ?? {}),
    };
  }

  private normalizeUpload(raw: Record<string, unknown>): CloudinaryUploadResult {
    return {
      publicId: String(raw.public_id ?? ""),
      url: String(raw.url ?? ""),
      secureUrl: String(raw.secure_url ?? raw.url ?? ""),
      width: typeof raw.width === "number" ? raw.width : undefined,
      height: typeof raw.height === "number" ? raw.height : undefined,
      format: raw.format != null ? String(raw.format) : undefined,
      bytes: typeof raw.bytes === "number" ? raw.bytes : undefined,
      resourceType: String(raw.resource_type ?? "image"),
      folder: raw.folder != null ? String(raw.folder) : undefined,
      version: typeof raw.version === "number" ? raw.version : undefined,
      raw,
    };
  }
}
