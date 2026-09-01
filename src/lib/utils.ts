import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getLogoUrl(_url?: string) {
  return "/CanindeChords.png";
}

/**
 * La app corriendo como PWA instalada (o "añadida a inicio" en iOS). Ahí la
 * ventana emergente de Google no puede devolverle el resultado a quien la abrió,
 * así que el acceso tiene que ir por redirección.
 */
export function isStandalonePWA() {
  if (typeof window === 'undefined') return false;
  const standaloneDisplay = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return standaloneDisplay || iosStandalone;
}
