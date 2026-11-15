import {useState, type FormEvent} from 'react';
import {Check, Download, ShieldCheck, Sparkles, UtensilsCrossed} from 'lucide-react';
import type {Goals} from '../types';
import Modal from './Modal';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}

interface OnboardingModalProps {
  initialGoals: Goals;
  installPrompt: BeforeInstallPromptEvent | null;
  onSave: (goals: Goals) => Promise<void>;
}

const presets: {title: string; desc: string; goals: Omit<Goals, 'name'>}[] = [
  {
    title: 'Balanced & Active',
    desc: 'Daily vitality and balanced macros',
    goals: {calories: 2200, protein: 120, carbs: 275, fat: 73, water: 8}
  },
  {
    title: 'Muscle & Strength',
    desc: 'Higher protein for recovery and growth',
    goals: {calories: 2500, protein: 160, carbs: 260, fat: 80, water: 10}
  },
  {
    title: 'Fat Loss & Deficit',
    desc: 'Moderate deficit with protein preservation',
    goals: {calories: 1800, protein: 130, carbs: 180, fat: 60, water: 8}
  }
];

export default function OnboardingModal({initialGoals, installPrompt, onSave}: OnboardingModalProps) {
  const [draft, setDraft] = useState<Goals>(initialGoals);
  const [saving, setSaving] = useState(false);
  const [installed, setInstalled] = useState(false);

  function applyPreset(presetGoals: Omit<Goals, 'name'>) {
    setDraft(current => ({
      ...current,
      ...presetGoals
    }));
  }

  async function handleInstall() {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      // Ignore prompt errors
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        ...draft,
        name: draft.name.trim().slice(0, 40)
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Welcome to SnapBite" onClose={() => {}} wide>
      <form onSubmit={handleSubmit} style={{padding: '20px 24px'}}>
        <div style={{textAlign: 'center', marginBottom: '22px'}}>
          <span
            style={{
              display: 'inline-grid',
              placeItems: 'center',
              width: '48px',
              height: '48px',
              background: 'var(--lime)',
              color: '#203015',
              borderRadius: '14px',
              marginBottom: '12px'
            }}
          >
            <UtensilsCrossed size={28}/>
          </span>
          <h3 style={{fontSize: '18px', fontWeight: 600, color: '#f0f4ea'}}>
            Let’s personalize your food diary
          </h3>
          <p style={{fontSize: '11px', color: '#9ba68e', marginTop: '6px', lineHeight: 1.6}}>
            Set your daily goals. Everything is saved 100% locally on this device.
          </p>
        </div>

        {/* User name input */}
        <label style={{display: 'block', marginBottom: '20px'}}>
          <span style={{fontSize: '11px', color: '#a6b299'}}>What should we call you?</span>
          <input
            type="text"
            required
            autoFocus
            maxLength={40}
            placeholder="e.g. Alex"
            value={draft.name}
            onChange={e => setDraft({...draft, name: e.target.value})}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '12px',
              background: '#151811',
              border: '1px solid #3b4430',
              borderRadius: '7px',
              color: '#e3eadb',
              fontSize: '13px'
            }}
          />
        </label>

        {/* Goal presets */}
        <div style={{marginBottom: '20px'}}>
          <span style={{fontSize: '11px', color: '#a6b299', display: 'flex', alignItems: 'center', gap: '6px'}}>
            <Sparkles size={14} style={{color: 'var(--lime)'}}/>
            Choose a starting focus
          </span>
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '10px'}}>
            {presets.map(preset => {
              const active = draft.calories === preset.goals.calories && draft.protein === preset.goals.protein;
              return (
                <button
                  type="button"
                  key={preset.title}
                  onClick={() => applyPreset(preset.goals)}
                  style={{
                    padding: '10px 8px',
                    border: active ? '1.5px solid var(--lime)' : '1px solid #38422f',
                    background: active ? '#c3f66b10' : '#1d2217',
                    borderRadius: '8px',
                    textAlign: 'left',
                    color: active ? 'var(--lime)' : '#c3ceb7'
                  }}
                >
                  <strong style={{fontSize: '11px', display: 'block'}}>{preset.title}</strong>
                  <span style={{fontSize: '8px', color: '#8d9c7c', display: 'block', marginTop: '4px'}}>
                    {preset.goals.calories} kcal · {preset.goals.protein}g P
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target numbers */}
        <div className="form-row" style={{marginBottom: '20px'}}>
          <label>
            Daily Calories (kcal)
            <input
              type="number"
              required
              min="500"
              max="10000"
              value={draft.calories || ''}
              onChange={e => setDraft({...draft, calories: Number(e.target.value)})}
            />
          </label>
          <label>
            Daily Water (glasses)
            <input
              type="number"
              required
              min="1"
              max="40"
              value={draft.water || ''}
              onChange={e => setDraft({...draft, water: Number(e.target.value)})}
            />
          </label>
        </div>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px'}}>
          <label>
            Protein (g)
            <input
              type="number"
              required
              min="10"
              max="600"
              value={draft.protein || ''}
              onChange={e => setDraft({...draft, protein: Number(e.target.value)})}
            />
          </label>
          <label>
            Carbs (g)
            <input
              type="number"
              required
              min="10"
              max="1000"
              value={draft.carbs || ''}
              onChange={e => setDraft({...draft, carbs: Number(e.target.value)})}
            />
          </label>
          <label>
            Fats (g)
            <input
              type="number"
              required
              min="5"
              max="400"
              value={draft.fat || ''}
              onChange={e => setDraft({...draft, fat: Number(e.target.value)})}
            />
          </label>
        </div>

        {/* Optional Install Prompt */}
        {installPrompt && !installed && (
          <div
            style={{
              padding: '12px 14px',
              border: '1px solid #3c4930',
              borderRadius: '9px',
              background: '#232c1c',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}
          >
            <div>
              <strong style={{fontSize: '11px', display: 'block', color: '#e0ebd2'}}>
                Install SnapBite on your device
              </strong>
              <small style={{fontSize: '9px', color: '#97a688'}}>
                Instant launch and offline access from your home screen.
              </small>
            </div>
            <button
              type="button"
              className="secondary-button"
              style={{fontSize: '10px', padding: '6px 12px', whiteSpace: 'nowrap'}}
              onClick={() => void handleInstall()}
            >
              <Download size={14}/> Install
            </button>
          </div>
        )}

        <div style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#889874', fontSize: '9px', marginBottom: '18px'}}>
          <ShieldCheck size={14}/>
          <span>You can change these goals anytime in Settings.</span>
        </div>

        <button
          type="submit"
          className="primary-button full"
          disabled={saving || !draft.name.trim()}
          style={{padding: '12px 18px', fontSize: '13px'}}
        >
          <Check size={18}/>
          {saving ? 'Setting up…' : 'Start tracking'}
        </button>
      </form>
    </Modal>
  );
}
