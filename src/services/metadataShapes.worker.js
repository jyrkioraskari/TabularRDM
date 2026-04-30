/**
 * Web worker for loading default metadata shapes without blocking the React UI.
 * It fetches RO-kit AIMS profiles, combines their definitions, caches the
 * in-flight request, and responds to metadataShapesService messages.
 */
import {
  buildCombinedProfileDefinitions,
  buildProfileSummary,
  DEFAULT_PROFILE_QUERY,
  fetchAimsApplicationProfiles,
} from './aimsApi';

let defaultMetadataShapesRequest;

async function fetchDefaultMetadataShapes() {
  const profiles = await fetchAimsApplicationProfiles({
    query: DEFAULT_PROFILE_QUERY,
    includeDefinition: true,
  });
  const shapes = buildCombinedProfileDefinitions(profiles);

  if (!shapes) {
    throw new Error('AIMS returned no application profile definitions for RO-kit.');
  }

  return {
    shapes,
    profiles: buildProfileSummary(profiles),
  };
}

self.addEventListener('message', async (event) => {
  const { id, type } = event.data ?? {};

  if (!id || type !== 'metadata-shapes:get-default') {
    return;
  }

  try {
    if (!defaultMetadataShapesRequest) {
      defaultMetadataShapesRequest = fetchDefaultMetadataShapes().catch((error) => {
        defaultMetadataShapesRequest = undefined;
        throw error;
      });
    }

    const { shapes, profiles } = await defaultMetadataShapesRequest;

    self.postMessage({
      id,
      ok: true,
      shapes,
      profiles,
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error?.message || 'Unable to load AIMS metadata shapes.',
    });
  }
});
