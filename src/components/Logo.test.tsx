// @vitest-environment jsdom
import {cleanup, render} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';
import Logo from './Logo';

afterEach(cleanup);

describe('Logo', () => {
  it('renders mark variant without crashing', () => {
    const {container} = render(<Logo size={24} variant="mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 32 32');
    expect(svg?.getAttribute('width')).toBe('24');
  });

  it('renders emblem variant without crashing', () => {
    const {container} = render(<Logo size={64} variant="emblem" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(svg?.getAttribute('width')).toBe('64');
  });

  it('contains no text elements (ensures no app name in logo)', () => {
    const {container} = render(<Logo variant="emblem" />);
    const textElement = container.querySelector('text');
    expect(textElement).toBeNull();
  });
});
