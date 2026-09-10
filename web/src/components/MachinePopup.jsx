import React, { useState } from 'react';
import { Modal } from './ui.jsx';
import { machineTypeLabel } from '@shared/machine-types.js';

/** Карточка тренажёра активного зала: фото со своего сервера, без ухода на сторонние сайты. */
export function MachinePopup({ type, entry, onClose }) {
  const m = entry?.machine;
  return (
    <Modal title={machineTypeLabel(type)} onClose={onClose}>
      {!m ? (
        <p className="small muted">В активном зале такого тренажёра нет. Добавь его на вкладке «Залы» — или напиши тренеру, он подберёт замену.</p>
      ) : (
        <>
          {m.photo
            ? <img className="machine-photo" src={`/api/machines/${m.id}/photo`} alt={m.name || machineTypeLabel(type)} />
            : <div className="machine-photo empty small muted">Фото пока нет — добавь его на вкладке «Залы»</div>}
          <div className="machine-title">{m.name || machineTypeLabel(type)}{m.vendor ? <span className="muted small"> · {m.vendor}</span> : null}</div>
          {m.note && <p className="small" style={{ marginTop: 4 }}>{m.note}</p>}
          {entry.alternatives.length > 0 && (
            <p className="tiny muted" style={{ marginTop: 6 }}>В зале есть ещё такой же: {entry.alternatives.length} шт.</p>
          )}
        </>
      )}
    </Modal>
  );
}

/** Кнопка «тренажёр» рядом с упражнением. Открывает попап, никуда не уводит. */
export default function MachineButton({ state, type, label = 'тренажёр' }) {
  const [open, setOpen] = useState(false);
  if (!type) return null;
  const entry = state.machines_by_type?.[type];
  return (
    <>
      <button type="button" className="link-btn tiny" onClick={() => setOpen(true)}>
        {label}{entry?.machine?.photo ? ' 📷' : ''}{!entry ? ' ⚠' : ''}
      </button>
      {open && <MachinePopup type={type} entry={entry} onClose={() => setOpen(false)} />}
    </>
  );
}
