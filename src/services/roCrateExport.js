import * as XLSX from 'xlsx';
import { ROCrate } from 'ro-crate';
import JSZip from 'jszip';

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

export function slugifyCrateValue(value) {
  const slug = String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'dataset';
}

/**
 * Reads an optional export_config sheet. The parser accepts common two-column
 * key/value layouts and normalizes keys to snake_case for template lookups.
 */
export function parseROCrateConfig(rows = []) {
  return rows.reduce((config, row) => {
    const entries = Object.entries(row);
    const keyEntry =
      entries.find(([key]) => normalize(key) === 'key') ??
      entries.find(([key]) => normalize(key) === 'name') ??
      entries.find(([key]) => normalize(key) === 'field') ??
      entries[0];
    const valueEntry =
      entries.find(([key]) => normalize(key) === 'value') ??
      entries.find(([key]) => normalize(key) === 'content') ??
      entries[1];
    const key = normalize(keyEntry?.[1] ?? keyEntry?.[0]).replace(/[\s-]+/g, '_');

    if (key) {
      config[key] = valueEntry?.[1] ?? '';
    }

    return config;
  }, {});
}

/**
 * Builds a browser-downloadable RO-Crate ZIP. Each payload file is added both
 * to the ZIP and to ro-crate-metadata.json as a File entity.
 */
export async function createROCrateZip(options = {}) {
  const {
    files = [],
    crateName = 'Template name for a RO-Crate ZIP (TS)',
    description = 'Template for the RO-Crate description.',
    datasetLicense = 'CC BY 4.0',
  } = options;

  const crate = new ROCrate();

  crate.rootDataset.name = crateName;
  crate.rootDataset.description = description;
  crate.rootDataset.datePublished = new Date().toISOString().split('T')[0];

  const license = {
    '@id': 'https://creativecommons.org/licenses/by/4.0/',
    '@type': 'CreativeWork',
    name: datasetLicense,
  };
  crate.addEntity(license);
  crate.rootDataset.license = { '@id': license['@id'] };

  const zip = new JSZip();
  const fileRefs = [];

  for (const f of files) {
    crate.addEntity({
      '@id': f.fileName,
      '@type': 'File',
      name: f.fileName,
      encodingFormat: f.mimeType ?? 'application/octet-stream',
    });

    fileRefs.push({ '@id': f.fileName });
    zip.file(f.fileName, f.content);
  }

  if (fileRefs.length > 0) {
    crate.rootDataset.hasPart = fileRefs;
  }

  zip.file('ro-crate-metadata.json', `${JSON.stringify(crate.toJSON(), null, 2)}\n`);

  return zip.generateAsync({ type: 'blob', mimeType: 'application/zip' });
}

export async function createROCratePackage({ jsonLdContent, sheets = [] } = {}) {
  if (!jsonLdContent?.jsonLd) {
    throw new Error('Connect RDF content to build an RO-Crate first.');
  }

  const sheetMap = new Map();
  for (const sheet of sheets) sheetMap.set(normalize(sheet.name), sheet);
  const configRows = sheetMap.get('export_config')?.rows ?? [];
  const config = parseROCrateConfig(configRows);

  const datasetId = slugifyCrateValue(
    config.dataset_id || config.dataset_name || 'dataset',
  );
  const datasetTitle =
    config.dataset_title || config.dataset_label || config.title || datasetId;
  const datasetDescription = config.dataset_description || config.description || '';
  const datasetLicense = config.license || '';
  const sheetCsvFiles = sheets.map((sheet, index) => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    return {
      fileName: `original_data/${slugifyCrateValue(sheet.name || `sheet_${index + 1}`)}.csv`,
      content: csvContent,
      mimeType: 'text/csv',
    };
  });

  const blob = await createROCrateZip({
    files: [
      {
        fileName: 'data.json',
        content: jsonLdContent.jsonLd,
        mimeType: 'application/ld+json',
      },
      ...sheetCsvFiles,
    ],
    crateName: datasetTitle,
    description: datasetDescription,
    datasetLicense,
  });

  return {
    blob,
    fileName: `${datasetId}.zip`,
  };
}
