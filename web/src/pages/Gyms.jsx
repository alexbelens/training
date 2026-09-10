import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, Confirm, useToast } from '../components/ui.jsx';
import { MachinePopup } from '../components/MachinePopup.jsx';
import { MACHINE_TYPES, machineTypeGroups, machineTypeLabel, missingTypes } from '@shared/machine-types.js';

function TypeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={onChange}>
      {machineTypeGroups().map(([group, types]) => (
        <optgroup key={group} label={group}>
          {types.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

function Machine({ m, onChanged, onPreview }) {
  const toast = useToast();
  const fileRef = useRef();
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(m);
  const [busy, setBusy] = useState(false);

  async function save() {
    try { await api.put(`/api/machines/${m.id}`, { type: f.type, name: f.name, vendor: f.vendor, note: f.note }); setEdit(false); await onChanged(); }
    catch (e) { toast(e.message); }
  }
  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try { await api.upload(`/api/machines/${m.id}/photo`, file); toast('Фото загружено'); await onChanged(); }
    catch (err) { toast(err.message); }
    finally { setBusy(false); }
  }
  async function dropPhoto() { try { await api.del(`/api/machines/${m.id}/photo`); await onChanged(); } catch (e) { toast(e.message); } }
  async function remove() { try { await api.del(`/api/machines/${m.id}`); await onChanged(); } catch (e) { toast(e.message); } }

  if (edit) {
    return (
      <div className="list-item stack">
        <Field label="Тип"><TypeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} /></Field>
        <Field label="Как называется в зале"><input value={f.name || ''} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={machineTypeLabel(f.type)} /></Field>
        <Field label="Производитель / модель"><input value={f.vendor || ''} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="Matrix, Technogym…" /></Field>
        <Field label="Заметка"><input value={f.note || ''} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Где стоит, особенности настройки" /></Field>
        <div className="row">
          <button className="btn-sm btn-primary" onClick={save}>Сохранить</button>
          <button className="btn-sm btn-ghost" onClick={() => { setF(m); setEdit(false); }}>Отмена</button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-item machine-row">
      {m.photo
        ? <img className="machine-thumb" src={`/api/machines/${m.id}/photo`} alt="" onClick={() => onPreview(m)} />
        : <div className="machine-thumb empty" onClick={() => fileRef.current?.click()}>＋</div>}
      <div className="grow">
        <div><b>{m.name || machineTypeLabel(m.type)}</b>{m.vendor ? <span className="muted small"> · {m.vendor}</span> : null}</div>
        <div className="tiny muted">{machineTypeLabel(m.type)}</div>
        {m.note && <div className="small" style={{ marginTop: 2 }}>{m.note}</div>}
        <div className="row" style={{ marginTop: 4 }}>
          <button className="link-btn tiny" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? 'загрузка…' : m.photo ? 'заменить фото' : 'добавить фото'}</button>
          {m.photo && <button className="link-btn tiny" onClick={dropPhoto}>убрать фото</button>}
          <button className="link-btn tiny" onClick={() => setEdit(true)}>править</button>
          <Confirm className="link-btn tiny" text="Удалить?" onYes={remove}>удалить</Confirm>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={upload} />
    </div>
  );
}

function Gym({ gym, active, program, onChanged, onPreview }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState(MACHINE_TYPES[0].slug);
  const [renaming, setRenaming] = useState(false);
  const [g, setG] = useState(gym);

  const absent = missingTypes(program, gym.machines);

  async function addMachine() {
    try { await api.post(`/api/gyms/${gym.id}/machines`, { type }); setAdding(false); await onChanged(); }
    catch (e) { toast(e.message); }
  }
  async function saveGym() {
    try { await api.put(`/api/gyms/${gym.id}`, { name: g.name, note: g.note }); setRenaming(false); await onChanged(); }
    catch (e) { toast(e.message); }
  }
  async function makeActive() { try { await api.post(`/api/gyms/${gym.id}/active`); await onChanged(); } catch (e) { toast(e.message); } }
  async function removeGym() { try { await api.del(`/api/gyms/${gym.id}`); await onChanged(); } catch (e) { toast(e.message); } }

  return (
    <div className={'card stack' + (active ? ' gym-active' : '')}>
      {renaming ? (
        <>
          <Field label="Название зала"><input value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
          <Field label="Заметка"><input value={g.note || ''} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="Адрес, часы работы, что помнить" /></Field>
          <div className="row">
            <button className="btn-sm btn-primary" onClick={saveGym}>Сохранить</button>
            <button className="btn-sm btn-ghost" onClick={() => { setG(gym); setRenaming(false); }}>Отмена</button>
          </div>
        </>
      ) : (
        <div className="row between">
          <div className="grow">
            <h2 style={{ margin: 0 }}>{gym.name} {active && <span className="chip">активный</span>}</h2>
            {gym.note && <div className="small muted">{gym.note}</div>}
          </div>
          <div className="row">
            {!active && <button className="btn-sm" onClick={makeActive}>Тренируюсь здесь</button>}
            <button className="link-btn tiny" onClick={() => setRenaming(true)}>править</button>
            <Confirm className="link-btn tiny" text="Удалить зал?" onYes={removeGym}>удалить</Confirm>
          </div>
        </div>
      )}

      {gym.machines.length === 0
        ? <p className="small muted">Тренажёров пока нет. Добавь те, на которых занимаешься, и сфотографируй их — фото будет открываться прямо в тренировке.</p>
        : gym.machines.map((m) => <Machine key={m.id} m={m} onChanged={onChanged} onPreview={onPreview} />)}

      {adding ? (
        <div className="row">
          <TypeSelect value={type} onChange={(e) => setType(e.target.value)} />
          <button className="btn-sm btn-primary" onClick={addMachine}>Добавить</button>
          <button className="btn-sm btn-ghost" onClick={() => setAdding(false)}>Отмена</button>
        </div>
      ) : <button className="btn-sm" onClick={() => setAdding(true)}>+ тренажёр</button>}

      {absent.length > 0 && (
        <div className="banner info">
          <span className="small">В программе есть упражнения без тренажёра в этом зале: {absent.map(machineTypeLabel).join(', ')}. Добавь их или попроси тренера подобрать замену.</span>
        </div>
      )}
    </div>
  );
}

export default function Gyms({ state, reload }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [preview, setPreview] = useState(null);
  const { gyms = [], active_gym_id, program } = state;

  async function addGym() {
    const n = name.trim();
    if (!n) return;
    try { await api.post('/api/gyms', { name: n }); setName(''); await reload(); }
    catch (e) { toast(e.message); }
  }

  return (
    <div className="stack">
      <div className="card stack">
        <h2>Залы</h2>
        <p className="small muted">
          Упражнение в программе ссылается на <b>тип</b> тренажёра, а зал подставляет свой экземпляр с фото.
          Переключил зал — программа осталась той же, поменялись только железки.
        </p>
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название зала" onKeyDown={(e) => e.key === 'Enter' && addGym()} />
          <button className="btn-sm btn-primary" onClick={addGym}>+ зал</button>
        </div>
      </div>

      {gyms.length === 0
        ? <div className="card"><p className="small muted">Пока ни одного зала. Заведи первый — он сразу станет активным.</p></div>
        : gyms.map((g) => (
            <Gym key={g.id} gym={g} active={g.id === active_gym_id} program={program} onChanged={reload} onPreview={setPreview} />
          ))}

      {preview && (
        <MachinePopup type={preview.type} entry={{ machine: preview, alternatives: [] }} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
