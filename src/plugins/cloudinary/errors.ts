export enum CloudinaryErrorCode {
  Cloudinary = "CLOUDINARY_ERROR",
  NotConfigured = "CLOUDINARY_NOT_CONFIGURED",
  UploadFailed = "CLOUDINARY_UPLOAD_FAILED",
  DeleteFailed = "CLOUDINARY_DELETE_FAILED",
  RenameFailed = "CLOUDINARY_RENAME_FAILED",
  InvalidInput = "CLOUDINARY_INVALID_INPUT",
}

const STATUS_BY_CODE: Record<CloudinaryErrorCode, number> = {
  [CloudinaryErrorCode.Cloudinary]: 500,
  [CloudinaryErrorCode.NotConfigured]: 503,
  [CloudinaryErrorCode.UploadFailed]: 502,
  [CloudinaryErrorCode.DeleteFailed]: 502,
  [CloudinaryErrorCode.RenameFailed]: 502,
  [CloudinaryErrorCode.InvalidInput]: 400,
};

export class CloudinaryError extends Error {
  constructor(
    message: string,
    public readonly code: CloudinaryErrorCode = CloudinaryErrorCode.Cloudinary,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  /** HTTP status used by the framework error handler. 4xx messages are shown to clients. */
  get statusCode(): number {
    return STATUS_BY_CODE[this.code] ?? 500;
  }
}

export class CloudinaryNotConfiguredError extends CloudinaryError {
  constructor(
    message = "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)",
  ) {
    super(message, CloudinaryErrorCode.NotConfigured);
  }
}

export class CloudinaryUploadError extends CloudinaryError {
  constructor(message = "Cloudinary upload failed", cause?: unknown) {
    super(message, CloudinaryErrorCode.UploadFailed, cause);
  }
}

export class CloudinaryDeleteError extends CloudinaryError {
  constructor(message = "Cloudinary delete failed", cause?: unknown) {
    super(message, CloudinaryErrorCode.DeleteFailed, cause);
  }
}

export class CloudinaryRenameError extends CloudinaryError {
  constructor(message = "Cloudinary rename failed", cause?: unknown) {
    super(message, CloudinaryErrorCode.RenameFailed, cause);
  }
}

export class CloudinaryInvalidInputError extends CloudinaryError {
  constructor(message: string) {
    super(message, CloudinaryErrorCode.InvalidInput);
  }
}
