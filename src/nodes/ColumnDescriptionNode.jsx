/**
 * Node for editing metadata about each detected spreadsheet column.
 * Descriptions are typed directly, units are assigned by dropping values from
 * UnitNode, and every change is sent upward for automatic RDF serialization.
 */
import { useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import tabularSchemaIcon from '../assets/tabular_schema.png';

const UNIT_DRAG_MIME_TYPE = 'application/tabulatrdm-unit';

export default function ColumnDescriptionNode({ id, data, selected, onFieldsChange }) {
  const fields = Array.isArray(data.fields) ? data.fields : [];
  const hasFields = fields.length > 0;

  const handleDescriptionChange = useCallback(
    (index, description) => {
      const nextFields = fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, description } : field,
      );
      onFieldsChange(id, nextFields);
    },
    [fields, id, onFieldsChange],
  );

  const handleUnitChange = useCallback(
    (index, unit, unitUri = '') => {
      const nextFields = fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, unit, unitUri } : field,
      );
      onFieldsChange(id, nextFields);
    },
    [fields, id, onFieldsChange],
  );

  const handleUnitDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleUnitDrop = useCallback(
    (event, index) => {
      // Unit nodes provide structured JSON; the text fallback keeps drops from
      // plain external sources harmless.
      const rawUnit =
        event.dataTransfer.getData(UNIT_DRAG_MIME_TYPE) ||
        event.dataTransfer.getData('text/plain');

      if (!rawUnit) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      try {
        const unit = JSON.parse(rawUnit);
        handleUnitChange(index, unit.label || unit.uri || '', unit.uri || '');
      } catch {
        handleUnitChange(index, rawUnit);
      }
    },
    [handleUnitChange],
  );

  return (
    <div className={`column-description-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="column-description-node__header">
        <img src={tabularSchemaIcon} alt="" className="column-description-node__icon" />
        <p className="column-description-node__title">{data.label}</p>
      </div>

      {hasFields ? (
        <div className="column-description-node__table-wrap">
          <table className="column-description-node__table">
            <thead>
              <tr>
                <th>Header</th>
                <th>Column Description</th>
                <th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr key={`${field.header || 'header'}-${index}`}>
                  <td>{field.header || `Column ${index + 1}`}</td>
                  <td>
                    <input
                      type="text"
                      className="column-description-node__input"
                      value={field.description ?? ''}
                      onChange={(event) => handleDescriptionChange(index, event.target.value)}
                      placeholder="Add column description"
                    />
                  </td>
                  <td
                    className="column-description-node__unit-cell"
                    onDragOver={handleUnitDragOver}
                    onDrop={(event) => handleUnitDrop(event, index)}
                  >
                    <input
                      type="text"
                      className="column-description-node__input column-description-node__unit-input"
                      value={field.unit ?? ''}
                      readOnly
                      onDragOver={handleUnitDragOver}
                      onDrop={(event) => handleUnitDrop(event, index)}
                      placeholder="Drag a unit from Units"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="column-description-node__empty">No headers available</p>
      )}

      <p className="column-description-node__status">
        {hasFields ? 'Column descriptions are saved as RDF automatically' : 'No RDF to save yet'}
      </p>

      <Handle type="source" position={Position.Right} />
    </div>
  );
}
