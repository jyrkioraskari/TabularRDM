import { Handle, Position } from '@xyflow/react';

export default function NodeHandle({ type }) {
  const isInput = type === 'target';

  return (
    <Handle
      type={type}
      position={isInput ? Position.Left : Position.Right}
      className={`node-handle node-handle--${isInput ? 'input' : 'output'}`}
      title={isInput ? 'Input' : 'Output'}
    >
      <span className="node-handle__icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          {isInput ? (
            <>
              <path d="M2 8h8" />
              <path d="m7 5 3 3-3 3" />
              <path d="M12.5 3.5v9" />
            </>
          ) : (
            <>
              <path d="M4 8h8" />
              <path d="m9 5 3 3-3 3" />
              <path d="M3.5 3.5v9" />
            </>
          )}
        </svg>
      </span>
    </Handle>
  );
}
