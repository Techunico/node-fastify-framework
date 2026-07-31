export enum CloudinaryErrorCode {
  Cloudinary = "CLOUDINARY_ERROR",
  NotConfigured = "CLOUDINARY_NOT_CONFIGURED",
  UploadFailed = "CLOUDINARY_UPLOAD_FAILED",
  DeleteFailed = "CLOUDINARY_DELETE_FAILED",
  RenameFailed = "CLOUDINARY_RENAME_FAILED",
  InvalidInput = "CLOUDINARY_INVALID_INPUT",
}

export class CloudinaryError extends Error {
  constructor(
    message: string,
    public readonly code: CloudinaryErrorCode = CloudinaryErrorCode.Cloudinary,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
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
