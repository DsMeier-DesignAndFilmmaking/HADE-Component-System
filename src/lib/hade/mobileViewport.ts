"use client";

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isFormControl(element: Element | null): element is FormControl {
  return element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement;
}

function restoreViewport(scrollY: number) {
  window.scrollTo(0, Math.max(0, scrollY));
}

export function resetMobileViewportAfterInput() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const scrollY = window.scrollY;
  const activeElement = document.activeElement;

  if (isFormControl(activeElement)) {
    activeElement.blur();
  }

  requestAnimationFrame(() => restoreViewport(scrollY));
  window.setTimeout(() => requestAnimationFrame(() => restoreViewport(scrollY)), 80);
  window.setTimeout(() => requestAnimationFrame(() => restoreViewport(scrollY)), 220);
}
