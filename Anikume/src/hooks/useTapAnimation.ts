import { useState, useRef, useEffect, useCallback } from "react";

export function useTapAnimation(scaleClass = "scale-95") {
  const [isPressed, setIsPressed] = useState(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      startPos.current = { x: touch.clientX, y: touch.clientY };
      setIsPressed(true);
    }
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startPos.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - startPos.current.x);
    const dy = Math.abs(touch.clientY - startPos.current.y);
    // If movement exceeds 5px in any direction, the user is scrolling: cancel tap animation
    if (dx > 5 || dy > 5) {
      setIsPressed(false);
      startPos.current = null;
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    setIsPressed(false);
    startPos.current = null;
  }, []);

  const onTouchCancel = useCallback(() => {
    setIsPressed(false);
    startPos.current = null;
  }, []);

  const onMouseDown = useCallback(() => {
    setIsPressed(true);
  }, []);

  const onMouseUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  const onMouseLeave = useCallback(() => {
    setIsPressed(false);
  }, []);

  // When pressed, cancel immediately if any scroll event fires anywhere on the page
  useEffect(() => {
    if (!isPressed) return;
    const onScroll = () => {
      setIsPressed(false);
      startPos.current = null;
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [isPressed]);

  return {
    isPressed,
    scaleClass: isPressed ? scaleClass : "scale-100",
    bind: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel,
      onMouseDown,
      onMouseUp,
      onMouseLeave,
    },
  };
}
