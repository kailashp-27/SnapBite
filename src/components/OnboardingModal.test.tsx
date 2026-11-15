// @vitest-environment jsdom
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import OnboardingModal from './OnboardingModal';
import {defaultGoals} from '../types';

afterEach(cleanup);

describe('OnboardingModal', () => {
  it('renders name input, preset options, and form fields', () => {
    render(<OnboardingModal initialGoals={defaultGoals} installPrompt={null} onSave={vi.fn()}/>);
    expect(screen.getByRole('heading', {name: /welcome to snapbite/i})).toBeDefined();
    expect(screen.getByPlaceholderText(/e\.g\. alex/i)).toBeDefined();
    expect(screen.getByText(/balanced & active/i)).toBeDefined();
    expect(screen.getByText(/muscle & strength/i)).toBeDefined();
    expect(screen.getByText(/fat loss & deficit/i)).toBeDefined();
    expect(screen.getByRole('button', {name: /start tracking/i})).toBeDefined();
  });

  it('updates form values when a preset is selected', () => {
    render(<OnboardingModal initialGoals={defaultGoals} installPrompt={null} onSave={vi.fn()}/>);
    const musclePreset = screen.getByText(/muscle & strength/i).closest('button');
    expect(musclePreset).toBeDefined();
    fireEvent.click(musclePreset!);

    expect(screen.getByDisplayValue('2500')).toBeDefined();
    expect(screen.getByDisplayValue('160')).toBeDefined();
  });

  it('submits customized goals on form submit', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<OnboardingModal initialGoals={defaultGoals} installPrompt={null} onSave={onSave}/>);

    const nameInput = screen.getByPlaceholderText(/e\.g\. alex/i);
    fireEvent.change(nameInput, {target: {value: 'Kailash'}});

    fireEvent.click(screen.getByRole('button', {name: /start tracking/i}));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Kailash',
      calories: 2200,
      protein: 120
    }));
  });
});
