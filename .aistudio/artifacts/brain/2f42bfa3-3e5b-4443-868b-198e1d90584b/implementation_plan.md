# Hero Slider Animation, Indicator, and Blur Restoration Plan

Restores the Hero Slider's original animation, indicator dot expanding/contracting animation, and glass backdrop blur effects.

## Root Cause Analysis
1. **Slide Transition Corrupted**: Artificial `blur-md` and `scale-[1.04]` / `scale-105` transitions were placed on both the outer container and individual slide items, causing heavy filter recalculations, stuttering, and blurred slide jumps instead of the original smooth cross-fade animation.
2. **Indicator Dot Animation Disabled**: The global `a, button, [role="button"]` tap-scale (`--tap-scale: 0.93`) and active transition specificity were overriding dot width animations, and missing `flex-shrink: 0` caused the dots to resist fluid width expanding/contracting when slides changed.
3. **Blur Effects Missing**: The class `gpu-glass-blur` was used in `HeroSlider.tsx` for the capsule bar and info buttons without being defined in CSS, resulting in complete disappearance of the frosted glass blur effects.

## Implemented Changes
1. **Hero Slide Transitions (`/Anikume/src/components/HeroSlider.tsx`)**:
   - Removed artificial container scaling and blur filters (`transition-[opacity,transform,filter]` and `blur-md`).
   - Restored original smooth slide cross-fade with subtle Ken Burns scale: `transition-all duration-700 ease-in-out` (`opacity-100 scale-100` when active, `opacity-0 scale-105` when inactive).
2. **Backdrop Blur Effects (`/Anikume/src/components/HeroSlider.tsx` & `/Anikume/src/styles.css`)**:
   - Replaced undefined `gpu-glass-blur` with Tailwind's standard `backdrop-blur-md` on mobile and desktop capsule pills (`bg-white/10 border border-white/15 backdrop-blur-md`) and details buttons (`backdrop-blur-md`).
   - Added fallback `.gpu-glass-blur` utility in `styles.css` with `-webkit-backdrop-filter` and `backdrop-filter: blur(12px)`.
3. **Indicator Dots Animation (`/Anikume/src/components/HeroSlider.tsx` & `/Anikume/src/styles.css`)**:
   - Added `shrink-0`, `type="button"`, and explicit `transition-all duration-300 ease-out cursor-pointer` on mobile (`w-6` active, `w-1.5` inactive) and desktop (`w-5` active, `w-1.5` inactive) indicator dots.
   - In `styles.css`, isolated `button.hero-indicator-dot` and `.hero-indicator-dot` from global tap scale overrides (`scale: 1 !important`, `transform: none !important`), enforcing dedicated width, background-color, and opacity transitions (`300ms cubic-bezier(0.4, 0, 0.2, 1)`).
