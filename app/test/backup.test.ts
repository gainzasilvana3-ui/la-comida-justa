import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { createBackup, parseBackup, restoreBackup } from '../src/db/backup';
import type { Recipe } from '@lcj/shared';

const myRecipe: Recipe = {
  id: 'mi-guiso',
  name: 'Mi guiso',
  category: 'sopas_y_guisos',
  refPortions: 2,
  ingredients: [{ name: 'Lentejas', qty: 150.5, unit: 'g', state: 'crudo', role: 'principal', category: 'almacen' }],
  steps: ['Cocinar'],
  timeMinutes: 40,
  conservation: { fridgeDays: 3, freezerMonths: 2, notes: '' },
  batchFriendly: true,
  allergens: [],
  substitutions: [],
  source: 'propia',
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('copia de seguridad', () => {
  it('exporta datos del usuario sin licencia ni claves', async () => {
    await db.recipes.put(myRecipe);
    await db.pantry.put({ id: 'p1', name: 'Arroz', qty: 1, unit: 'kg', location: 'despensa' });
    await db.prefs.put({ key: 'favorites', value: ['mi-guiso'] });
    await db.prefs.put({ key: 'activeListId', value: 'x' });
    await db.license.put({ key: 'current', token: 'SECRETO.TOKEN.FIRMA', deviceId: 'dev', recoveryCode: 'RCP-AAAA-BBBB-CCCC-DDDD-EEEE' });

    const backup = await createBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain('SECRETO');
    expect(text).not.toContain('RCP-');
    expect(text).not.toContain('activeListId');
    expect(backup.data.recipes).toHaveLength(1);
    expect(backup.data.preferences).toEqual({ favorites: ['mi-guiso'] });
  });

  it('valida el archivo antes de importar', () => {
    expect(parseBackup('no es json').ok).toBe(false);
    expect(parseBackup('{"format":"otra-cosa"}').ok).toBe(false);
    const bad = parseBackup(
      JSON.stringify({
        format: 'la-comida-justa-respaldo',
        version: 1,
        exportedAt: 'x',
        appVersion: '1',
        data: { recipes: [{ ...myRecipe, refPortions: -3 }], plans: [], dinerGroups: [], pantry: [], shoppingLists: [], prices: [], monthPlans: [], preferences: {} },
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it('reemplaza todo o combina, sin tocar la licencia', async () => {
    await db.recipes.put(myRecipe);
    await db.license.put({ key: 'current', token: 't', deviceId: 'd' });
    const backup = await createBackup();

    await db.recipes.put({ ...myRecipe, id: 'otra', name: 'Otra' });
    await db.pantry.put({ id: 'p9', name: 'Leche', qty: 1, unit: 'l', location: 'heladera' });

    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary.recipes).toBe(1);

    await restoreBackup(parsed.backup, 'merge');
    expect(await db.recipes.count()).toBe(2);
    expect(await db.pantry.count()).toBe(1);

    await restoreBackup(parsed.backup, 'replace');
    expect((await db.recipes.toArray()).map((r) => r.id)).toEqual(['mi-guiso']);
    expect(await db.pantry.count()).toBe(0);
    expect(await db.license.get('current')).toBeTruthy();
  });

  it('las cantidades decimales sobreviven el viaje', async () => {
    await db.recipes.put(myRecipe);
    const parsed = parseBackup(JSON.stringify(await createBackup()));
    if (!parsed.ok) throw new Error(parsed.error);
    await db.recipes.clear();
    await restoreBackup(parsed.backup, 'replace');
    expect((await db.recipes.get('mi-guiso'))!.ingredients[0]!.qty).toBe(150.5);
  });
});
