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

function encodeCoscinePath(path) {
  return String(path ?? '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function fetchCoscine(path, apiToken, options = {}) {
  const response = await fetch(`${COSCINE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: buildAuthorizationHeader(apiToken),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return response;
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
  metadataContent,
}) {
  if (!projectId || !resourceId) {
    throw new Error('Select a Coscine resource first.');
  }

  if (!crateBlob) {
    throw new Error('Build an RO-Crate before uploading.');
  }

  if (!String(metadataContent ?? '').trim()) {
    throw new Error('Save Coscine metadata before uploading.');
  }

  const encodedProjectId = encodeURIComponent(projectId);
  const encodedResourceId = encodeURIComponent(resourceId);
  const encodedPath = encodeCoscinePath(fileName);
  const metadataPath = `/projects/${encodedProjectId}/resources/${encodedResourceId}/graphs/${encodedPath}/metadata/content`;
  const storagePath = `/projects/${encodedProjectId}/resources/${encodedResourceId}/storage/${encodedPath}/content`;
  const storageItemPath = `/projects/${encodedProjectId}/resources/${encodedResourceId}/storage/${encodedPath}`;

  await fetchCoscine(metadataPath, apiToken, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
    },
    body: metadataContent,
  });

  const headResponse = await fetch(`${COSCINE_API_BASE}${storageItemPath}`, {
    method: 'HEAD',
    headers: {
      Authorization: buildAuthorizationHeader(apiToken),
    },
  });

  if (!headResponse.ok && headResponse.status !== 404) {
    throw new Error(await parseErrorResponse(headResponse));
  }

  const formData = new FormData();
  formData.append(
    'file',
    crateBlob,
    fileName,
  );

  await fetchCoscine(storagePath, apiToken, {
    method: headResponse.ok ? 'PUT' : 'POST',
    body: formData,
  });
}
