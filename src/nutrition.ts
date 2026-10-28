import type {Food} from './types';

export function nutritionBasis(food: Food): string {
  if (food.nutritionKind === 'usda') return 'USDA reference';
  if (food.nutritionKind === 'reference-recipe') return 'Reference recipe estimate';
  if (food.source.startsWith('SnapBite starter')) return 'Starter estimate';
  if (food.id.startsWith('custom:')) return 'Your nutrition entry';
  return 'Imported nutrition';
}
