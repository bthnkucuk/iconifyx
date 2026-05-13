import { expect, test, describe } from 'bun:test';
import { sanitizeIdentifier } from './identifier.ts';

describe('sanitizeIdentifier', () => {
  test('simple lowercase stays as is', () => {
    expect(sanitizeIdentifier('home', new Set())).toBe('home');
  });

  test('kebab-case → camelCase', () => {
    expect(sanitizeIdentifier('arrow-left', new Set())).toBe('arrowLeft');
    expect(sanitizeIdentifier('book-open-text', new Set())).toBe('bookOpenText');
  });

  test('leading digit gets n prefix', () => {
    expect(sanitizeIdentifier('4k', new Set())).toBe('n4k');
    expect(sanitizeIdentifier('1st-place', new Set())).toBe('n1stPlace');
    expect(sanitizeIdentifier('0', new Set())).toBe('n0');
  });

  test('reserved Dart words get underscore suffix', () => {
    expect(sanitizeIdentifier('class', new Set())).toBe('class_');
    expect(sanitizeIdentifier('if', new Set())).toBe('if_');
    expect(sanitizeIdentifier('return', new Set())).toBe('return_');
    expect(sanitizeIdentifier('void', new Set())).toBe('void_');
  });

  test('collision adds numeric suffix', () => {
    const claimed = new Set<string>(['bookOpen']);
    expect(sanitizeIdentifier('book-open', claimed)).toBe('bookOpen_2');

    claimed.add('bookOpen_2');
    expect(sanitizeIdentifier('book-open', claimed)).toBe('bookOpen_3');
  });

  test('dots and slashes are treated as separators', () => {
    expect(sanitizeIdentifier('file.pdf', new Set())).toBe('filePdf');
    expect(sanitizeIdentifier('chart/bar', new Set())).toBe('chartBar');
  });

  test('underscores treated as separators (Iconify uses kebab but underscores can exist)', () => {
    expect(sanitizeIdentifier('snake_case', new Set())).toBe('snakeCase');
  });

  test('multiple consecutive separators are collapsed', () => {
    expect(sanitizeIdentifier('foo--bar', new Set())).toBe('fooBar');
    expect(sanitizeIdentifier('foo-.-bar', new Set())).toBe('fooBar');
  });

  test('preserves intra-token digits', () => {
    expect(sanitizeIdentifier('icon-3d-cube', new Set())).toBe('icon3dCube');
    expect(sanitizeIdentifier('mp3', new Set())).toBe('mp3');
  });

  test('throws on empty input', () => {
    expect(() => sanitizeIdentifier('', new Set())).toThrow();
    expect(() => sanitizeIdentifier('---', new Set())).toThrow();
  });

  test('reserved word + collision: both rules apply', () => {
    const claimed = new Set<string>(['class_']);
    expect(sanitizeIdentifier('class', claimed)).toBe('class__2');
  });

  test('leading digit + collision', () => {
    const claimed = new Set<string>(['n4k']);
    expect(sanitizeIdentifier('4k', claimed)).toBe('n4k_2');
  });
});
