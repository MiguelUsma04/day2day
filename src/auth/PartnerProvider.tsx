import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchPartnerId,
  fetchPartnerSnapshot,
  insertTodoFor,
  type PartnerSnapshot,
} from '../storage/partner';
import { createId } from '../utils/id';
import { ACCOUNTS } from './accounts';
import { useAuth } from './AuthProvider';

/**
 * Who is on screen: me (the local-first store) or my partner (a read-only
 * snapshot pulled from the server on demand, never stored locally).
 */

type Partner = { id: string; name: string };
type Viewing = 'me' | 'partner';

type PartnerValue = {
  /** Null when signed out or when no row in `partners` links this account. */
  partner: Partner | null;
  viewing: Viewing;
  setViewing: (v: Viewing) => void;
  snapshot: PartnerSnapshot | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addTodoForPartner: (title: string, date: string) => Promise<void>;
};

const PartnerContext = createContext<PartnerValue | null>(null);

function partnerName(myEmail: string | null | undefined): string {
  const mine = myEmail?.toLowerCase();
  return ACCOUNTS.find((a) => a.email !== mine)?.name ?? 'Pareja';
}

export function PartnerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [partner, setPartner] = useState<Partner | null>(null);
  const [viewing, setViewingRaw] = useState<Viewing>('me');
  const [snapshot, setSnapshot] = useState<PartnerSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Guards against a slow response landing after a newer one, or after sign-out. */
  const requestRef = useRef(0);

  // Look up the partner on sign-in; forget everything on sign-out or account switch.
  useEffect(() => {
    setPartner(null);
    setViewingRaw('me');
    setSnapshot(null);
    setError(null);
    requestRef.current++;
    if (!userId) return;
    let active = true;
    void fetchPartnerId(userId).then((id) => {
      if (!active || !id) return;
      setPartner({ id, name: partnerName(user?.email) });
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const partnerId = partner?.id ?? null;

  const refresh = useCallback(async () => {
    if (!partnerId) return;
    const req = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchPartnerSnapshot(partnerId);
      if (req === requestRef.current) setSnapshot(next);
    } catch (e) {
      if (req === requestRef.current) {
        setError(e instanceof Error ? e.message : 'No se pudo cargar');
      }
    } finally {
      if (req === requestRef.current) setLoading(false);
    }
  }, [partnerId]);

  const setViewing = useCallback(
    (v: Viewing) => {
      setViewingRaw(v);
      if (v === 'partner') void refresh();
    },
    [refresh],
  );

  // Back in the foreground while looking at the partner: their day may have moved on.
  useEffect(() => {
    if (viewing !== 'partner' || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [viewing, refresh]);

  const addTodoForPartner = useCallback(
    async (title: string, date: string) => {
      if (!partnerId) return;
      const now = Date.now();
      try {
        await insertTodoFor(partnerId, {
          id: createId(),
          title,
          date,
          done: false,
          order: now,
          createdAt: now,
          updatedAt: now,
        });
      } catch (e) {
        // Surface it in the viewing banner as well as to the caller.
        setError(e instanceof Error ? e.message : 'El pendiente no se creó');
        throw e;
      }
      await refresh();
    },
    [partnerId, refresh],
  );

  const value = useMemo<PartnerValue>(
    () => ({
      partner,
      viewing: partner ? viewing : 'me',
      setViewing,
      snapshot,
      loading,
      error,
      refresh,
      addTodoForPartner,
    }),
    [partner, viewing, setViewing, snapshot, loading, error, refresh, addTodoForPartner],
  );

  return <PartnerContext.Provider value={value}>{children}</PartnerContext.Provider>;
}

export function usePartner(): PartnerValue {
  const ctx = useContext(PartnerContext);
  if (!ctx) throw new Error('usePartner must be used inside PartnerProvider');
  return ctx;
}
