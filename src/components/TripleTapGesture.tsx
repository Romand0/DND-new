import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import hookedCombatStore from '@/data/hookedCombatStore';

export default function TripleTapGesture() {
  const navigate = useNavigate();

  const handleTripleTap = useCallback(() => {
    const hooked = hookedCombatStore.get();
    if (hooked) {
      navigate(`/combat/${hooked.id}`, { replace: false });
    }
  }, [navigate]);

  useEffect(() => {
    let timestamps: number[] = [];

    const onPointerUp = (e: PointerEvent) => {
      // 仅屏幕上半部分
      if (e.clientY > window.innerHeight * 0.5) {
        timestamps = [];
        return;
      }

      const now = Date.now();
      timestamps.push(now);
      if (timestamps.length > 3) timestamps = timestamps.slice(-3);

      if (timestamps.length === 3) {
        const span = timestamps[2] - timestamps[0];
        if (span < 500) {
          timestamps = [];
          handleTripleTap();
        }
      }

      // 超时清空
      setTimeout(() => {
        if (timestamps.length > 0 && Date.now() - timestamps[0] > 500) {
          timestamps = [];
        }
      }, 550);
    };

    document.addEventListener('pointerup', onPointerUp, { capture: true });
    return () => {
      document.removeEventListener('pointerup', onPointerUp, { capture: true });
    };
  }, [handleTripleTap]);

  return null;
}
