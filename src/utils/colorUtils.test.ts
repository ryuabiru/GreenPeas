import { describe, expect, it } from 'vitest';
import { getVisibleFeatureColor } from './colorUtils';

const contrastOnWhite = (hex: string) => {
  const rgb = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = rgb.reduce((sum, value, index) => sum +
    (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) *
    [0.2126, 0.7152, 0.0722][index], 0);
  return 1.05 / (luminance + 0.05);
};

describe('light feature colors', () => {
  it.each(['#ffd6e7', '#c8e8ff', '#d5f5d5', '#ffff99', '#ffffff80'])
    ('keeps %s legible against a light surface', color => {
      const visible = getVisibleFeatureColor('gene', color, false);
      expect(visible).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrastOnWhite(visible)).toBeGreaterThanOrEqual(4.5);
      expect(getVisibleFeatureColor('gene', color, true)).toBe(color);
    });
});
