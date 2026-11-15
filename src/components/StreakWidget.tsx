import {Award, Check, Flame, TrendingUp} from 'lucide-react';
import type {StreakStats} from '../streak';

interface StreakWidgetProps {
  stats: StreakStats;
}

export default function StreakWidget({stats}: StreakWidgetProps) {
  const diff = stats.thisWeekCompleted - stats.lastWeekCompleted;

  return (
    <div className="card streak-card" style={{padding: '18px 17px', marginBottom: '16px'}}>
      <div className="card-title" style={{marginBottom: '14px'}}>
        <h2 style={{fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px'}}>
          <Flame size={18} style={{color: stats.currentStreak > 0 ? '#ff9a5b' : '#92938e'}}/>
          Goal streak
        </h2>
        <span className="tiny-label" style={{letterSpacing: '0.6px'}}>
          CONSISTENCY
        </span>
      </div>

      <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '16px'}}>
        <div style={{display: 'flex', alignItems: 'baseline', gap: '6px'}}>
          <strong style={{fontSize: '28px', fontWeight: 600, color: stats.currentStreak > 0 ? '#ffb076' : '#d2d5cb'}}>
            {stats.currentStreak}
          </strong>
          <span style={{fontSize: '11px', color: '#9ba291'}}>
            {stats.currentStreak === 1 ? 'day streak' : 'days streak'}
          </span>
        </div>
        {stats.bestStreak > 0 && (
          <span
            style={{
              fontSize: '9px',
              color: '#a8b695',
              border: '1px solid #3d4633',
              borderRadius: '5px',
              padding: '3px 7px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <Award size={12} style={{color: 'var(--lime)'}}/> Best {stats.bestStreak}d
          </span>
        )}
      </div>

      {/* 7-day circular status row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: '6px',
          padding: '10px 0',
          borderTop: '1px solid #282c23',
          borderBottom: '1px solid #282c23',
          marginBottom: '14px',
          textAlign: 'center'
        }}
        aria-label="Last 7 days goal status"
      >
        {stats.recentDays.map((day, idx) => (
          <div key={day.date} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px'}}>
            <span style={{fontSize: '8px', color: idx === 6 ? 'var(--lime)' : '#7f8875'}}>
              {idx === 6 ? 'Today' : day.dayLabel}
            </span>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                fontSize: '10px',
                background:
                  day.status === 'completed'
                    ? '#c3f66b1a'
                    : day.status === 'exceeded'
                    ? '#ff7a7a1a'
                    : '#21251c',
                border:
                  day.status === 'completed'
                    ? '1.5px solid var(--lime)'
                    : day.status === 'exceeded'
                    ? '1.5px solid #ff7a7a'
                    : '1px dashed #3a4132',
                color:
                  day.status === 'completed'
                    ? 'var(--lime)'
                    : day.status === 'exceeded'
                    ? '#ff9494'
                    : '#5a6250'
              }}
              title={`${day.date}: ${day.calories} kcal (${day.status})`}
            >
              {day.status === 'completed' ? (
                <Check size={12}/>
              ) : day.status === 'exceeded' ? (
                <Flame size={12}/>
              ) : (
                '·'
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Weekly summary comparison */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px'}}>
        <div style={{color: '#9ba48f'}}>
          This week:{' '}
          <strong style={{color: '#e4eadb', fontWeight: 500}}>
            {stats.thisWeekCompleted} / 7 days
          </strong>
        </div>
        <div style={{color: '#8b967f', fontSize: '9px'}}>
          Last week: {stats.lastWeekCompleted} / 7
        </div>
      </div>

      {diff !== 0 && (
        <div
          style={{
            marginTop: '8px',
            fontSize: '9px',
            color: diff > 0 ? '#b6e379' : '#e0a98b',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <TrendingUp size={11}/>
          {diff > 0
            ? `+${diff} day${diff === 1 ? '' : 's'} vs previous week`
            : `${diff} day${diff === -1 ? '' : 's'} vs previous week`}
        </div>
      )}
    </div>
  );
}
