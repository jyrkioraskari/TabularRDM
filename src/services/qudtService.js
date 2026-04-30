/**
 * QUDT vocabulary service for QuantityKindNode and UnitNode. It fetches Turtle
 * vocabularies, parses them into N3 stores, caches the stores, and returns
 * normalized rows for UI filtering and drag-and-drop unit assignment.
 */
import { DataFactory, Parser, Store } from 'n3';

export const QUDT_QUANTITY_KIND_URL = 'http://qudt.org/3.2.1/vocab/quantitykind';
export const QUDT_UNIT_URL = 'https://qudt.org/vocab/unit/';

export const DEFAULT_QUANTITY_KIND_QUERY = `PREFIX qudt: <http://qudt.org/schema/qudt/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?qk ?label (GROUP_CONCAT(DISTINCT ?unit; separator=", ") AS ?units)
WHERE {
  ?qk a qudt:QuantityKind .
  OPTIONAL { ?qk rdfs:label ?label . }
  OPTIONAL { ?qk qudt:applicableUnit ?unit . }
}
GROUP BY ?qk ?label
ORDER BY ?label
LIMIT 100
OFFSET 0`;

export const DEFAULT_QUANTITY_QUERY = `PREFIX qudt: <http://qudt.org/schema/qudt/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT ?quantity ?label
WHERE {
  ?unit a qudt:Unit ;
        qudt:hasQuantityKind ?quantity .
  OPTIONAL { ?quantity rdfs:label ?label . }
}
ORDER BY ?label`;

export const DEFAULT_APPLICABLE_UNITS_QUERY = `PREFIX qudt: <http://qudt.org/schema/qudt/>
PREFIX rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

SELECT DISTINCT ?unit ?unitLabel
WHERE {
  ?qk rdf:type qudt:QuantityKind ;
      rdfs:label "Acceleration"@en ;
      qudt:applicableUnit ?unit .
  OPTIONAL { ?unit rdfs:label ?unitLabel . }
}
ORDER BY ?unitLabel`;

const { namedNode } = DataFactory;

const RDF_TYPE = namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const RDFS_LABEL = namedNode('http://www.w3.org/2000/01/rdf-schema#label');
const QUDT_QUANTITY_KIND = namedNode('http://qudt.org/schema/qudt/QuantityKind');
const QUDT_APPLICABLE_UNIT = namedNode('http://qudt.org/schema/qudt/applicableUnit');
const QUDT_HAS_QUANTITY_KIND = namedNode('http://qudt.org/schema/qudt/hasQuantityKind');
const QUDT_UNIT = namedNode('http://qudt.org/schema/qudt/Unit');

let quantityKindStoreRequest;
let unitStoreRequest;

/**
 * Browser builds use the local /qudt proxy from server.js to avoid CORS issues.
 * Server-side callers can still fetch the original QUDT URL directly.
 */
function getQudtFetchUrl(url) {
  if (typeof window === 'undefined') {
    return url;
  }

  const parsedUrl = new URL(url);

  return `/qudt${parsedUrl.pathname}${parsedUrl.search}`;
}

