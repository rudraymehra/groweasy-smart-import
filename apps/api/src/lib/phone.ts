import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface SplitPhone {
  country_code: string | null;
  mobile: string;
  valid: boolean;
}

/**
 * Deterministically split a raw phone string into country code + national number.
 * The LLM only extracts the raw string; trusting it to split country codes is a
 * known failure mode, so this is done in code.
 */
export function splitPhone(raw: string, defaultCountry: string | null): SplitPhone | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const country = (defaultCountry?.toUpperCase() ?? 'IN') as CountryCode;
  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (parsed?.isValid()) {
    return {
      country_code: `+${parsed.countryCallingCode}`,
      mobile: parsed.nationalNumber,
      valid: true,
    };
  }

  // Fallback: keep plausible digit runs so the lead isn't lost, flag as unvalidated.
  const digits = trimmed.replace(/\D/g, '').replace(/^0+/, '');
  if (digits.length >= 7 && digits.length <= 15) {
    return { country_code: null, mobile: digits, valid: false };
  }
  return null;
}

/** Loose splitter for cells containing several phone numbers. */
export function splitMultiplePhones(raw: string): string[] {
  return raw
    .split(/[,;|/]| and |&/i)
    .map((p) => p.trim())
    .filter((p) => (p.replace(/\D/g, '').length >= 7));
}
