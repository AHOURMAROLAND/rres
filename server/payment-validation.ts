import { createHmac } from 'node:crypto';

export interface ParsedMoney {
  amount: number;
  formatted: string;
}

export function parseMoney(value: unknown): ParsedMoney | null {
  const input = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string'
      ? value.trim()
      : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return null;

  const [whole, fraction = ''] = input.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents <= 0n) return null;

  const amount = Number(cents) / 100;
  const formatted = `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
  return Number.isSafeInteger(Number(cents)) && Number.isFinite(amount)
    ? { amount, formatted }
    : null;
}

export function isValidIdempotencyKey(value: string | undefined): value is string {
  return Boolean(value && value.length <= 128 && /^[A-Za-z0-9._:-]{16,128}$/.test(value));
}

export function createRequestFingerprint(secret: string, fields: Record<string, string>): string {
  const canonical = Object.fromEntries(
    Object.entries(fields).sort(([left], [right]) => left.localeCompare(right)),
  );
  return createHmac('sha256', secret).update(JSON.stringify(canonical)).digest('hex');
}

export function validateDepositSettlement(input: {
  requestedAmount: number;
  verifiedRequestedAmount?: number;
  netAmount?: number;
  expectedCurrency: string;
  verifiedCurrency?: string;
}): boolean {
  if (
    !Number.isFinite(input.netAmount)
    || !input.netAmount
    || input.netAmount <= 0
    || input.netAmount > input.requestedAmount
    || input.verifiedCurrency !== input.expectedCurrency
  ) {
    return false;
  }

  return input.verifiedRequestedAmount === undefined
    || input.verifiedRequestedAmount === input.requestedAmount;
}
