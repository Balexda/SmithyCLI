import { describe, it, expect, afterEach } from 'vitest';
import { detectPlatforms } from './platform-detect.js';

describe('detectPlatforms', () => {
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, 'platform', originalPlatformDescriptor);
    }
  });

  it('returns ["mac"] on darwin', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(detectPlatforms()).toEqual(['mac']);
  });

  it('returns ["linux"] on linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(detectPlatforms()).toEqual(['linux']);
  });

  it('returns [] on win32', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(detectPlatforms()).toEqual([]);
  });

  it('returns [] on freebsd', () => {
    Object.defineProperty(process, 'platform', { value: 'freebsd', configurable: true });
    expect(detectPlatforms()).toEqual([]);
  });

  it('reads process.platform dynamically on every call', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(detectPlatforms()).toEqual(['mac']);
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    expect(detectPlatforms()).toEqual(['linux']);
  });
});
