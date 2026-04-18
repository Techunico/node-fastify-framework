import { ErrorCode } from '@/core/error-codes'

export class AppError extends Error {
  statusCode: number
  code: ErrorCode
  type: ErrorCode

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.type = code
  }
}
