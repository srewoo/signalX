import type { Result } from '../shared/contracts';
import { appError, err, ok } from './result';

const MAX_TABS = 20;

/** Open each source URL in a background tab. Validates http(s) and bounds count. */
export async function openSources(urls: readonly string[]): Promise<Result<void>> {
  const safe = urls.filter((u) => /^https?:\/\//i.test(u)).slice(0, MAX_TABS);
  if (safe.length === 0) {
    return err(appError('INTERNAL', 'No valid links to open.'));
  }
  try {
    await Promise.all(safe.map((url) => chrome.tabs.create({ url, active: false })));
    return ok(undefined);
  } catch {
    return err(appError('INTERNAL', 'Could not open source tabs.'));
  }
}