function compareLabels(left, right) {
  return left.label.localeCompare(right.label, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function parseTurtle(turtle, baseIRI) {
  const parser = new Parser({ baseIRI });
  const store = new Store();

  store.addQuads(parser.parse(turtle));

  return store;
}

function createAbortError() {
  if (typeof DOMException === 'function') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }

  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

function withAbort(promise, signal) {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

async function fetchTurtleStore(url) {
  const response = await fetch(getQudtFetchUrl(url), {
    headers: {
      Accept: 'text/turtle, application/n-triples;q=0.9, */*;q=0.1',
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to load QUDT vocabulary (${response.status}).`);
  }

  return parseTurtle(await response.text(), url);
}

/**
 * Quantity-kind and unit vocabularies are large and reused across searches, so
 * each vocabulary is fetched once and cached as an in-flight/completed promise.
 */
async function fetchQuantityKindStore({ signal } = {}) {
  if (!quantityKindStoreRequest) {
    quantityKindStoreRequest = fetchTurtleStore(QUDT_QUANTITY_KIND_URL).catch((error) => {
      quantityKindStoreRequest = undefined;
      throw error;
    });
  }

  return withAbort(quantityKindStoreRequest, signal);
}

async function fetchUnitStore({ signal } = {}) {
  if (!unitStoreRequest) {
    unitStoreRequest = fetchTurtleStore(QUDT_UNIT_URL).catch((error) => {
      unitStoreRequest = undefined;
      throw error;
    });
  }

  return withAbort(unitStoreRequest, signal);
}

async function fetchQudtStores({ signal } = {}) {
  const [quantityKindStore, unitStore] = await Promise.all([
    fetchQuantityKindStore({ signal }),
    fetchUnitStore({ signal }),
  ]);
  const store = new Store();

  store.addQuads(quantityKindStore.getQuads(null, null, null, null));
  store.addQuads(unitStore.getQuads(null, null, null, null));

  return store;
}

function buildQuantityKindRows(store) {
  return store.getSubjects(RDF_TYPE, QUDT_QUANTITY_KIND, null).flatMap((subject) => {
    const labels = store.getObjects(subject, RDFS_LABEL, null);
    const labelValues = labels.length > 0 ? labels : [undefined];
    const units = [
      ...new Set(
        store
          .getObjects(subject, QUDT_APPLICABLE_UNIT, null)
          .map((unit) => unit.value),
      ),
    ].join(', ');

    return labelValues.map((label) => ({
      qk: subject.value,
      label: label?.value ?? '',
      labelLanguage: label?.language || '',
      units,
    }));
  });
}

function buildApplicableUnitRows(store, quantityKindLabel, quantityKindLanguage) {
  const rowsByKey = new Map();
  const requestedLabel = quantityKindLabel.toLocaleLowerCase();

  for (const quantityKind of store.getSubjects(RDF_TYPE, QUDT_QUANTITY_KIND, null)) {
    const hasMatchingLabel = store
      .getObjects(quantityKind, RDFS_LABEL, null)
      .some(
        (label) =>
          label.value.toLocaleLowerCase() === requestedLabel &&
          (!quantityKindLanguage || label.language === quantityKindLanguage),
      );

    if (!hasMatchingLabel) {
      continue;
    }

    for (const unit of store.getObjects(quantityKind, QUDT_APPLICABLE_UNIT, null)) {
      const labels = store.getObjects(unit, RDFS_LABEL, null);
      const labelValues = labels.length > 0 ? labels : [undefined];

      for (const unitLabel of labelValues) {
        const row = {
          unit: unit.value,
          unitLabel: unitLabel?.value ?? '',
          unitLabelLanguage: unitLabel?.language || '',
        };

        rowsByKey.set(`${row.unit}\n${row.unitLabel}\n${row.unitLabelLanguage}`, row);
      }
    }
  }

  return [...rowsByKey.values()].sort((left, right) =>
    left.unitLabel.localeCompare(right.unitLabel, undefined, {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

function buildQuantityRows(store) {
  const rowsByKey = new Map();

  for (const unit of store.getSubjects(RDF_TYPE, QUDT_UNIT, null)) {
    const labels = store.getObjects(unit, RDFS_LABEL, null);
    const labelValues = labels.length > 0 ? labels : [undefined];
    const quantityKinds = store
      .getObjects(unit, QUDT_HAS_QUANTITY_KIND, null)
      .map((quantityKind) => quantityKind.value);

    for (const label of labelValues) {
      const row = {
        unit: unit.value,
        label: label?.value ?? '',
        labelLanguage: label?.language || '',
        quantityKinds,
      };

      rowsByKey.set(`${row.unit}\n${row.label}\n${row.labelLanguage}`, row);
    }
  }

  return [...rowsByKey.values()].sort(compareLabels);
}

/**
 * Returns QUDT quantity kinds for the Quantity Kinds node.
 */
export async function queryQuantityKinds({ limit, offset = 0, signal } = {}) {
  const store = await fetchQuantityKindStore({ signal });
  const rows = buildQuantityKindRows(store).sort(compareLabels);

  return typeof limit === 'number' ? rows.slice(offset, offset + limit) : rows.slice(offset);
}

/**
 * Returns QUDT units for the Units node.
 */
export async function queryUnits({ limit, offset = 0, signal } = {}) {
  const store = await fetchUnitStore({ signal });
  const rows = buildQuantityRows(store);

  return typeof limit === 'number' ? rows.slice(offset, offset + limit) : rows.slice(offset);
}

/**
 * Returns units applicable to a selected quantity kind label and language.
 */
export async function queryApplicableUnitsForQuantityKind({
  label = 'Acceleration',
  language = 'en',
  signal,
} = {}) {
  const store = await fetchQudtStores({ signal });

  return buildApplicableUnitRows(store, label, language);
}
