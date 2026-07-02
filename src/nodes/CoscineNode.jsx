import coscineLogo from '../assets/coscine_rgb.svg';
import NodeHandle from './NodeHandle';

export default function CoscineNode({ data, selected }) {
  return (
    <div className={`coscine-node${selected ? ' selected' : ''}`}>
      <NodeHandle type="target" />
      <div className="coscine-node__header">
        <img src={coscineLogo} alt="" className="coscine-node__icon" />
        <p className="coscine-node__title">{data.label}</p>
      </div>
      <p className="coscine-node__status">Coscine workspace node</p>
      <NodeHandle type="source" />
    </div>
  );
}
