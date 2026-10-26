import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../db/db';
import { syncCatalog } from '../catalog/catalog';
import { readAccess, renew, shouldRenew, type AccessState } from './client';

interface AccessCtx {
  state: AccessState;
  refresh: () => Promise<void>;
  renewNow: () => Promise<string | null>;
  catalogMessage: string | null;
  latestAppVersion?: string;
}

const Ctx = createContext<AccessCtx>({
  state: { kind: 'loading' },
  refresh: async () => {},
  renewNow: async () => null,
  catalogMessage: null,
});

export const useAccess = () => useContext(Ctx);

export function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccessState>({ kind: 'loading' });
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [latestAppVersion, setLatest] = useState<string | undefined>();
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setState(await readAccess());
    } catch (e) {
      console.error(e);
      setState({ kind: 'none' });
    }
  }, []);

  const doRenew = useCallback(async (): Promise<string | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      const r = await renew();
      if (r.latestAppVersion) setLatest(r.latestAppVersion);
      const local = await db.catalog.get('current');
      if (r.ok && (!local || (r.catalogVersion ?? 0) > local.catalog.version)) {
        const c = await syncCatalog();
        setCatalogMessage(c.error ?? null);
      }
      await refresh();
      return r.ok ? null : r.error?.message ?? null;
    } finally {
      busy.current = false;
    }
  }, [refresh]);

  // Al abrir, al recuperar conexión y cada 6 horas: renovar si corresponde.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const current = await readAccess();
      if (cancelled) return;
      setState(current);
      const row = await db.license.get('current');
      setLatest(row?.latestAppVersion);
      if (current.kind !== 'none' && current.kind !== 'blocked' && navigator.onLine && shouldRenew(current, row)) {
        await doRenew();
      }
      if (current.kind === 'active' && navigator.onLine && !(await db.catalog.get('current'))) {
        const c = await syncCatalog();
        if (!cancelled) setCatalogMessage(c.error ?? null);
      }
    };
    void check();
    const onOnline = () => void check();
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => void check(), 6 * 3600 * 1000);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [doRenew]);

  return <Ctx.Provider value={{ state, refresh, renewNow: doRenew, catalogMessage, latestAppVersion }}>{children}</Ctx.Provider>;
}
