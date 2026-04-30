/**
 * AIMS API client used by metadata profile search and metadata form setup.
 * It discovers the current application-profile endpoint from Swagger, searches
 * profiles, and returns SHACL/Turtle definitions for selected profiles.
 */
const AIMS_SWAGGER_URL = 'https://pg4aims.ulb.tu-darmstadt.de/swagger/v1/swagger.json';
const APPLICATION_PROFILES_PATH = '/AIMS/application-profiles';
export const DEFAULT_PROFILE_QUERY = 'RO-kit';

function getSwaggerOperation(specification) {
  return specification?.paths?.[APPLICATION_PROFILES_PATH]?.get;
}

function getOperationParameter(operation, parameterName) {
  return operation?.parameters?.find(
    (parameter) => parameter.in === 'query' && parameter.name === parameterName,
  );
}

function getApplicationProfilesUrl(specification) {
  const swaggerUrl = new URL(AIMS_SWAGGER_URL);
  const operation = getSwaggerOperation(specification);

  if (!operation || !getOperationParameter(operation, 'query')) {
    throw new Error('AIMS Swagger does not define the expected application-profiles query endpoint.');
  }

  const serverUrl = specification?.servers?.[0]?.url;
  const baseUrl = serverUrl ? new URL(serverUrl, swaggerUrl) : swaggerUrl;

  return new URL(APPLICATION_PROFILES_PATH, baseUrl.origin);
}

function normalizeProfiles(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.value)) {
    return payload.value;
  }

  return [];
}

export function getProfileBaseUri(profile) {
  return profile?.base_url ?? profile?.baseUri ?? profile?.['base-uri'] ?? '';
}

function getProfileDefinition(profile) {
  return typeof profile?.definition === 'string' ? profile.definition.trim() : '';
}

function buildSingleProfileDefinition(profile) {
  const definition = getProfileDefinition(profile);

  if (!definition) {
    return '';
  }

  const name = profile.name ?? 'Unnamed application profile';
  const baseUri = getProfileBaseUri(profile);

  return [
    `# ${name}`,
    baseUri ? `# base-uri: ${baseUri}` : '',
    definition,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Discovers the current AIMS application-profile endpoint from Swagger before
 * querying it. This avoids hard-coding a deployment host beyond the Swagger URL.
 */
export async function fetchAimsApplicationProfiles({
  query,
  includeDefinition = false,
  signal,
}) {
  const swaggerResponse = await fetch(AIMS_SWAGGER_URL, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!swaggerResponse.ok) {
    throw new Error(`Unable to load AIMS Swagger specification (${swaggerResponse.status}).`);
  }

  const specification = await swaggerResponse.json();
  const operation = getSwaggerOperation(specification);
  const profilesUrl = getApplicationProfilesUrl(specification);

  profilesUrl.searchParams.set('query', query);

  if (includeDefinition && getOperationParameter(operation, 'includeDefinition')) {
    profilesUrl.searchParams.set('includeDefinition', 'true');
  }

  const profilesResponse = await fetch(profilesUrl, {
    headers: {
      Accept: 'application/json',
    },
    signal,
  });

  if (!profilesResponse.ok) {
    throw new Error(`Unable to load AIMS application profiles (${profilesResponse.status}).`);
  }

  return normalizeProfiles(await profilesResponse.json());
}

export function buildProfileSummary(profiles) {
  return profiles.map((profile) => ({
    name: profile.name ?? '',
    baseUri: getProfileBaseUri(profile),
  }));
}

export function buildCombinedProfileDefinitions(profiles) {
  return profiles
    .filter((profile) => getProfileDefinition(profile))
    .map((profile) => {
      return buildSingleProfileDefinition(profile);
    })
    .join('\n\n');
}

/**
 * Returns SHACL/Turtle shapes for one selected profile. If the search result
 * already contains a definition it is reused; otherwise the profile is fetched
 * again by base URI with includeDefinition enabled.
 */
export async function fetchAimsApplicationProfileDefinition({ profile, signal }) {
  const baseUri = getProfileBaseUri(profile).trim();

  if (!baseUri) {
    throw new Error('Selected metadata profile has no base URI.');
  }

  const existingDefinition = buildSingleProfileDefinition(profile);

  if (existingDefinition) {
    return {
      name: profile.name ?? 'Unnamed application profile',
      baseUri,
      shapes: existingDefinition,
    };
  }

  const profiles = await fetchAimsApplicationProfiles({
    query: baseUri,
    includeDefinition: true,
    signal,
  });
  const matchedProfileWithDefinition = profiles.find(
    (candidateProfile) =>
      getProfileBaseUri(candidateProfile).trim() === baseUri &&
      getProfileDefinition(candidateProfile),
  );
  const profileWithDefinition =
    matchedProfileWithDefinition ?? profiles.find(getProfileDefinition);
  const shapes = profileWithDefinition
    ? buildSingleProfileDefinition(profileWithDefinition)
    : '';

  if (!shapes) {
    throw new Error(`AIMS returned no Turtle definition for ${baseUri}.`);
  }

  return {
    name: profileWithDefinition.name ?? profile.name ?? 'Unnamed application profile',
    baseUri,
    shapes,
  };
}
