// Pakistani numbers as people type them ("0300 1234567", "300-1234567",
// "92 300 1234567", "+92 300 1234567") → the international form the
// provisional-customer action requires ("+923001234567"). Returns null when
// it can't be read as a number. Other countries must be typed with "+".
export function toInternationalPhone(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;

  let result: string;
  if (digits.startsWith("+")) result = digits;
  else if (digits.startsWith("0092")) result = `+${digits.slice(2)}`;
  else if (digits.startsWith("92") && digits.length === 12) result = `+${digits}`;
  else if (digits.startsWith("0") && digits.length === 11) result = `+92${digits.slice(1)}`;
  else if (digits.startsWith("3") && digits.length === 10) result = `+92${digits}`;
  else return null;

  return /^\+[1-9]\d{7,14}$/.test(result) ? result : null;
}

// "+923001234567" → "+92 300 1234567" for display; other numbers unchanged.
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const p = phone.startsWith("+") ? phone : `+${phone}`;
  const m = /^\+92(\d{3})(\d{7})$/.exec(p);
  return m ? `+92 ${m[1]} ${m[2]}` : p;
}
