/**
 * Read-only node that displays a small preview of the connected tabular file.
 * App.jsx provides headers and rows after parsing the loaded workbook.
 */
import { Handle, Position } from '@xyflow/react';
import spreadsheetIcon from '../assets/matt-icons_text-x-office-generic-spreadsheet.svg';

export default function PreviewTabularDataNode({ data, selected }) {
  const headers = Array.isArray(data.headers) ? data.headers : [];
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const hasData = headers.length > 0;

  return (
    <div className={`preview-tabular-data-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="preview-tabular-data-node__header">
        <img src={spreadsheetIcon} alt="" className="preview-tabular-data-node__icon" />
        <p className="preview-tabular-data-node__title">{data.label}</p>
      </div>

      {hasData ? (
        <div className="preview-tabular-data-node__table-wrap">
          <table className="preview-tabular-data-node__table">
            <thead>
              <tr>
                {headers.map((header, index) => (
                  <th key={`${header}-${index}`}>{header || `Column ${index + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`}>
                  {headers.map((_, columnIndex) => (
                    <td key={`row-${rowIndex}-column-${columnIndex}`}>{row[columnIndex] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="preview-tabular-data-node__empty">No tabular data loaded</p>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
