/**
 * Source node for selecting a tabular file from disk. It reads the file as an
 * ArrayBuffer and passes it to App.jsx for workbook parsing and propagation.
 */
import { useCallback, useRef, useState } from 'react';
import tabularFileIcon from '../assets/tabular-file-icon.png';
import NodeHandle from './NodeHandle';

export default function TabularFileNode({ id, data, selected, onTabularLoaded }) {
  const fileInputRef = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];

      if (!file) {
        return;
      }

      setIsLoading(true);
      setError('');

      try {
        const content = await file.arrayBuffer();
        onTabularLoaded(id, file.name, content);
      } catch (readError) {
        console.error(readError);
        setError('Could not read this tabular file');
      } finally {
        setIsLoading(false);
        event.target.value = '';
      }
    },
    [id, onTabularLoaded],
  );

  return (
    <div className={`tabular-file-node${selected ? ' selected' : ''}`}>
      <NodeHandle type="target" />
      <div className="tabular-file-node__header">
        <img src={tabularFileIcon} alt="" className="tabular-file-node__icon" />
        <p className="tabular-file-node__title">{data.label}</p>
      </div>
      <button type="button" className="tabular-file-node__button" onClick={openFilePicker}>
        {isLoading ? 'Reading...' : 'Select tabular file'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xls,.xlsx,.xlsm,.xlsb,.ods,.html,.htm,text/csv,text/tab-separated-values,text/html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet"
        className="tabular-file-node__input"
        onChange={handleFileChange}
      />
      {data.fileName ? (
        <p className="tabular-file-node__meta">
          {data.fileName} ({data.rowCount} rows)
          {data.sheetName ? `, ${data.sheetName}` : ''}
        </p>
      ) : (
        <p className="tabular-file-node__meta">No tabular file loaded</p>
      )}
      {error ? <p className="tabular-file-node__meta">{error}</p> : null}
      <NodeHandle type="source" />
    </div>
  );
}
