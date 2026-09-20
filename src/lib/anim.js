export const springSnappy = { type: 'spring', stiffness: 500, damping: 32 };

export const modalOverlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: 'easeOut' }
};

export const modalPanel = {
  initial: { opacity: 0, y: 20, scale: 0.965 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 14, scale: 0.965 },
  transition: { type: 'spring', stiffness: 340, damping: 28 }
};

export const panelLg = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 18, scale: 0.98 },
  transition: { type: 'spring', stiffness: 300, damping: 30 }
};

export const fadeSlideUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2, ease: 'easeOut' }
};

export const fadeSlideLeft = {
  initial: { opacity: 0, x: -26 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 26 },
  transition: { type: 'spring', stiffness: 320, damping: 30 }
};

export const stepIn = {
  initial: { opacity: 0, x: 26 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -26 },
  transition: { type: 'spring', stiffness: 300, damping: 30 }
};

export const stubTap = {
  whileHover: { scale: 1.03, y: -1 },
  whileTap: { scale: 0.96 },
  transition: springSnappy
};

export const iconBtnTap = {
  whileTap: { scale: 0.85 },
  transition: springSnappy
};