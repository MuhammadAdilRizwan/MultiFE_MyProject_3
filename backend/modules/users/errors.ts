export type AuthErrorCode =
  | "invalid_credentials"
  | "account_suspended"
  | "already_exists"
  | "not_authorized"
  | "invite_failed";

export class AuthError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}
