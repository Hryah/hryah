import { describe, expect, it } from 'vitest';
import { copyPreviewLink, previewShareUrl, workshopPackUrl } from './public-preview';

describe('portable public viewer URLs', () => {
  it.each([
    ['https://example.org/', 'https://example.org/assets/workshop/hryah-workshop-pack.zip'],
    ['https://example.org/experimental/', 'https://example.org/experimental/assets/workshop/hryah-workshop-pack.zip'],
    ['https://example.org/experimental/index.html?test=1#model', 'https://example.org/experimental/assets/workshop/hryah-workshop-pack.zip'],
  ])('keeps the ZIP under the viewer base: %s', (base, expected) => {
    expect(workshopPackUrl(base).href).toBe(expected);
  });

  it('copies this deployment instead of a hardcoded public origin', () => {
    expect(previewShareUrl('https://example.org/experimental/index.html?test=1#model'))
      .toBe('https://example.org/experimental/');
  });

  it('offers the URL immediately even while clipboard permission stays pending', async () => {
    const updates: Array<[string, string]> = [];
    let completeCopy: () => void = () => {};
    const pending = new Promise<void>((resolve) => { completeCopy = resolve; });
    const task = copyPreviewLink('https://example.org/experimental/', () => pending,
      (status, label) => updates.push([status, label]));
    expect(updates).toEqual([['https://example.org/experimental/', 'Select link below']]);
    completeCopy();
    await task;
    expect(updates.at(-1)).toEqual(['Link copied', 'Copied']);
  });

  it('keeps the selectable URL when clipboard access rejects', async () => {
    const updates: Array<[string, string]> = [];
    await copyPreviewLink('https://example.org/', () => Promise.reject(new Error('Permission denied')),
      (status, label) => updates.push([status, label]));
    expect(updates).toEqual([['https://example.org/', 'Select link below']]);
  });
});
