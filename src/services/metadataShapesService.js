/**
 * Main-thread facade for the metadata shapes worker. It manages worker startup,
 * request IDs, pending promises, and a shared cached default-shapes request.
 */
let worker;
let nextRequestId = 0;
let defaultMetadataShapesRequest;
const pendingRequests = new Map();

/**
 * Lazily starts the metadata-shapes worker and resolves pending request
 * promises when the worker posts responses back.
 */
function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./metadataShapes.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.addEventListener('message', (event) => {
      const { id, ok, shapes, error } = event.data ?? {};
      const pending = pendingRequests.get(id);

      if (!pending) {
        return;
      }

      pendingRequests.delete(id);

      if (ok) {
        pending.resolve(shapes);
      } else {
        pending.reject(new Error(error || 'Unable to load metadata shapes.'));
      }
    });

    worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'Metadata shapes worker failed.');

      for (const pending of pendingRequests.values()) {
        pending.reject(error);
      }

      pendingRequests.clear();
      worker?.terminate();
      worker = undefined;
    });
  }

  return worker;
}

function requestDefaultMetadataShapes() {
  const id = `metadata-shapes-${nextRequestId}`;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    getWorker().postMessage({ id, type: 'metadata-shapes:get-default' });
  });
}

/**
 * Loads the default metadata shapes once and shares the in-flight promise across
 * Metadata Form nodes.
 */
export function fetchDefaultMetadataShapes() {
  if (!defaultMetadataShapesRequest) {
    defaultMetadataShapesRequest = requestDefaultMetadataShapes().catch((error) => {
      defaultMetadataShapesRequest = undefined;
      throw error;
    });
  }

  return defaultMetadataShapesRequest;
}
