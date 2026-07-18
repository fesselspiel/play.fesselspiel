export const PASSWORD_MIN_LENGTH = 1;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordPolicyError(password: string) {
  if (password.length < PASSWORD_MIN_LENGTH) return "password_too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "password_too_long";
  return null;
}

export function passwordPolicyText() {
  return `Frei wählbar, höchstens ${PASSWORD_MAX_LENGTH} Zeichen.`;
}
