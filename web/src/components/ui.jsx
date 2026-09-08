import React, { useEffect, useState, createContext, useContext } from 'react';

const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2600); return () => clearTimeout(t); }, [msg]);
  return (
    <ToastCtx.Provider value={setMsg}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Field({ label, children }) {
  return <label className="f"><span>{label}</span>{children}</label>;
}

export function Confirm({ text, onYes, children, className = 'btn-danger btn-sm' }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return; const t = setTimeout(() => setArm(false), 3000); return () => clearTimeout(t); }, [arm]);
  return (
    <button className={className} onClick={() => (arm ? (setArm(false), onYes()) : setArm(true))}>
      {arm ? (text || 'Точно?') : children}
    </button>
  );
}

export const fmtDate = (d) => { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}.${m}.${y.slice(2)}`; };
export const today = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
export const photoUrl = (q) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q || '')}`;
