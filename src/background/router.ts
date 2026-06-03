import type { ProviderSettings, Request, ResponseMap, Result } from '../shared/contracts';
import { err, ok } from './result';
import { getFeed, getTrending, search } from './feeds/index';
import { readSummaryCache } from './llm/summaryCache';
import { generateComparison, generateOverview } from './llm/generate';
import { testKey } from './llm/client';
import { listModels } from './llm/models';
import { getClusterById } from './feeds/cache';
import type { StoryCluster } from '../shared/contracts';
import { getPrefs, getProvider, setPrefs, setProvider } from './storage/settings';
import {
  createFolder,
  listFolders,
  listItems,
  removeItem,
  saveItem,
} from './storage/bookmarks';
import { appendFeedback } from './storage/feedback';
import { openSources } from './tabs';
import { appError } from './result';

type Resp<K extends Request['type']> = Result<ResponseMap[K]>;

/** Resolve provider settings or a NO_KEY error for AI actions. */
async function requireProvider(): Promise<Result<ProviderSettings>> {
  const provider = await getProvider();
  if (!provider) return err(appError('NO_KEY', 'Add an API key to use AI features.'));
  return ok(provider);
}

async function handleCompare(clusterId: string): Promise<Resp<'compare/get'>> {
  const cluster = await getClusterById(clusterId);
  if (!cluster) return err(appError('INTERNAL', 'That story is no longer available. Refresh the feed.'));
  const provider = await requireProvider();
  if (!provider.ok) return err(provider.error);
  return generateComparison(cluster, provider.value);
}

async function handleOverview(
  req: Extract<Request, { type: 'search/overview' }>,
): Promise<Resp<'search/overview'>> {
  const provider = await requireProvider();
  if (!provider.ok) return err(provider.error);
  // Resolve clusterIds via the session index; silently skip ids that no longer
  // resolve (feed may have rotated). If NONE resolve, there's nothing to
  // summarize — surface INTERNAL so the panel prompts a refresh.
  const resolved = await Promise.all(req.clusterIds.map((id) => getClusterById(id)));
  const clusters = resolved.filter((c): c is StoryCluster => c !== null);
  if (clusters.length === 0) {
    return err(appError('INTERNAL', 'Those stories are no longer available. Refresh and retry.'));
  }
  return generateOverview(req.query, clusters, provider.value);
}

async function handleTestKey(req: Extract<Request, { type: 'settings/testKey' }>): Promise<Resp<'settings/testKey'>> {
  const res = await testKey(req.settings);
  if (!res.ok) return err(res.error);
  return ok(res.value);
}

/** Dispatch a validated Request to its handler. Exhaustive over Request['type']. */
export async function route(req: Request): Promise<Result<unknown>> {
  switch (req.type) {
    case 'feed/get':
      return getFeed(req.country, req.category);
    case 'feed/trending':
      return getTrending(req.country);
    case 'search/query':
      return search(req.query, req.country);
    case 'summary/get': {
      const provider = await getProvider();
      const model = provider?.model ?? '';
      const cached = model ? await readSummaryCache(req.clusterId, req.summaryType, model) : null;
      return ok(cached);
    }
    case 'compare/get':
      return handleCompare(req.clusterId);
    case 'settings/getProvider':
      return ok(await getProvider());
    case 'settings/setProvider':
      await setProvider(req.settings);
      return ok(undefined);
    case 'settings/testKey':
      return handleTestKey(req);
    case 'settings/listModels':
      return listModels(req.settings);
    case 'settings/getPrefs':
      return ok(await getPrefs());
    case 'settings/setPrefs':
      await setPrefs(req.prefs);
      return ok(undefined);
    case 'bookmarks/listFolders':
      return ok(await listFolders());
    case 'bookmarks/createFolder':
      return ok(await createFolder(req.name));
    case 'bookmarks/save':
      await saveItem(req.item);
      return ok(undefined);
    case 'bookmarks/list':
      return ok(await listItems(req.folderId));
    case 'bookmarks/remove':
      await removeItem(req.id);
      return ok(undefined);
    case 'search/overview':
      return handleOverview(req);
    case 'feedback/submit':
      await appendFeedback(req.clusterId, req.target, req.verdict, req.summaryType);
      return ok(undefined);
    case 'tabs/openSources':
      return openSources(req.urls);
    default:
      return assertNever(req);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled request: ${JSON.stringify(x)}`);
}
