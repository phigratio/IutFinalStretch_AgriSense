/**
 * Convert a Bangladesh mobile number into BDApps' address format: `tel:8801XXXXXXXXX`.
 *
 * Accepts `01812345678`, `8801812345678`, `+8801812345678`, `018-1234 5678`, etc.
 * If the input is already a `tel:` address (e.g. a MASKED id received from an
 * incoming SMS/USSD), it is returned unchanged — never re-format a masked id.
 */
export function toTelAddress(input: string): string {
  const trimmed = input.trim();
  if (trimmed.toLowerCase().startsWith("tel:")) return trimmed;

  let d = trimmed.replace(/\D+/g, "");
  if (d.startsWith("880") && d.length === 13) {
    d = "0" + d.slice(3); // 8801812345678 -> 01812345678
  } else if (d.startsWith("88") && d.length === 12) {
    d = "0" + d.slice(2); // 881812345678 -> 01812345678
  }

  if (!/^01[3-9]\d{8}$/.test(d)) {
    throw new Error(
      `Invalid Bangladesh mobile number: "${input}" (expected something like 01812345678)`,
    );
  }
  return "tel:88" + d;
}
