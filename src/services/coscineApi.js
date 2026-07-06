import { DataFactory, Parser, Writer } from 'n3';

const COSCINE_API_BASE = '/coscine-api';
const DCTERMS_CONFORMS_TO = 'http://purl.org/dc/terms/conformsTo';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SH_TARGET_CLASS = 'http://www.w3.org/ns/shacl#targetClass';

const { namedNode, quad } = DataFactory;

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
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      encodeURIComponent(segment).replace(/[!'()*]/g, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
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

async function fetchCoscineRaw(path, apiToken, options = {}) {
  return fetch(`${COSCINE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: buildAuthorizationHeader(apiToken),
      ...options.headers,
    },
  });
}

function parseTurtle(content) {
  const parser = new Parser({ format: 'text/turtle' });
  return parser.parse(content);
}

async function serializeTurtle(quads) {
  return new Promise((resolve, reject) => {
    const writer = new Writer({ format: 'text/turtle' });
    writer.addQuads(quads);
    writer.end((error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function findRootSubject(quads) {
  const conformsToSubject = quads.find((item) => item.predicate.value === DCTERMS_CONFORMS_TO)?.subject;

  if (conformsToSubject) {
    return conformsToSubject;
  }

  const subjects = new Map();
  const objectBlankNodes = new Set();

  for (const item of quads) {
    subjects.set(item.subject.id, item.subject);

    if (item.object.termType === 'BlankNode') {
      objectBlankNodes.add(item.object.id);
    }
  }

  const candidates = Array.from(subjects.values()).filter((subject) => !objectBlankNodes.has(subject.id));

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (subjects.size === 1) {
    return Array.from(subjects.values())[0];
  }

  return null;
}

function getApplicationProfileTargetClass(profile) {
  const quads = parseTurtle(profile.shapes);
  const targetClasses = quads
    .filter((item) => item.predicate.value === SH_TARGET_CLASS && item.object.termType === 'NamedNode')
    .map((item) => item.object.value);
  const uniqueTargetClasses = Array.from(new Set(targetClasses));

  return uniqueTargetClasses.length === 1 ? uniqueTargetClasses[0] : profile.baseUri;
}

async function normalizeMetadataLikeSdk(metadataContent, profile) {
  if (!profile?.shapes) {
    throw new Error('Load the Coscine metadata form before uploading.');
  }

  const targetClass = getApplicationProfileTargetClass(profile);
  const quads = parseTurtle(metadataContent);
  const rootSubject = findRootSubject(quads);

  if (!rootSubject) {
    throw new Error('Could not identify the root metadata subject in the serialized form data.');
  }

  const normalizedQuads = quads.filter(
    (item) => !(item.subject.equals(rootSubject) && item.predicate.value === DCTERMS_CONFORMS_TO),
  );

  const hasTargetClassType = normalizedQuads.some(
    (item) =>
      item.subject.equals(rootSubject) &&
      item.predicate.value === RDF_TYPE &&
      item.object.termType === 'NamedNode' &&
      item.object.value === targetClass,
  );

  if (!hasTargetClassType) {
    normalizedQuads.unshift(quad(rootSubject, namedNode(RDF_TYPE), namedNode(targetClass)));
  }

  return serializeTurtle(normalizedQuads);
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
  profile,
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
  const graphMetadataPath = `/projects/${encodedProjectId}/resources/${encodedResourceId}/graphs/${encodedPath}/metadata/content`;
  const graphMetadataVersionsPath = `/projects/${encodedProjectId}/resources/${encodedResourceId}/graphs/${encodedPath}/metadata/versions`;
  const storagePath = `/projects/${encodedProjectId}/resources/${encodedResourceId}/storage/${encodedPath}/content`;
  const normalizedMetadataContent = await normalizeMetadataLikeSdk(metadataContent, profile);

  await fetchCoscine(graphMetadataPath, apiToken, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
    },
    body: normalizedMetadataContent,
  });

  const formData = new FormData();
  formData.append('file', crateBlob, fileName);

  const createStorageResponse = await fetchCoscineRaw(storagePath, apiToken, {
    method: 'POST',
    body: formData,
  });

  if (!createStorageResponse.ok) {
    if (createStorageResponse.status !== 409) {
      throw new Error(await parseErrorResponse(createStorageResponse));
    }

    const updateFormData = new FormData();
    updateFormData.append('file', crateBlob, fileName);

    await fetchCoscine(storagePath, apiToken, {
      method: 'PUT',
      body: updateFormData,
    });
  }

  const graphMetadataVersions = await fetchCoscineJson(graphMetadataVersionsPath, apiToken);

  if (!Array.isArray(graphMetadataVersions?.data) || graphMetadataVersions.data.length === 0) {
    throw new Error('Coscine accepted the upload, but no graph metadata version is listed for the file.');
  }
}
