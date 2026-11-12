// Customer-facing wording for Supabase phone-OTP errors (sign in / claim an
// agent-made account, FR-AUTH-10). Supabase's own messages are technical.
export function phoneOtpMessage(raw: string, step: "send" | "verify"): string {
  const message = raw.toLowerCase();
  if (/phone.*(provider|signup).*(disabled|not enabled)|unsupported phone provider|phone_provider_disabled|sms provider/.test(message)) {
    return "Signing in with a phone number isn't switched on yet. Please contact MultiFe or your agent.";
  }
  if (/signups? not allowed|user not found|no user/.test(message)) {
    return "We couldn't find an account with this number. If an agent is helping you, ask them to add you first.";
  }
  if (/only request this after|rate limit|too many/.test(message)) {
    return "Please wait a minute before asking for another code.";
  }
  if (step === "verify" && /(expired|invalid).*(token|otp|code)|token.*(expired|invalid)/.test(message)) {
    return "That code is wrong or has expired. Check it, or ask for a new one.";
  }
  return step === "send" ? "We couldn't send a code right now. Please try again." : "We couldn't check that code. Please try again.";
}
