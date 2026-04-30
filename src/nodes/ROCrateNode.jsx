import { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import * as XLSX from 'xlsx';
import { ROCrate } from 'ro-crate';
import JSZip from 'jszip';
import roCrateLogo from '../assets/RO-Crate.png';

function normalize(value) {
  return String(value ?? '').trim().toLocaleLowerCase();
}

function slugify(value) {
  const slug = String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'dataset';
}

function parseConfig(rows = []) {
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

async function createROCrateZip(options = {}) {
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

  return zip.generateAsync({ type: 'blob' });
}

export default function ROCrateNode({ data, selected }) {
  const handleCrateDownload = useCallback(async () => {
    if (!data.jsonLdContent?.jsonLd) {
      return;
    }

    const sheets = Array.isArray(data.sheets) ? data.sheets : [];
    const sheetMap = new Map();
    for (const sheet of sheets) sheetMap.set(normalize(sheet.name), sheet);
    const configRows = sheetMap.get('export_config')?.rows ?? [];

    const config = parseConfig(configRows);

    const datasetId = slugify(config.dataset_id || config.dataset_name || 'dataset');
    const datasetTitle =
      config.dataset_title || config.dataset_label || config.title || datasetId;
    const datasetDescription = config.dataset_description || config.description || '';
    const datasetLicense = config.license || '';
    const sheetCsvFiles = sheets.map((sheet, index) => {
      const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
      const csvContent = XLSX.utils.sheet_to_csv(worksheet);
      return {
        fileName: `original_data/${slugify(sheet.name || `sheet_${index + 1}`)}.csv`,
        content: csvContent,
        mimeType: 'text/csv',
      };
    });

    const crateBlob = await createROCrateZip({
      files: [
        {
          fileName: 'data.json',
          content: data.jsonLdContent.jsonLd,
          mimeType: 'application/ld+json',
        },
        ...sheetCsvFiles,
      ],
      crateName: datasetTitle,
      description: datasetDescription,
      datasetLicense,
    });
    const url = URL.createObjectURL(crateBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${datasetId}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [data.jsonLdContent, data.sheets]);

  const canDownload = Boolean(data.jsonLdContent?.jsonLd);

  return (
    <div className={`ro-crate-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="ro-crate-node__header">
        <img src={roCrateLogo} alt="" className="ro-crate-node__icon" />
        <p className="ro-crate-node__title">{data.label}</p>
      </div>
      <p className="ro-crate-node__status">
        {canDownload ? 'Ready to build an RO-Crate.' : 'Connect RDF content to build an RO-Crate.'}
      </p>
      <button
        type="button"
        className="ro-crate-node__button nodrag"
        disabled={!canDownload}
        onClick={handleCrateDownload}
      >
        Download
      </button>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
