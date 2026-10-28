import {number, formatDate} from './format';
import Macro from './components/Macro';
import Modal from './components/Modal';
import FoodPicker from './components/FoodPicker';
import Scanner from './components/Scanner';
import Insights from './components/Insights';
import Settings from './components/Settings';
import {useEffect, useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {BarChart3, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Coffee, Droplets, Flame, Home, Leaf, Minus, Moon, Plus, ScanLine, Settings2, ShieldCheck, Sun, Utensils, UtensilsCrossed, X} from 'lucide-react';
import {db, initializeLibrary, setWater} from './db';
import {dateKey, defaultGoals, meals, shiftDate, sumNutrition, type Food, type Meal, type Tab} from './types';

const navigation: {id: Tab; label: string; icon: typeof Home}[] = [{id: 'dashboard', label: 'Overview', icon: Home}, {id: 'diary', label: 'Food diary', icon: Utensils}, {id: 'scanner', label: 'Food scanner', icon: ScanLine}, {id: 'insights', label: 'Insights', icon: BarChart3}, {id: 'settings', label: 'Settings', icon: Settings2}];
const mealIcons = {Breakfast: Sun, Lunch: Coffee, Dinner: Moon, Snacks: Leaf};

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');
  useEffect(() => {window.scrollTo(0, 0);}, [tab]);
  const [date, setDate] = useState(dateKey());
  const [online, setOnline] = useState(navigator.onLine);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState('');
  const [adding, setAdding] = useState<Meal | null>(null);
  const [initialSearch, setInitialSearch] = useState('');
  const [initialFood, setInitialFood] = useState<Food | null>(null);
  const [initialCandidates, setInitialCandidates] = useState<Food[]>([]);
  const [help, setHelp] = useState(false);
  const [update, setUpdate] = useState(false);
  const logs = useLiveQuery(() => db.dailyLogs.where('date').equals(date).sortBy('createdAt'), [date]) ?? [];
  const storedGoals = useLiveQuery(() => db.preferences.get('goals'));
  const goals = storedGoals?.value ?? defaultGoals;
  const water = useLiveQuery(() => db.days.get(date), [date]);
  const libraryCount = useLiveQuery(() => db.foodLibrary.count()) ?? 0;
  const totals = sumNutrition(logs);
  const remaining = goals.calories - totals.calories;
  function notify(message: string) { setToast(message); }
  useEffect(() => {
    initializeLibrary().then(() => setReady(true)).catch(e => setError(e instanceof Error ? e.message : 'Unable to open local storage.'));
    const on = () => setOnline(true), off = () => setOnline(false), refresh = () => setUpdate(true), cached = () => setToast('SnapBite is ready to use offline');
    window.addEventListener('online', on); window.addEventListener('offline', off); window.addEventListener('snapbite-update', refresh); window.addEventListener('snapbite-offline', cached);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('snapbite-update', refresh); window.removeEventListener('snapbite-offline', cached); };
  }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  const openAdd = (meal: Meal, query = '', food: Food | null = null, candidates: Food[] = []) => {setInitialCandidates(candidates); setInitialFood(food); setInitialSearch(query); setAdding(meal);};
  const run = async (action: () => Promise<unknown>, message?: string) => {try {await action(); if (message) notify(message);} catch(e) {notify(e instanceof Error ? e.message : 'Something went wrong. Please try again.');}};

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => {e.preventDefault(); setTab('dashboard');}}><span className="brand-mark"><UtensilsCrossed size={23}/></span>snapbite<span className="brand-dot">.</span></a>
      
      <nav aria-label="Main navigation">{navigation.map(({id, label, icon: Icon}) => <button key={id} className={`nav-item ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}><Icon size={20}/><span>{label}</span>{id === 'scanner' && <span className="nav-new">AI</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="private-note"><ShieldCheck size={22}/><strong>Your data. Your device.</strong><p>Stored locally. No account needed.</p></div><button className="help-link" onClick={() => setHelp(true)}><CircleHelp size={17}/> Help</button><div className="sidebar-user"><span className="avatar">{(goals.name || 'Y').slice(0, 1).toUpperCase()}</span><div><strong>{goals.name || 'Your space'}</strong></div><button aria-label="Open profile settings" className="icon-button" onClick={() => setTab('settings')}><Settings2 size={17}/></button></div></div>
    </aside>

    <div className="main-shell">
      <header className="topbar"><div className="breadcrumb">Your space <ChevronRight size={14}/><span>{navigation.find(item => item.id === tab)?.label}</span></div><a className="mobile-brand" href="#" onClick={e => {e.preventDefault(); setTab('dashboard');}}><UtensilsCrossed size={21}/>snapbite.</a><div className="topbar-right"><span className="connection"><span className={online ? 'status-dot' : 'status-dot offline'}/>{online ? 'Local-first, always' : 'You’re offline'}</span></div></header>
      <main>
        {error && <div role="alert" className="error-banner">{error}<button onClick={() => location.reload()}>Retry</button></div>}
        {update && <div className="notice">A fresh version is ready. Close all SnapBite tabs and reopen to update.<button aria-label="Dismiss update notice" onClick={() => setUpdate(false)}><X size={16}/></button></div>}
        <div className="page-heading"><h1>{tab === 'dashboard' ? `Daily overview${goals.name ? `, ${goals.name.split(' ')[0]}` : ''}` : tab === 'diary' ? 'Food diary' : tab === 'scanner' ? 'Food scanner' : tab === 'insights' ? 'Insights' : 'Settings'}</h1>{(tab === 'dashboard' || tab === 'diary') && <div className="date-picker"><button aria-label="Previous day" className="icon-button" onClick={() => setDate(shiftDate(date, -1))}><ChevronLeft size={16}/></button><label><span>{date === dateKey() ? 'Today' : formatDate(date, {weekday: 'short'})}, {formatDate(date, {month: 'short', day: 'numeric'})}</span><input type="date" aria-label="Select diary date" value={date} onChange={e => {if (e.target.value) setDate(e.target.value);}}/></label><button aria-label="Next day" className="icon-button" onClick={() => setDate(shiftDate(date, 1))}><ChevronRight size={16}/></button></div>}</div>

        {(tab === 'dashboard' || tab === 'diary') && <>
          {tab === 'dashboard' && <section className="balance-grid" aria-label="Daily nutrition overview">
            <div className="card calorie-card"><div className="card-title"><h2>Calories overview</h2><span className="subtle-chip"><Flame size={12}/> DAILY FUEL</span></div><div className="calorie-body"><div className={`calorie-ring ${remaining < 0 ? 'over' : ''}`} style={{'--progress': `${Math.min(totals.calories / goals.calories, 1) * 100}%`} as React.CSSProperties}><div className="ring-inner"><Flame size={23}/><strong>{number(Math.abs(remaining))}</strong><span>kcal {remaining < 0 ? 'over goal' : 'remaining'}</span></div></div><div className="calorie-details"><div><span className="legend-dot lime"/><div><small>Consumed</small><strong>{number(totals.calories)} <span>kcal</span></strong></div></div><div><span className="legend-dot gray"/><div><small>Daily goal</small><strong>{number(goals.calories)} <span>kcal</span></strong></div></div><span className={`on-track ${remaining < 0 ? 'over-text' : ''}`}>{remaining < 0 ? <Flame size={13}/> : <Check size={13}/>} {remaining < 0 ? 'Above your daily goal' : totals.calories === 0 ? 'No food logged' : 'Within daily goal'}</span></div></div></div>
            <div className="macro-column"><Macro name="Protein" value={totals.protein} goal={goals.protein} color="lavender" icon="P"/><Macro name="Carbs" value={totals.carbs} goal={goals.carbs} color="orange" icon="C"/><Macro name="Fats" value={totals.fat} goal={goals.fat} color="yellow" icon="F"/></div>
          </section>}

          <div className="content-columns"><section className="meals-section"><div className="section-heading"><div><h2>Your meals <span className="count-pill">{logs.length} {logs.length === 1 ? "food" : "foods"}</span></h2></div><button className="text-button" onClick={() => openAdd('Snacks')}><Plus size={16}/> Add food</button></div><div className={`meal-grid ${tab === 'diary' ? 'diary-grid' : ''}`}>{meals.map(meal => {
            const entries = logs.filter(log => log.meal === meal), kcal = entries.reduce((sum, log) => sum + log.calories, 0), Icon = mealIcons[meal];
            return <article className="card meal-card" key={meal}><div className="meal-header"><span className={`meal-icon ${meal.toLowerCase()}`}><Icon size={19}/></span><div><h3>{meal}</h3><span>{`${number(kcal)} kcal`}</span></div><button className="add-round" aria-label={`Add food to ${meal}`} onClick={() => openAdd(meal)}><Plus size={18}/></button></div>{entries.length > 0 ? <ul className="food-entries">{entries.map(entry => <li key={entry.id}><span className="food-emoji">{entry.emoji}</span><div><strong>{entry.name}</strong><small>{entry.photoEstimate ? `Estimated · ${entry.photoEstimate.description}` : <>{entry.grams ? `${number(entry.grams)} g · ` : ""}{Number(entry.portions.toFixed(2))} × {entry.serving}</>}</small></div><span className="food-kcal">{number(entry.calories)}<small>kcal</small></span><button className="delete-food" aria-label={`Remove ${entry.name}`} onClick={() => run(() => db.dailyLogs.delete(entry.id!), 'Food removed')}><X size={14}/></button></li>)}</ul> : <button className="empty-meal" onClick={() => openAdd(meal)}><span className="empty-plate"><Utensils size={23}/></span><strong>Add {meal.toLowerCase()}</strong></button>}<div className="meal-footer"><span>P <b>{number(sumNutrition(entries).protein)}g</b></span><span>C <b>{number(sumNutrition(entries).carbs)}g</b></span><span>F <b>{number(sumNutrition(entries).fat)}g</b></span><span>{entries.length ? `${entries.length} item${entries.length > 1 ? 's' : ''}` : 'Not logged yet'}</span></div></article>;
          })}</div></section>
          <aside className="right-column"><div className="card water-card"><div className="card-title"><h2><Droplets size={18}/> Stay hydrated</h2><span className="tiny-label">250 ML / GLASS</span></div><div className="water-count"><strong>{water?.water ?? 0}<span> / {goals.water}</span></strong><span>glasses</span></div><div className="water-glasses">{Array.from({length: Math.min(goals.water, 12)}, (_, index) => <button key={index} className={`glass ${(water?.water ?? 0) > index ? 'filled' : ''}`} aria-label={`Set water to ${index + 1} ${index === 0 ? "glass" : "glasses"}`} onClick={() => run(() => db.days.put({date, water: index + 1}))}><svg viewBox="0 0 24 30" aria-hidden="true"><path d="M3 3h18l-3 24H6Z"/><path className="water-fill" d="m5 12 3 1 4-2 4 2 3-1-2 13H7Z"/></svg></button>)}</div><div className="water-actions"><button aria-label="Remove one glass" className="secondary-button" disabled={!water?.water} onClick={() => run(() => setWater(date, -1))}><Minus size={16}/></button><button className="water-add" onClick={() => run(() => setWater(date, 1), 'Water logged')}><Plus size={16}/> Add a glass</button></div></div>
          </aside></div>
        </>}
        {tab === 'scanner' && <Scanner date={date} libraryReady={ready} onLogged={()=>setTab('diary')} onPick={(query, food, candidates) => openAdd(new Date().getHours() < 11 ? 'Breakfast' : new Date().getHours() < 17 ? 'Lunch' : 'Dinner', query, food ?? null, candidates)} notify={notify}/>}
        {tab === 'insights' && <Insights date={dateKey()} goals={goals}/>}
        {tab === 'settings' && <Settings goals={goals} count={libraryCount} notify={notify}/>}
        <footer className="page-footer"><span><span className="status-dot"/> {ready ? `${libraryCount} foods ready offline` : 'Preparing your food library…'} <span className="footer-divider">/</span> SnapBite v0.1</span></footer>
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile navigation">{navigation.map(({id, label, icon: Icon}) => <button key={id} className={`${tab === id ? 'active' : ''} ${id === 'scanner' ? 'mobile-scan' : ''}`} onClick={() => setTab(id)}><span><Icon size={21}/></span><small>{id === 'dashboard' ? 'Home' : id === 'scanner' ? 'Scan' : label === 'Food diary' ? 'Diary' : label}</small></button>)}</nav>
    {adding && <FoodPicker meal={adding} date={date} initialSearch={initialSearch} initialFood={initialFood} initialCandidates={initialCandidates} onClose={() => setAdding(null)} notify={notify}/>}
    {help && <Modal title="Help" onClose={() => setHelp(false)}><div className="help-content"><p>Use <strong>Add food</strong> to search your offline library, choose a portion, and save it to a meal. Your daily totals update automatically.</p><p>Change dates to review past meals. Set personal goals and export a backup in Settings. Food values in the starter library are estimates; recipes and portions vary.</p><p>The camera keeps photos on your device. Enable the offline scanner once to download its model, then take a photo or choose one from your gallery. Review the suggested dish and confirm its recipe and portion before logging.</p><p>Install SnapBite from your browser’s menu after opening it online once. Storage is managed by your browser; export regular backups for safekeeping.</p></div></Modal>}
    {toast && <div className="toast" role="status"><CheckCheck size={18}/>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15}/></button></div>}
  </div>;
}

