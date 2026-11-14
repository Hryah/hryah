/** Resolve relative to the deployed viewer, including a nested /experimental/ path. */
export function workshopPackUrl(baseUri: string): URL {
  return new URL('./assets/workshop/hryah-workshop-pack.zip', baseUri);
}

export function previewShareUrl(baseUri: string): string {
  return new URL('./', baseUri).href;
}

export async function copyPreviewLink(
  url: string,
  writeText: (value: string) => Promise<void>,
  update: (status: string, label: string) => void,
): Promise<void> {
  // Clipboard permission/focus can remain pending. Always offer the usable URL immediately.
  update(url, 'Select link below');
  try {
    await writeText(url);
    update('Link copied', 'Copied');
  } catch {
    // The URL remains selectable on HTTP and browsers without Clipboard API permission.
  }
}

export function initPublicPreview(): void {
  const button = document.querySelector<HTMLButtonElement>('#copy-preview-link');
  const status = document.querySelector<HTMLElement>('#share-status');
  if (!button || !status) return;
  button.addEventListener('click', () => {
    const url = previewShareUrl(document.baseURI);
    void copyPreviewLink(url, (value) => navigator.clipboard.writeText(value), (message, label) => {
      status.textContent = message;
      button.textContent = label;
    });
  });
}
