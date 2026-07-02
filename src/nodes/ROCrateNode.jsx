/**
 * Node that packages connected metadata and tabular sheet exports into an
 * RO-Crate ZIP. It reads optional dataset settings from an export_config sheet.
 */
import { useCallback } from 'react';
import roCrateLogo from '../assets/RO-Crate.png';
import { createROCratePackage } from '../services/roCrateExport';
import NodeHandle from './NodeHandle';
import NodeInfoButton from './NodeInfoButton';

export default function ROCrateNode({ data, selected }) {
  /**
   * Implements the RO-Crate download template:
   * data.json contains connected RDF content, workbook sheets become CSV files,
   * and export_config can override dataset metadata.
   */
  const handleCrateDownload = useCallback(async () => {
    if (!data.jsonLdContent?.jsonLd) {
      return;
    }

    const cratePackage = await createROCratePackage({
      jsonLdContent: data.jsonLdContent,
      sheets: data.sheets,
    });
    const url = URL.createObjectURL(cratePackage.blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = cratePackage.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [data.jsonLdContent, data.sheets]);

  const canDownload = Boolean(data.jsonLdContent?.jsonLd);

  return (
    <div className={`ro-crate-node${selected ? ' selected' : ''}`}>
      <NodeHandle type="target" />
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
      <NodeInfoButton nodeType="roCrate" language={data.language} />
      <NodeHandle type="source" />
    </div>
  );
}
