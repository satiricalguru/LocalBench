import { describe, it, expect } from 'vitest';
import { parseSizeToBytes } from '../electron/ipc/system';

describe('parseSizeToBytes', () => {
  it('should parse KB to bytes', () => {
    expect(parseSizeToBytes('100', 'KB')).toBe(100 * 1024);
    expect(parseSizeToBytes('1.5', 'KB')).toBe(1.5 * 1024);
  });

  it('should parse MB to bytes', () => {
    expect(parseSizeToBytes('250', 'MB')).toBe(250 * 1024 * 1024);
    expect(parseSizeToBytes('0.5', 'MB')).toBe(0.5 * 1024 * 1024);
  });

  it('should parse GB to bytes', () => {
    expect(parseSizeToBytes('4.7', 'GB')).toBe(4.7 * 1024 * 1024 * 1024);
  });

  it('should handle lowercase units', () => {
    expect(parseSizeToBytes('10', 'mb')).toBe(10 * 1024 * 1024);
  });

  it('should return 0 for invalid numbers', () => {
    expect(parseSizeToBytes('abc', 'MB')).toBe(0);
  });
});

describe('Ollama pull line matching regex', () => {
  const regex = /pulling\s+([a-zA-Z0-9]+):\s*(\d+)%(?:\s+▕[^▏]*▏)?\s+([\d.]+)\s*([KMG]B)\s*\/\s*([\d.]+)\s*(KB|MB|GB)(?:\s+([\d.]+\s*(?:KB|MB|GB)\/s))?(?:\s+(\w+))?/i;

  it('should match standard downloading progress lines', () => {
    const line = 'pulling c5396e06af29:  10% ▕█                 ▏  41 MB/397 MB   38 MB/s      9s';
    const match = line.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('c5396e06af29');
    expect(match![2]).toBe('10');
    expect(match![3]).toBe('41');
    expect(match![4]).toBe('MB');
    expect(match![5]).toBe('397');
    expect(match![6]).toBe('MB');
    expect(match![7]).toBe('38 MB/s');
    expect(match![8]).toBe('9s');
  });

  it('should match progress lines without speed or eta', () => {
    const line = 'pulling c5396e06af29:   0% ▕                  ▏ 143 KB/397 MB';
    const match = line.match(regex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('c5396e06af29');
    expect(match![2]).toBe('0');
    expect(match![3]).toBe('143');
    expect(match![4]).toBe('KB');
    expect(match![5]).toBe('397');
    expect(match![6]).toBe('MB');
    expect(match![7]).toBeUndefined();
    expect(match![8]).toBeUndefined();
  });

  it('should match simple 100% completion fallback lines', () => {
    const simpleRegex = /pulling\s+([a-zA-Z0-9]+):\s*100%\s+▕██████████████████▏\s+([\d.]+)\s*([KMG]B)/i;
    const line = 'pulling 60e05f210007: 100% ▕██████████████████▏ 4.7 GB';
    const match = line.match(simpleRegex);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('60e05f210007');
    expect(match![2]).toBe('4.7');
    expect(match![3]).toBe('GB');
  });
});
