import {useLiveQuery} from 'dexie-react-hooks';
import {ChartNoAxesColumnIncreasing, Flame, Leaf, Target} from 'lucide-react';
import {db} from '../db';
import {shiftDate, type Goals} from '../types';
import {weeklyInsights} from '../insights-data';
import {formatDate, number} from '../format';

export default function Insights({date, goals}: {date: string; goals: Goals}) {
  const start = shiftDate(date, -6);
  const logs = useLiveQuery(() => db.dailyLogs.where('date').between(start, date, true, true).toArray(), [start, date]);
  const insight = weeklyInsights(logs ?? [], date);
  const {days, averageCalories, averageProtein, largestMeal} = insight;
  const proteinPercent = averageProtein === null ? null : averageProtein / goals.protein * 100;
  const max = Math.max(goals.calories, ...days.map(day => day.calories));

  if (!logs) return <p className="field-hint" role="status">Loading your insights…</p>;

  return <>
    <div className="insight-stats useful-insights">
      <section className="card insight-card">
        <h2><Flame size={17}/> Average daily calories</h2>
        <strong className="insight-value">{averageCalories === null ? '—' : number(averageCalories)} <small>kcal</small></strong>
        <p className="insight-description">{averageCalories === null ? 'Log food to see your daily average.' : `Daily goal: ${number(goals.calories)} kcal`}</p>
        {averageCalories !== null && <div className="insight-detail"><span>Compared with your goal</span><b>{averageCalories < goals.calories ? `${number(goals.calories - averageCalories)} kcal below` : averageCalories > goals.calories ? `${number(averageCalories - goals.calories)} kcal above` : 'At goal'}</b></div>}
      </section>
      <section className="card insight-card">
        <h2><Target size={17}/> Protein goal progress</h2>
        <strong className="insight-value">{averageProtein === null ? '—' : number(averageProtein)} <small>/ {number(goals.protein)} g</small></strong>
        <p className="insight-description">{proteinPercent === null ? 'Log food to compare protein with your goal.' : `${number(proteinPercent)}% of your daily protein goal, on average.`}</p>
        <div className="insight-meter" role="meter" aria-label="Average daily protein goal progress" aria-valuemin={0} aria-valuemax={goals.protein} aria-valuenow={Math.min(averageProtein ?? 0, goals.protein)} aria-valuetext={averageProtein === null ? 'No logged meals' : `${number(averageProtein)} grams per logged day; goal ${goals.protein} grams`}><span style={{width: `${Math.min(proteinPercent ?? 0, 100)}%`}}/></div>
      </section>
      <section className="card insight-card meal-share-card">
        <h2><ChartNoAxesColumnIncreasing size={17}/> Biggest calorie share</h2>
        <strong className="insight-value meal-share-value">{largestMeal?.meal ?? '—'}</strong>
        <p className="insight-description">{largestMeal ? `${number(largestMeal.percent)}% of this week’s logged calories.` : 'Log food to see how calories are split across meals.'}</p>
        <dl className="meal-share-list">{insight.mealShares.map(meal => <div key={meal.meal}><dt>{meal.meal}</dt><dd><span className="meal-share-track"><span style={{width: `${meal.percent}%`}}/></span><span>{largestMeal ? `${number(meal.percent)}%` : '—'}</span></dd></div>)}</dl>
      </section>
    </div>
    <div className="insight-detail-grid">
      <section className="card macro-balance-card">
        <div className="card-title"><h2><ChartNoAxesColumnIncreasing size={17}/> Macro balance</h2><span className="subtle-chip">LAST 7 DAYS</span></div>
        <div className="macro-energy-bar" role="img" aria-label={insight.macroEnergy > 0 ? insight.macros.map(macro => `${macro.label}: ${number(macro.energyPercent)}% of macro energy`).join(', ') : 'No macro data logged'}>{insight.macros.map(macro => <span key={macro.key} className={`macro-segment ${macro.key}`} style={{width: `${macro.energyPercent}%`}}/>)}</div>
        <div className="macro-balance-labels"><span>Daily average</span><span>Share of macro energy</span></div>
        <dl className="macro-balance-list">{insight.macros.map(macro => <div key={macro.key}><dt><span className={`macro-dot ${macro.key}`}/>{macro.label}</dt><dd><strong>{macro.averageGrams === null ? '—' : number(macro.averageGrams)} <small>g</small></strong><span>{insight.macroEnergy > 0 ? `${number(macro.energyPercent)}%` : '—'}</span></dd></div>)}</dl>
      </section>
      <section className="card protein-sources-card">
        <div className="card-title"><h2><Leaf size={17}/> Top protein sources</h2><span className="subtle-chip">THIS WEEK</span></div>
        {insight.proteinSources.length ? <ol className="protein-source-list">{insight.proteinSources.map(food => <li key={food.foodId}><span className="protein-food-emoji" aria-hidden="true">{food.emoji || '🍽️'}</span><div><strong>{food.name}</strong><span>{number(food.percent)}% of logged protein</span></div><b>{number(food.protein)} <small>g</small></b></li>)}</ol> : <p className="insight-empty">Log foods with protein to see your top sources.</p>}
      </section>
    </div>
    <section className="card chart-card">
      <div className="card-title"><h2>Weekly calories</h2><span className="subtle-chip">LAST 7 DAYS</span></div>
      <p>{formatDate(start, {month: 'short', day: 'numeric'})} – {formatDate(date, {month: 'short', day: 'numeric'})}</p>
      <div className="week-chart"><div className="goal-line" style={{bottom: `${(goals.calories / max) * 190 + 32}px`}}><span>Goal {number(goals.calories)}</span></div>{days.map(day => <div className="chart-column" key={day.key} role="img" aria-label={`${formatDate(day.key, {weekday: 'long', month: 'short', day: 'numeric'})}: ${day.logged ? `${number(day.calories)} kcal` : 'No food logged'}`}><span>{day.logged ? number(day.calories) : '—'}</span><div className={`chart-bar ${day.calories > goals.calories ? 'exceeded' : ''} ${!day.logged ? 'unlogged' : ''}`} style={{height: `${day.logged ? Math.max(4, day.calories / max * 190) : 4}px`}}/><small>{formatDate(day.key, {weekday: 'short'})}</small></div>)}</div>
    </section>
  </>;
}
