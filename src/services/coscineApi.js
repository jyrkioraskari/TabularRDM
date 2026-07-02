const COSCINE_API_BASE = '/coscine-api';

function buildAuthorizationHeader(apiToken) {
  const trimmedToken = String(apiToken ?? '').trim();

  if (!trimmedToken) {
    throw new Error('Enter a Coscine API token first.');
  }

  return trimmedToken.toLocaleLowerCase().startsWith('bearer ')
    ? trimmedToken
    : `Bearer ${trimmedToken}`;
}

async function parseErrorResponse(response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return (
      payload?.title ||
      payload?.message ||
      payload?.detail ||
      `Coscine request failed with HTTP ${response.status}.`
    );
  }

  const text = await response.text().catch(() => '');
  return text || `Coscine request failed with HTTP ${response.status}.`;
}

async function fetchCoscineJson(path, apiToken, options = {}) {
  const response = await fetch(`${COSCINE_API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      Authorization: buildAuthorizationHeader(apiToken),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return response.json();
}

export async function fetchCoscineProjects(apiToken) {
  const payload = await fetchCoscineJson(
    '/projects?PageNumber=1&PageSize=50&OrderBy=name%20asc',
    apiToken,
  );

  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchCoscineResourcesForProject(apiToken, projectId) {
  const encodedProjectId = encodeURIComponent(projectId);
  const payload = await fetchCoscineJson(
    `/projects/${encodedProjectId}/resources?PageNumber=1&PageSize=50&OrderBy=name%20asc`,
    apiToken,
  );

  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function fetchCoscineResourceOptions(apiToken) {
  const projects = await fetchCoscineProjects(apiToken);
  const resourceGroups = await Promise.all(
    projects.map(async (project) => {
      const resources = await fetchCoscineResourcesForProject(apiToken, project.id);
      return resources.map((resource) => ({
        projectId: project.id,
        projectName: project.displayName || project.name || project.slug || project.id,
        resourceId: resource.id,
        resourceName: resource.displayName || resource.name || resource.id,
        resourceType: resource.type?.displayName || resource.type?.name || '',
        applicationProfileUri: resource.applicationProfile?.uri || '',
      }));
    }),
  );

  return resourceGroups.flat();
}

export async function fetchCoscineApplicationProfileDefinition(apiToken, profileUri) {
  const normalizedProfileUri = String(profileUri ?? '').trim();

  if (!normalizedProfileUri) {
    throw new Error('Selected Coscine resource has no application profile URI.');
  }

  const encodedProfileUri = encodeURIComponent(normalizedProfileUri);
  const response = await fetch(
    `${COSCINE_API_BASE}/application-profiles/profiles/${encodedProfileUri}/raw`,
    {
      headers: {
        Accept: 'text/turtle',
        Authorization: buildAuthorizationHeader(apiToken),
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const shapes = await response.text();

  if (!shapes.trim()) {
    throw new Error(`Coscine returned an empty profile definition for ${profileUri}.`);
  }

  return {
    baseUri: normalizedProfileUri,
    name: normalizedProfileUri,
    shapes,
  };
}

export async function uploadROCrateToCoscine({
  apiToken,
  projectId,
  resourceId,
  crateBlob,
  fileName,
}) {
  if (!projectId || !resourceId) {
    throw new Error('Select a Coscine resource first.');
  }

  if (!crateBlob) {
    throw new Error('Build an RO-Crate before uploading.');
  }

  const encodedProjectId = encodeURIComponent(projectId);
  const encodedResourceId = encodeURIComponent(resourceId);
  const encodedPath = encodeURIComponent(fileName);
  const response = await fetch(
    `${COSCINE_API_BASE}/projects/${encodedProjectId}/resources/${encodedResourceId}/storage/${encodedPath}/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: buildAuthorizationHeader(apiToken),
        'Content-Type': crateBlob.type || 'application/zip',
      },
      body: crateBlob,
    },
  );

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }
}
