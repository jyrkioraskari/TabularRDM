const TABULAR_PREFIX = 'https://nfdi4ing.de/tabular/';
const QUDT_UNIT_PREFIX = 'http://qudt.org/vocab/unit/';

function escapeTurtleString(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');
}

function toColumnDescriptionId(header, index) {
  const normalizedHeader = String(header || `column-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedHeader || `column-${index + 1}`;
}

function isAbsoluteIri(value) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function toUnitIri(field) {
  const candidate = String(field.unitUri || field.unit || '').trim();

  if (!candidate) {
    return '';
  }

  if (isAbsoluteIri(candidate)) {
    return candidate;
  }

  const compactQudtUnit = candidate.match(/^qudtunit:([A-Za-z][A-Za-z0-9_-]*)$/);

  if (compactQudtUnit) {
    return `${QUDT_UNIT_PREFIX}${compactQudtUnit[1]}`;
  }

  return '';
}

export function serializeColumnDescriptionsToTurtle(fields) {
  const rows = Array.isArray(fields) ? fields : [];
  const triples = rows
    .map((field, index) => {
      const header = String(field.header || `Column ${index + 1}`).trim();
      const description = String(field.description || '').trim();
      const unitIri = toUnitIri(field);
      const predicates = [
        '  a tab:ColumnDataDescription',
        `  tab:column_name "${escapeTurtleString(header)}"^^xsd:string`,
      ];

      if (description) {
        predicates.push(
          `  tab:column_description "${escapeTurtleString(description)}"^^xsd:string`,
        );
      }

      if (unitIri) {
        predicates.push(`  tab:unit <${unitIri}>`);
      }

      return `<${TABULAR_PREFIX}column-description/${toColumnDescriptionId(header, index)}-${index + 1}>\n${predicates.join(' ;\n')} .`;
    });

  return `@prefix tab: <https://nfdi4ing.de/tabular/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix qudtunit: <http://qudt.org/vocab/unit/> .

${triples.join('\n\n')}
`;
}
