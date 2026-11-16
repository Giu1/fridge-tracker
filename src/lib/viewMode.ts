/** How the home list is shown (grid, list or compact). Remembered on this device only. */
import { useEffect, useState } from 'react';
import { kvGet, kvSet } from './localdb';

export type ViewMode = 'grid' | 'list' | 'compact';
export const VIEW_MODES: ViewMode[] = ['grid', 'list', 'compact'];
const KEY = 'home.view';

let current: ViewMode | null = null;
const loaded = kvGet(KEY)
  .then((v) => {
    if (!current && v && (VIEW_MODES as string[]).includes(v)) current = v as ViewMode;
  })
  .catch(() => {});

export function useViewMode() {
  const [mode, setMode] = useState<ViewMode>(current ?? 'grid');
  useEffect(() => {
    let alive = true;
    loaded.then(() => alive && current && setMode(current));
    return () => {
      alive = false;
    };
  }, []);
  const change = (m: ViewMode) => {
    current = m;
    setMode(m);
    kvSet(KEY, m).catch(() => {});
  };
  return [mode, change] as const;
}
