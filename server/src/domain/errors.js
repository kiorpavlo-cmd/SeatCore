export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const invalid = (message, details) => {
  throw new AppError(422, "VALIDATION_ERROR", message, details);
};
