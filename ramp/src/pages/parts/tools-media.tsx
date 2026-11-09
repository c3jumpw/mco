import { useEffect, useState } from 'react';

/**
 * True at the lg breakpoint (1024px) and up. Two-pane layouts (notebook, chat) need this much room
 * once the 256px sidebar is showing; below it they use the phone flow (list, then detail).
 */
export function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
