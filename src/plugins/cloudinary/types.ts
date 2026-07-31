/** Cloudinary plugin configuration (env-backed). */
export interface CloudinaryPluginConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  /** Default folder prefix for uploads when callers omit folder. */
  defaultFolder: string;
  secure: boolean;
}

export interface CloudinaryUploadOptions {
  folder?: string;
  publicId?: string;
  overwrite?: boolean;
  resourceType?: "image" | "video" | "raw" | "auto";
  tags?: string[];
  /** Cloudinary transformation string or object (passed through). */
  transformation?: unknown;
  /** Optional mime/format hint (e.g. "jpg", "png"). */
  format?: string;
  /** Invalidate CDN on overwrite/replace. */
  invalidate?: boolean;
  /** Extra Cloudinary upload params. */
  extra?: Record<string, unknown>;
}

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  resourceType: string;
  folder?: string;
  version?: number;
  /** Original provider payload for advanced callers. */
  raw: Record<string, unknown>;
}

export interface CloudinaryDeleteResult {
  publicId: string;
  result: string;
  raw: Record<string, unknown>;
}

export interface CloudinaryRenameOptions {
  overwrite?: boolean;
  invalidate?: boolean;
  resourceType?: "image" | "video" | "raw";
}

export interface CloudinaryUrlOptions {
  secure?: boolean;
  transformation?: unknown;
  format?: string;
  version?: number | string;
  resourceType?: "image" | "video" | "raw";
  /** Extra cloudinary.url options. */
  extra?: Record<string, unknown>;
}

export interface CloudinarySignedUploadParams {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder?: string;
  publicId?: string;
}
