import {number} from '../format';

interface Props {name: string; value: number; goal: number; color: string; icon: string;}

export default function Macro({name, value, goal, color, icon}: Props) {
  return <div className={`card macro-card ${color}`}>
    <span className="macro-icon">{icon}</span>
    <div className="macro-content">
      <div>
        <h3>{name}</h3>
        <strong className={value > goal ? 'over-text' : ''}>{number(value)}<small> / {goal} g</small></strong>
      </div>
      <div className="progress-track" role="progressbar" aria-label={`${name}: ${number(value)} of ${goal} grams`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(value, goal)}>
        <span style={{width: `${Math.min(value / goal, 1) * 100}%`}}/>
      </div>
    </div>
  </div>;
}
