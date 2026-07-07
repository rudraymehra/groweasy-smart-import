import { describe, expect, it } from 'vitest';
import { splitMultiplePhones, splitPhone } from '../lib/phone.js';

describe('splitPhone', () => {
  it('splits a bare 10-digit Indian mobile using the default country', () => {
    expect(splitPhone('9876543210', 'IN')).toEqual({
      country_code: '+91',
      mobile: '9876543210',
      valid: true,
    });
  });

  it('splits a +91-prefixed number regardless of default country', () => {
    expect(splitPhone('+91 98765 43210', 'US')).toEqual({
      country_code: '+91',
      mobile: '9876543210',
      valid: true,
    });
  });

  it('handles E.164 without spaces', () => {
    expect(splitPhone('+919845098450', null)).toEqual({
      country_code: '+91',
      mobile: '9845098450',
      valid: true,
    });
  });

  it('splits a US number', () => {
    expect(splitPhone('(415) 555-2671', 'US')).toEqual({
      country_code: '+1',
      mobile: '4155552671',
      valid: true,
    });
  });

  it('strips a leading trunk zero (09876...)', () => {
    const result = splitPhone('09876123450', 'IN');
    expect(result?.mobile).toBe('9876123450');
    expect(result?.country_code).toBe('+91');
  });

  it('keeps an unvalidatable but plausible number, flagged invalid', () => {
    const result = splitPhone('044-23456789', 'IN');
    expect(result).not.toBeNull();
    expect(result!.mobile.replace(/\D/g, '').length).toBeGreaterThanOrEqual(7);
  });

  it('rejects garbage', () => {
    expect(splitPhone('1234', 'IN')).toBeNull();
    expect(splitPhone('call me', 'IN')).toBeNull();
    expect(splitPhone('', 'IN')).toBeNull();
  });
});

describe('splitMultiplePhones', () => {
  it('splits on slash and comma', () => {
    expect(splitMultiplePhones('9876543210/9123456780')).toEqual(['9876543210', '9123456780']);
    expect(splitMultiplePhones('9876543210, 9123456780')).toEqual(['9876543210', '9123456780']);
  });

  it('drops fragments that are too short to be phones', () => {
    expect(splitMultiplePhones('9876543210 / ext 12')).toEqual(['9876543210']);
  });
});
