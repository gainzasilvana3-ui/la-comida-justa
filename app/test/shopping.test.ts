import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/db';
import { addManualItem, addToActiveList, checkedToPantry, createList, listAsText, mergeRecalculated, recalcList, itemsFrom } from '../src/lib/shopping';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const arroz = (qty: number) => ({ name: 'Arroz', qty, unit: 'g' as const, state: 'crudo' as const, category: 'almacen' as const });

describe('lista de compras guardada', () => {
  it('crea la lista descontando lo que ya hay', async () => {
    await db.pantry.put({ id: 'p', name: 'arroz', qty: 200, unit: 'g', location: 'despensa' });
    const list = await createList('Semana', [arroz(300), arroz(200)]);
    expect(list.items[0]).toMatchObject({ calculated: 500, available: 200, toBuy: 300 });
    expect((await db.prefs.get('activeListId'))?.value).toBe(list.id);
  });

  it('sin historial reemplaza la lista anterior; con historial la conserva', async () => {
    const a = await createList('A', [arroz(100)]);
    await createList('B', [arroz(100)]);
    expect(await db.shoppingLists.get(a.id)).toBeUndefined();
    await db.prefs.put({ key: 'keepHistory', value: true });
    await createList('C', [arroz(100)]);
    expect(await db.shoppingLists.count()).toBe(2);
  });

  it('recalcular conserva marcados, ediciones y productos a mano', async () => {
    let list = await createList('Semana', [arroz(300)]);
    list = addManualItem(list, 'Detergente', 1, 'u', 'otros');
    list.items[0] = { ...list.items[0]!, checked: true, manualQty: 1000 };
    await db.shoppingLists.put(list);
    await recalcList(list.id, [arroz(600), { name: 'Leche', qty: 1, unit: 'l', category: 'lacteos_huevos' }]);
    const after = (await db.shoppingLists.get(list.id))!;
    const a = after.items.find((i) => i.name === 'Arroz')!;
    expect(a).toMatchObject({ calculated: 600, checked: true, manualQty: 1000 });
    expect(after.items.some((i) => i.name === 'Detergente' && i.manual)).toBe(true);
    expect(after.items.some((i) => i.name === 'Leche')).toBe(true);
  });

  it('agregar a la lista activa suma en vez de duplicar', async () => {
    await createList('Semana', [arroz(300)]);
    const updated = await addToActiveList([arroz(200)], 'Nueva');
    const arr = updated.items.filter((i) => i.name === 'Arroz');
    expect(arr).toHaveLength(1);
    expect(arr[0]!.calculated).toBe(500);
  });

  it('comparte en texto y pasa lo comprado a la despensa', async () => {
    const list = await createList('Semana', [arroz(1500), { name: 'Huevo', qty: 2.3, unit: 'u', category: 'lacteos_huevos' }]);
    expect(listAsText(list)).toContain('Arroz — 1,5 kg');
    expect(listAsText(list)).toContain('Huevo — 3 unidades');
    list.items = list.items.map((i) => ({ ...i, checked: true }));
    expect(await checkedToPantry(list)).toBe(2);
    const pantry = await db.pantry.toArray();
    expect(pantry.find((p) => p.name === 'Huevo')).toMatchObject({ qty: 3, unit: 'u', location: 'heladera' });
  });

  it('mergeRecalculated no pierde productos manuales', async () => {
    const fresh = await itemsFrom([arroz(100)]);
    const merged = mergeRecalculated([{ ...fresh[0]!, id: 'm', manual: true, name: 'Pan', key: undefined }], fresh);
    expect(merged.map((i) => i.name).sort()).toEqual(['Arroz', 'Pan']);
  });
});
