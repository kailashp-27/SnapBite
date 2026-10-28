import type {Food} from './types';
import nutritionMatches from './nutrition-matches.json';

const aliases: Record<string, string[]> = {
  biryani: ['chicken-biryani', 'veg-biryani'], dosa: ['plain-dosa', 'dosa'], dal: ['dal'], paneer: ['paneer'],
  cholebhature: ['chole-bhature'], dabeli: ['dabeli'], dhokla: ['dhokla'], jalebi: ['jalebi'], kathiroll: ['kathi-roll'],
  kofta: ['kofta'], naan: ['naan'], pakora: ['pakora'], panipuri: ['pani-puri'], pavbhaji: ['pav-bhaji'], vadapav: ['vada-pav'],
  hamburger: ['burger'], french_fries: ['fries'], grilled_salmon: ['salmon'], chicken_curry: ['chicken-curry'],
  omelette: ['omelette'], frozen_yogurt: ['frozen-yogurt'], pizza: ['pizza'], club_sandwich: ['sandwich'],
  samosa: ['samosa'], fried_rice: ['fried-rice'], pancakes: ['pancakes'],
  spaghetti_bolognese: ['pasta'], spaghetti_carbonara: ['pasta'], caesar_salad: ['caesar-salad'], greek_salad: ['salad'],
};
export const displayLabel = (label: string) => ({cholebhature: 'Chole Bhature', kathiroll: 'Kathi Roll', panipuri: 'Pani Puri', pavbhaji: 'Pav Bhaji', vadapav: 'Vada Pav'}[label] ?? label.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()));
export const foodIdsForLabel = (label: string): string[] => (nutritionMatches as Record<string, string[]>)[label] ?? aliases[label] ?? [label.replaceAll('_', '-')];
export function matchingFoods(label: string, foods: Food[]): Food[] {
  const ids = foodIdsForLabel(label);
  const normalized = label.replaceAll('_', ' ').toLowerCase();
  return foods.filter(food => ids.includes(food.id) || food.name.toLowerCase() === normalized || food.aliases?.some(alias => alias.toLowerCase() === normalized));
}
export function suggestedSearch(label: string): string {
  const searches: Record<string, string> = {biryani: 'biryani', dosa: 'dosa', paneer: 'paneer', hamburger: 'burger', french_fries: 'fries', grilled_salmon: 'salmon'};
  return searches[label] ?? label.replaceAll('_', ' ');
}
