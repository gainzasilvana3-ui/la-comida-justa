import type { Env } from './env';

export interface Settings {
  default_max_devices: number;
  transfers_per_year: number;
  current_catalog_version: number;
  latest_app_version: string;
}

const DEFAULTS: Settings = {
  default_max_devices: 2,
  transfers_per_year: 3,
  current_catalog_version: 0,
  latest_app_version: '1.0.0',
};

export async function getSettings(env: Env): Promise<Settings> {
  const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const s: Settings = { ...DEFAULTS };
  for (const r of results) {
    if (r.key === 'latest_app_version') s.latest_app_version = r.value;
    else if (r.key in s) (s as unknown as Record<string, number>)[r.key] = Number(r.value);
  }
  return s;
}

export async function setSetting(env: Env, key: keyof Settings, value: string | number): Promise<void> {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = ?2')
    .bind(key, String(value))
    .run();
}
