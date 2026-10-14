import React, { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

export const CustomCursor: React.FC = () => {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isDesktop = window.innerWidth >= 1024;
    const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return isDesktop && hasFinePointer && !prefersReducedMotion;
  });
  const [cursorText, setCursorText] = useState<string | null>(null);
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const rawMouseX = useMotionValue(-100);
  const rawMouseY = useMotionValue(-100);

  // Smooth spring physics for organic cursor movement
  const springConfig = { damping: 28, stiffness: 350, mass: 0.5 };
  const cursorX = useSpring(rawMouseX, springConfig);
  const cursorY = useSpring(rawMouseY, springConfig);

  useEffect(() => {
    if (!enabled) return;

    const handleResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      const hasFinePointer = window.matchMedia('(pointer: fine)').matches;
      if (!isDesktop || !hasFinePointer) {
        setEnabled(false);
      }
    };
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      rawMouseX.set(e.clientX);
      rawMouseY.set(e.clientY);
      if (!isVisible) setIsVisible(true);

      // Check target hierarchy for custom cursor directives
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const cursorTarget = target.closest('[data-cursor]') as HTMLElement | null;
      if (cursorTarget) {
        setCursorText(cursorTarget.getAttribute('data-cursor'));
        setIsHoveringInteractive(true);
      } else {
        setCursorText(null);
        const isInteractive = Boolean(
          target.closest('button, a, input, textarea, select, [role="button"]')
        );
        setIsHoveringInteractive(isInteractive);
      }
    };

    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseEnter = () => setIsVisible(true);

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseenter', handleMouseEnter);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseenter', handleMouseEnter);
    };
  }, [enabled, isVisible, rawMouseX, rawMouseY]);

  if (!enabled || !isVisible) return null;

  return (
    <motion.div
      style={{
        position: 'fixed',
        left: cursorX,
        top: cursorY,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {cursorText ? (
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          style={{
            backgroundColor: '#121316',
            color: '#FFFFFF',
            padding: '5px 12px',
            borderRadius: '999px',
            fontSize: '0.68rem',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.2)'
          }}
        >
          {cursorText}
        </motion.div>
      ) : (
        <motion.div
          animate={{
            scale: isHoveringInteractive ? 1.8 : 1,
            backgroundColor: isHoveringInteractive ? 'rgba(21, 69, 168, 0.18)' : 'rgba(18, 19, 22, 0.4)',
            borderColor: isHoveringInteractive ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)'
          }}
          transition={{ duration: 0.15 }}
          style={{
            width: isHoveringInteractive ? '28px' : '10px',
            height: isHoveringInteractive ? '28px' : '10px',
            borderRadius: '50%',
            border: '1px solid rgba(255, 255, 255, 0.8)',
            backdropFilter: isHoveringInteractive ? 'blur(4px)' : 'none'
          }}
        />
      )}
    </motion.div>
  );
};
