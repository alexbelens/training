import React from 'react';

/**
 * Простой адаптивный SVG-график. points: [{x: label, y: number}], target: горизонтальная линия,
 * bars: столбики (от нуля), yMin/yMax: фиксированный диапазон оси.
 */
export default function LineChart({ points, target, bars = false, unit = '', height = 160, yMin, yMax }) {
  const W = 340, H = height, padL = 40, padR = 10, padT = 12, padB = 24;
  if (!points || points.length === 0) return <p className="muted small">Пока нет данных</p>;
  const ys = points.map((p) => p.y).concat(target != null ? [target] : []);
  let min = yMin ?? Math.min(...ys), max = yMax ?? Math.max(...ys);
  if (bars) min = 0;
  if (max === min) { max += 1; if (yMin == null && !bars) min -= 1; }
  const span = max - min;
  if (yMin == null && !bars) min -= span * 0.08;
  if (yMax == null) max += span * 0.08;
  const n = points.length;
  const xAt = (i) => padL + (n === 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const yAt = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const ticks = 4;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);
  const fmt = (v) => (Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10));
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ');
  const labelEvery = Math.max(1, Math.ceil(n / 5));
  const bw = Math.max(6, Math.min(28, ((W - padL - padR) / n) * 0.55));
  const anchor = (i) => (n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle');
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${H}` }}>
      <g className="grid">
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={yAt(v)} y2={yAt(v)} />
            <text x={padL - 4} y={yAt(v) + 3} textAnchor="end">{fmt(v)}</text>
          </g>
        ))}
      </g>
      {target != null && <line className="target" x1={padL} x2={W - padR} y1={yAt(target)} y2={yAt(target)} />}
      {bars
        ? points.map((p, i) => <rect key={i} className="bar" x={xAt(i) - bw / 2} y={yAt(p.y)} width={bw} height={Math.max(0, yAt(0) - yAt(p.y))} rx="2" />)
        : <>
            <path className="line" d={path} />
            {points.map((p, i) => <circle key={i} className="dot" cx={xAt(i)} cy={yAt(p.y)} r="3" />)}
          </>}
      {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) && (
        <text key={'l' + i} x={xAt(i)} y={H - 6} textAnchor={anchor(i)}>{p.x}</text>
      ))}
      {unit && <text x={W - padR} y={padT - 2} textAnchor="end">{unit}</text>}
    </svg>
  );
}
