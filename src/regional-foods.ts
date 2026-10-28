import type {Food} from './types';

// Explicit starter estimates, not values measured by the recognition model.
const rows: [string, string, string, number, number, number, number, number, string[]][] = [
  ['plain-dosa', 'Plain dosa', '1 dosa', 100, 168, 4, 28, 4.5, ['dosa', 'dosai']],
  ['chole-bhature', 'Chole bhature', '1 plate', 300, 620, 17, 85, 24, ['cholebhature']],
  ['dabeli', 'Dabeli', '1 bun', 150, 300, 7, 47, 10, []],
  ['dhokla', 'Dhokla', '3 pieces', 100, 160, 6, 25, 4, []],
  ['jalebi', 'Jalebi', '2 pieces', 50, 220, 2, 38, 7, []],
  ['kathi-roll', 'Kathi roll', '1 roll', 200, 380, 14, 45, 16, ['kathiroll', 'kathi roll']],
  ['kofta', 'Malai kofta', '1 bowl', 200, 360, 9, 30, 23, ['kofta']],
  ['naan', 'Plain naan', '1 naan', 90, 260, 8, 48, 5, ['naan']],
  ['pakora', 'Vegetable pakora', '4 pieces', 100, 280, 6, 28, 16, ['pakoda', 'pakode']],
  ['pani-puri', 'Pani puri', '6 pieces', 150, 270, 6, 42, 9, ['panipuri', 'paani puri', 'golgappa']],
  ['vada-pav', 'Vada pav', '1 bun', 150, 290, 7, 45, 10, ['vadapav']],
  ['fried-rice', 'Vegetable fried rice', '1 bowl', 200, 330, 7, 55, 9, ['fried rice']],
  ['pancakes', 'Plain pancakes', '2 pancakes', 100, 230, 6, 30, 10, ['pancakes']],
  ['frozen-yogurt', 'Frozen yogurt', '1 cup', 150, 190, 6, 35, 4, []],
  ['caesar-salad', 'Caesar salad', '1 bowl', 200, 300, 10, 16, 22, []],
];
export const regionalFoods: Food[] = rows.map(([id, name, serving, grams, calories, protein, carbs, fat, aliases]) => ({id, name, category: id === 'plain-dosa' || ['chole-bhature','dabeli','dhokla','jalebi','kathi-roll','kofta','naan','pakora','pani-puri','vada-pav'].includes(id) ? 'Indian' : 'Other', serving, grams, calories, protein, carbs, fat, aliases, emoji: ['naan','plain-dosa'].includes(id) ? '🫓' : id === 'jalebi' ? '🥨' : '🍽️', source: 'SnapBite starter estimate; recipe and portion vary. Confirm before logging.'}));
