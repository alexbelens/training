import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function UpdateBanner() {
  const [v, setV] = useState(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => api.get('/api/version').then((d) => alive && setV(d)).catch(() => {});
    load();
    const t = setInterval(load, 6 * 60 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  if (!v?.update_available || hidden) return null;
  let dismissed = null; try { dismissed = localStorage.getItem('dismissed_update'); } catch {}
  if (dismissed === v.latest) return null;
  return (
    <div className="banner update">
      <div>
        <b>Доступна версия {v.latest}</b> <span className="muted">(у тебя {v.current})</span>
        <div className="small muted">Обновление: <code>./update.sh</code> на сервере. <a href={v.url} target="_blank" rel="noreferrer">Что нового</a></div>
      </div>
      <button className="btn-sm btn-ghost" onClick={() => { try { localStorage.setItem('dismissed_update', v.latest); } catch {} setHidden(true); }}>✕</button>
    </div>
  );
}
