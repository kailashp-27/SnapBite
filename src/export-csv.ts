import type {DailyLog} from './types';

function escapeCsvField(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function exportLogsToCsv(logs: DailyLog[]): string {
  const headers = [
    'Date',
    'Meal',
    'Food Name',
    'Serving Description',
    'Portions',
    'Grams',
    'Calories (kcal)',
    'Protein (g)',
    'Carbohydrates (g)',
    'Fat (g)',
    'Photo Estimated'
  ];

  const rows = logs.map(log => [
    escapeCsvField(log.date),
    escapeCsvField(log.meal),
    escapeCsvField(log.name),
    escapeCsvField(log.serving),
    escapeCsvField(Number(log.portions.toFixed(2))),
    escapeCsvField(log.grams !== undefined ? Math.round(log.grams) : ''),
    escapeCsvField(Math.round(log.calories)),
    escapeCsvField(Number(log.protein.toFixed(1))),
    escapeCsvField(Number(log.carbs.toFixed(1))),
    escapeCsvField(Number(log.fat.toFixed(1))),
    escapeCsvField(log.photoEstimate ? 'Yes' : 'No')
  ]);

  // UTF-8 BOM (\uFEFF) ensures Excel opens emojis and foreign characters properly
  return '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
}
