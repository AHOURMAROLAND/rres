import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifySaspayWebhookSignature } from './saspay.js';
import {
  createRequestFingerprint,
  isValidIdempotencyKey,
  parseMoney,
  validateDepositSettlement,
} from './payment-validation.js';

test('parseMoney normalizes valid decimal amounts without floating-point formatting', () => {
  assert.deepEqual(parseMoney('0001.2'), { amount: 1.2, formatted: '1.20' });
  assert.deepEqual(parseMoney('2500'), { amount: 2500, formatted: '2500.00' });
  assert.deepEqual(parseMoney('0.29'), { amount: 0.29, formatted: '0.29' });
});

test('parseMoney rejects invalid, non-positive, over-precision, and unsafe amounts', () => {
  for (const value of ['0', '-1', '1.001', '1e3', 'NaN', '', '90071992547409.92']) {
    assert.equal(parseMoney(value), null, `Expected ${value} to be rejected`);
  }
});

test('idempotency keys enforce the accepted character set and length', () => {
  assert.equal(isValidIdempotencyKey('78fbe047-261f-4467-94ca-c64fd0398c09'), true);
  assert.equal(isValidIdempotencyKey('short'), false);
  assert.equal(isValidIdempotencyKey('x'.repeat(129)), false);
  assert.equal(isValidIdempotencyKey('invalid key with spaces'), false);
});

test('request fingerprints are order-independent and payload-sensitive', () => {
  const first = createRequestFingerprint('secret', { amount: '5.00', method: 'wave' });
  const same = createRequestFingerprint('secret', { method: 'wave', amount: '5.00' });
  const changed = createRequestFingerprint('secret', { amount: '6.00', method: 'wave' });
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test('deposit settlement requires matching requested amount, currency, and a bounded net amount', () => {
  const valid = {
    requestedAmount: 1000,
    verifiedRequestedAmount: 1000,
    netAmount: 975,
    expectedCurrency: 'XOF',
    verifiedCurrency: 'XOF',
  };
  assert.equal(validateDepositSettlement(valid), true);
  assert.equal(validateDepositSettlement({ ...valid, verifiedRequestedAmount: 999 }), false);
  assert.equal(validateDepositSettlement({ ...valid, netAmount: 1001 }), false);
  assert.equal(validateDepositSettlement({ ...valid, netAmount: 0 }), false);
  assert.equal(validateDepositSettlement({ ...valid, verifiedCurrency: 'USD' }), false);
});

test('webhook signatures validate the timestamp and exact raw request body', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = Buffer.from('{"event":"transaction.success","data":{"id":"pay_1"}}');
  const signature = createHmac('sha256', 'test-secret')
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');

  assert.equal(verifySaspayWebhookSignature(body, signature, timestamp, 'test-secret'), true);
  assert.equal(verifySaspayWebhookSignature(Buffer.from(`${body.toString()} `), signature, timestamp, 'test-secret'), false);
  assert.equal(verifySaspayWebhookSignature(body, signature, String(Number(timestamp) - 301), 'test-secret'), false);
});
