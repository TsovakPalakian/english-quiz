import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCookies, formatSetCookie, cookieConsentHeader} from '../src/cookie-manager.mjs';

test('parseCookies: parses standard cookie header string', () => {
  const header = 'enquiz_sid=abc123token; cookie_consent=all; qr-preview=dev';
  const cookies = parseCookies(header);
  assert.equal(cookies.enquiz_sid, 'abc123token');
  assert.equal(cookies.cookie_consent, 'all');
  assert.equal(cookies['qr-preview'], 'dev');
});

test('parseCookies: safely handles malformed percent encoding without throwing', () => {
  const header = 'broken=%E0%A4%A; valid=hello%20world; dangling=%';
  const cookies = parseCookies(header);
  assert.equal(cookies.valid, 'hello world');
  assert.equal(cookies.broken, '%E0%A4%A');
  assert.equal(cookies.dangling, '%');
});

test('parseCookies: handles empty, null and undefined headers safely', () => {
  assert.deepEqual(parseCookies(''), {});
  assert.deepEqual(parseCookies(null), {});
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies('   ;  ;;  '), {});
});

test('parseCookies: handles cookies with missing values or multiple equals', () => {
  const header = 'flag; token=val=extra=parts; empty=';
  const cookies = parseCookies(header);
  assert.equal(cookies.flag, '');
  assert.equal(cookies.token, 'val=extra=parts');
  assert.equal(cookies.empty, '');
});

test('formatSetCookie: produces correct secure Set-Cookie string', () => {
  const str = formatSetCookie('cookie_consent', 'all', {
    path: '/',
    sameSite: 'Lax',
    secure: true,
    httpOnly: false,
    maxAge: 31536000
  });
  assert.equal(str, 'cookie_consent=all; Path=/; SameSite=Lax; Secure; Max-Age=31536000');
});

test('formatSetCookie: handles HttpOnly and custom maxAge', () => {
  const str = formatSetCookie('enquiz_sid', 'secret123', {
    path: '/',
    sameSite: 'Strict',
    secure: true,
    httpOnly: true,
    maxAge: 3600
  });
  assert.equal(str, 'enquiz_sid=secret123; Path=/; SameSite=Strict; Secure; HttpOnly; Max-Age=3600');
});

test('cookieConsentHeader: generates expected header for choices', () => {
  assert.equal(
    cookieConsentHeader('all', true),
    'cookie_consent=all; Path=/; SameSite=Lax; Secure; Max-Age=31536000'
  );
  assert.equal(
    cookieConsentHeader('essential', true),
    'cookie_consent=essential; Path=/; SameSite=Lax; Secure; Max-Age=31536000'
  );
  assert.equal(
    cookieConsentHeader('declined', true),
    'cookie_consent=declined; Path=/; SameSite=Lax; Secure; Max-Age=31536000'
  );
  // Invalid fallback to essential
  assert.equal(
    cookieConsentHeader('unknown_value', false),
    'cookie_consent=essential; Path=/; SameSite=Lax; Max-Age=31536000'
  );
});
