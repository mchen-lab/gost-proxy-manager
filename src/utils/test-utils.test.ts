import { describe, it, expect } from 'vitest';

// Simple utility to test
function add(a: number, b: number) {
  return a + b;
}

describe('Basic Test Setup', () => {
  it('should pass this smoke test', () => {
    expect(true).toBe(true);
  });

  it('should calculate addition correctly', () => {
    expect(add(1, 2)).toBe(3);
  });
});
