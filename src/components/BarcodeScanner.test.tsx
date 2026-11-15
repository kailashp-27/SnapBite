// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import BarcodeScanner from './BarcodeScanner';
import {db} from '../db';
import type {Food} from '../types';

const testFood: Food = {
  id: 'off:737628064502',
  name: 'Thai peanut noodle kit',
  category: 'Snacks',
  serving: '100 g',
  grams: 100,
  calories: 385,
  protein: 9.6,
  carbs: 71.2,
  fat: 7.7,
  emoji: '📦',
  aliases: ['737628064502', 'barcode:737628064502'],
  source: 'Open Food Facts'
};

beforeEach(async () => {
  await db.open();
});

afterEach(async () => {
  cleanup();
  vi.clearAllMocks();
  await db.delete();
});

describe('BarcodeScanner', () => {
  it('renders barcode scanner controls and manual lookup input', () => {
    render(<BarcodeScanner onPick={vi.fn()} notify={vi.fn()}/>);
    expect(screen.getByRole('heading', {name: /barcode scanner/i})).toBeDefined();
    expect(screen.getByPlaceholderText(/e\.g\. 737628064502/i)).toBeDefined();
    expect(screen.getByRole('button', {name: /start camera/i})).toBeDefined();
    expect(screen.getByRole('button', {name: /barcode photo/i})).toBeDefined();
  });

  it('finds existing barcode in local library and picks it', async () => {
    await db.foodLibrary.put(testFood);
    const onPick = vi.fn();
    const notify = vi.fn();

    render(<BarcodeScanner onPick={onPick} notify={notify}/>);
    const input = screen.getByPlaceholderText(/e\.g\. 737628064502/i);
    fireEvent.change(input, {target: {value: '737628064502'}});
    fireEvent.click(screen.getByRole('button', {name: /look up/i}));

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledWith('Thai peanut noodle kit', expect.objectContaining({id: 'off:737628064502'}));
    });
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Found in local library'));
  });

  it('offers custom food addition when barcode is not found', async () => {
    const onPick = vi.fn();
    const notify = vi.fn();

    // Mock fetch to simulate not found
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({status: 0, status_verbose: 'product not found'})
    }));

    render(<BarcodeScanner onPick={onPick} notify={notify}/>);
    const input = screen.getByPlaceholderText(/e\.g\. 737628064502/i);
    fireEvent.change(input, {target: {value: '999999999999'}});
    fireEvent.click(screen.getByRole('button', {name: /look up/i}));

    await waitFor(() => {
      expect(screen.getByText(/barcode "999999999999" was not found/i)).toBeDefined();
    });

    const addCustomBtn = screen.getByRole('button', {name: /add custom food for this barcode/i});
    fireEvent.click(addCustomBtn);
    expect(onPick).toHaveBeenCalledWith('999999999999');
  });
});
