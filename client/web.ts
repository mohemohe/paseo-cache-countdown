// This development-only browser adapter is not imported by the plugin entry.
// The structural type keeps DOM globals out of the shared tsconfig.
export function previewRoot() {
  const browser = globalThis as typeof globalThis & {
    document?: { getElementById(id: string): HTMLElement | null };
  };
  const root = browser.document?.getElementById("root");
  if (!root) throw new Error("The component preview requires a browser root element.");
  return root;
}
