import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import mammoth from "mammoth";
import { IconTrash, IconEdit, IconClose, IconPlus, IconPalette, IconFlag, IconUsers } from "../icons";
import {
  CARD_COLORS, PHASE_COLORS,
  normalizeTemplatesFromApi, orderedTemplateTypeNames,
} from "../utils";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

// ── Seção Usuários ────────────────────────────────────────────────────────────

function UsersSection({ token, currentUserId, onUnauthorized, onSelfDemoted }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  const load = useCallback(() => {
    setErr(""); setLoading(true);
    fetch(`${API_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) throw new Error("401");
        if (r.status === 403) { setErr("Sem permissão para acessar o painel."); setUsers([]); return null; }
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then(data => { if (data) setUsers(data); })
      .catch(e => {
        if (e.message === "401") onUnauthorized();
        else if (e.message !== "fail") setErr("Não foi possível carregar a lista.");
      })
      .finally(() => setLoading(false));
  }, [token, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const patchRole = (id, role) => {
    fetch(`${API_URL}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setErr(data.error || "Falha ao atualizar"); load(); return; }
        if (id === currentUserId && role === "user") { onSelfDemoted(); return; }
        load();
      })
      .catch(() => { setErr("Erro de conexão"); load(); });
  };

  const deleteUser = (id) => {
    if (!window.confirm("Remover este usuário permanentemente?")) return;
    fetch(`${API_URL}/api/admin/users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => { if (!ok) { setErr(data.error || "Falha ao remover"); return; } load(); })
      .catch(() => setErr("Erro de conexão"));
  };

  const fmtDate    = d => { try { return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return "—"; } };
  const adminCount = users.filter(u => u.role === "admin").length;

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Usuários</h2>
      <p className="admin-lead">Gerencie contas: papel (usuário ou administrador) e exclusão de cadastros.</p>
      {err && <div className="profile-err admin-alert">{err}</div>}
      {loading ? (
        <div className="admin-muted">Carregando...</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Usuário</th><th>Papel</th><th>Cadastro</th><th /></tr></thead>
            <tbody>
              {users.map(u => {
                const onlyAdmin = u.role === "admin" && adminCount <= 1;
                return (
                  <tr key={u.id}>
                    <td className="admin-td-user">
                      {u.username}{u.id === currentUserId && <span className="admin-you"> (você)</span>}
                    </td>
                    <td>
                      <select className="admin-select doc-input" value={u.role}
                        onChange={e => patchRole(u.id, e.target.value)} disabled={onlyAdmin}
                        title={onlyAdmin ? "É necessário haver outro administrador antes de rebaixar este perfil" : ""}>
                        <option value="user">Usuário</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="admin-muted">{fmtDate(u.created_at)}</td>
                    <td className="admin-td-actions">
                      <button type="button" className="icon-btn danger" title="Remover usuário"
                        disabled={u.id === currentUserId} onClick={() => deleteUser(u.id)}>
                        <IconTrash />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Seção Setores ─────────────────────────────────────────────────────────────

function SetoresSection({ token, sectors, onSectorsChange }) {
  const [newName, setNewName]       = useState("");
  const [err, setErr]               = useState("");
  const [editingId, setEditingId]   = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading]       = useState(false);
  const editInputRef = useRef();

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setErr(""); setLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/sectors`, { method: "POST", headers: authHeaders, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao criar"); return; }
      onSectorsChange(data);
      setNewName("");
    } catch { setErr("Erro de conexão"); } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remover este setor?")) return;
    setErr("");
    try {
      const res  = await fetch(`${API_URL}/api/sectors/${id}`, { method: "DELETE", headers: authHeaders });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao remover"); return; }
      onSectorsChange(data);
    } catch { setErr("Erro de conexão"); }
  };

  const startEdit = (sector) => {
    setEditingId(sector.id);
    setEditingName(sector.name);
  };

  const handleSaveEdit = async () => {
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }
    setErr("");
    try {
      const res  = await fetch(`${API_URL}/api/sectors/${editingId}`, { method: "PUT", headers: authHeaders, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao atualizar"); return; }
      onSectorsChange(data);
      setEditingId(null);
    } catch { setErr("Erro de conexão"); }
  };

  const cancelEdit = () => { setEditingId(null); setEditingName(""); };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Setores / Órgãos</h2>
      <p className="admin-lead">Defina os setores disponíveis para seleção ao criar um processo.</p>
      {err && <div className="profile-err admin-alert">{err}</div>}

      {/* Lista de setores */}
      {sectors.length === 0 ? (
        <p className="admin-muted" style={{ marginBottom: 16 }}>Nenhum setor cadastrado ainda.</p>
      ) : (
        <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "100%" }}>Nome do setor</th>
                <th style={{ whiteSpace: "nowrap" }} />
              </tr>
            </thead>
            <tbody>
              {sectors.map(s => (
                <tr key={s.id}>
                  <td className="admin-td-user" style={{ width: "100%" }}>
                    {editingId === s.id ? (
                      <input
                        ref={editInputRef}
                        className="doc-input"
                        style={{ padding: "5px 8px", fontSize: "0.85rem", width: "100%" }}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="admin-td-actions" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {editingId === s.id ? (
                        <>
                          <button type="button" className="btn-confirm" style={{ padding: "4px 10px", fontSize: "0.78rem" }} onClick={handleSaveEdit}>Salvar</button>
                          <button type="button" className="icon-btn" onClick={cancelEdit}><IconClose /></button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="icon-btn" title="Editar" onClick={() => startEdit(s)}><IconEdit /></button>
                          <button type="button" className="icon-btn danger" title="Remover" onClick={() => handleDelete(s.id)}><IconTrash /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Adicionar novo setor */}
      <div className="admin-add-row">
        <input
          className="doc-input"
          placeholder="Nome do novo setor..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={handleAdd} disabled={!newName.trim() || loading}
          style={{ gap: 5, whiteSpace: "nowrap" }}>
          <IconPlus /> Adicionar
        </button>
      </div>
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

// ── Modelos ───────────────────────────────────────────────────────────────────

async function parseDocxToItems(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = []; let phaseColorIdx = 0;
  for (const el of Array.from(doc.body.children)) {
    const text = el.textContent.trim();
    if (!text) continue;
    if (el.tagName === "H2") { items.push({ type: "phase", name: text, bgColor: PHASE_COLORS[phaseColorIdx % PHASE_COLORS.length] }); phaseColorIdx++; }
    else if (el.tagName === "P") { items.push({ type: "doc", name: text, bgColor: null }); }
  }
  return items;
}

function ModelosSection({ templates, onSave }) {
  const [local, setLocal] = useState(() => normalizeTemplatesFromApi(JSON.parse(JSON.stringify(templates))));
  const [selected, setSelected] = useState(() => orderedTemplateTypeNames(normalizeTemplatesFromApi(JSON.parse(JSON.stringify(templates))))[0] || "");
  const [newName, setNewName]     = useState("");
  const [newItem, setNewItem]     = useState("");
  const [addType, setAddType]     = useState("doc");
  const [openColorIdx, setOpenColorIdx]     = useState(null);
  const [dragIdx, setDragIdx]               = useState(null);
  const [dragOverIdx, setDragOverIdx]       = useState(null);
  const [dragTypeKey, setDragTypeKey]       = useState(null);
  const [dragOverTypeKey, setDragOverTypeKey] = useState(null);
  const [openTypeColorKey, setOpenTypeColorKey] = useState(null);
  const [phaseColorIdx, setPhaseColorIdx]   = useState(0);
  const [mobileView, setMobileView]         = useState("types");
  const [docxError, setDocxError]           = useState("");
  const [saved, setSaved]                   = useState(false);
  const colorRefs    = useRef({});
  const typeColorRef = useRef({});
  const docxInputRef = useRef(null);

  // Sincroniza quando templates mudam externamente
  useEffect(() => {
    setLocal(normalizeTemplatesFromApi(JSON.parse(JSON.stringify(templates))));
  }, [templates]);

  const orderedKeys   = useMemo(() => orderedTemplateTypeNames(local), [local]);
  const selectedEntry = selected ? local[selected] : null;
  const selectedItems = selectedEntry ? selectedEntry.items : [];

  useEffect(() => {
    if (selected && !local[selected]) setSelected(orderedKeys[0] || "");
    else if (!selected && orderedKeys.length) setSelected(orderedKeys[0]);
  }, [local, selected, orderedKeys]);

  useEffect(() => {
    if (openColorIdx === null) return;
    const h = (e) => { if (colorRefs.current[openColorIdx] && !colorRefs.current[openColorIdx].contains(e.target)) setOpenColorIdx(null); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [openColorIdx]);

  useEffect(() => {
    if (openTypeColorKey == null) return;
    const h = (e) => { const ref = typeColorRef.current[openTypeColorKey]; if (ref && !ref.contains(e.target)) setOpenTypeColorKey(null); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, [openTypeColorKey]);

  const addTemplate = () => {
    if (!newName.trim() || local[newName.trim()]) return;
    const key = newName.trim();
    setLocal(p => { const next = { ...p, [key]: { items: [], color: "#30363d", order: 999 } }; const keys = orderedTemplateTypeNames(next); const out = { ...next }; keys.forEach((k, i) => { out[k] = { ...out[k], order: i }; }); return out; });
    setSelected(key); setNewName("");
  };
  const deleteTemplate = (key) => {
    setLocal(p => { const next = { ...p }; delete next[key]; orderedTemplateTypeNames(next).forEach((k, i) => { next[k] = { ...next[k], order: i }; }); return next; });
    setSelected(s => s === key ? "" : s);
  };
  const addItem = () => {
    if (!newItem.trim() || !selected || !local[selected]) return;
    const entry = addType === "phase" ? { type: "phase", name: newItem.trim(), bgColor: PHASE_COLORS[phaseColorIdx] } : { type: "doc", name: newItem.trim(), bgColor: null };
    setLocal(p => ({ ...p, [selected]: { ...p[selected], items: [...p[selected].items, entry] } }));
    setNewItem("");
  };
  const removeItem    = (idx)        => setLocal(p => ({ ...p, [selected]: { ...p[selected], items: p[selected].items.filter((_, i) => i !== idx) } }));
  const setItemColor  = (idx, color) => { setLocal(p => ({ ...p, [selected]: { ...p[selected], items: p[selected].items.map((item, i) => i === idx ? { ...item, bgColor: color } : item) } })); setOpenColorIdx(null); };
  const setTypeColor  = (key, color) => { setLocal(p => ({ ...p, [key]: { ...p[key], color } })); setOpenTypeColorKey(null); };

  const handleDragStart = (i)    => setDragIdx(i);
  const handleDragOver  = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop      = (i)    => { if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; } setLocal(p => { const items = [...p[selected].items]; const [mv] = items.splice(dragIdx, 1); items.splice(i, 0, mv); return { ...p, [selected]: { ...p[selected], items } }; }); setDragIdx(null); setDragOverIdx(null); };
  const handleDragEnd   = ()     => { setDragIdx(null); setDragOverIdx(null); };
  const handleTypeDragStart = (e, k)  => { e.stopPropagation(); setDragTypeKey(k); };
  const handleTypeDragOver  = (e, k)  => { e.preventDefault(); setDragOverTypeKey(k); };
  const handleTypeDrop      = (tKey)  => {
    if (!dragTypeKey || dragTypeKey === tKey) { setDragTypeKey(null); setDragOverTypeKey(null); return; }
    setLocal(p => { const keys = orderedTemplateTypeNames(p); const from = keys.indexOf(dragTypeKey), to = keys.indexOf(tKey); if (from < 0 || to < 0) return p; const nk = [...keys]; const [mv] = nk.splice(from, 1); nk.splice(to, 0, mv); const next = { ...p }; nk.forEach((name, i) => { next[name] = { ...next[name], order: i }; }); return next; });
    setDragTypeKey(null); setDragOverTypeKey(null);
  };
  const handleTypeDragEnd = () => { setDragTypeKey(null); setDragOverTypeKey(null); };

  const handleDocxFileChange = async (e) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return; setDocxError("");
    try {
      const items = await parseDocxToItems(file);
      if (items.length === 0) { setDocxError("Nenhum item encontrado. Use Título 2 para fases e parágrafos."); return; }
      const base = file.name.replace(/\.docx?$/i, "").trim() || "Importado";
      let key = base, n = 2;
      while (local[key]) { key = `${base} (${n++})`; }
      const newLocal = { ...local, [key]: { items, color: "#30363d", order: orderedTemplateTypeNames(local).length } };
      setLocal(newLocal); setSelected(key); onSave(newLocal);
    } catch { setDocxError("Erro ao ler o arquivo. Certifique-se que é um .docx válido."); }
  };

  const handleSave = () => { onSave(local); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const S = {
    body:    { display:"flex", overflow:"hidden", minHeight:0, border:"1px solid #30363d", borderRadius:12, background:"#161b22" },
    sidebar: { width:220, minWidth:220, borderRight:"1px solid #30363d", padding:14, display:"flex", flexDirection:"column", gap:4, overflowY:"auto", overflowX:"hidden", flexShrink:0 },
    content: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0, minHeight:0 },
    label:   { fontSize:"0.7rem", color:"#8b949e", textTransform:"uppercase", letterSpacing:".6px", marginBottom:6, flexShrink:0 },
    list:    { flex:1, minHeight:0, overflowY:"auto", overflowX:"hidden", padding:"12px 12px 0", display:"flex", flexDirection:"column", gap:3 },
    addBar:  { flexShrink:0, borderTop:"1px solid #30363d", padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 },
  };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">Modelos de Processo</h2>
      <p className="admin-lead">Defina os tipos de processo e os documentos/fases de cada modelo.</p>

      <div style={{ ...S.body, height: 460, maxHeight: 460 }} className="tpl-manager-body" data-view={mobileView}>

        {/* Sidebar */}
        <div style={S.sidebar} className="tpl-manager-sidebar">
          <p style={S.label}>Tipos de Processo</p>
          <p style={{ fontSize:"0.65rem", color:"#6e7681", marginBottom:6, lineHeight:1.35 }}>Arraste ⠿ para reordenar. A cor vale para novos processos deste tipo.</p>
          {orderedKeys.map(k => (
            <div key={k} onClick={() => { setSelected(k); setMobileView("docs"); }}
              onDragOver={e => handleTypeDragOver(e, k)} onDrop={() => handleTypeDrop(k)} onDragEnd={handleTypeDragEnd}
              style={{ display:"flex", alignItems:"center", gap:4, padding:"6px 8px", borderRadius:8, cursor:"pointer", fontSize:"0.82rem",
                background: selected === k ? "#1c2330" : "transparent", color: selected === k ? "#f0883e" : "#e6edf3",
                fontWeight: selected === k ? 500 : 400,
                border: dragOverTypeKey === k && dragTypeKey !== k ? "1px dashed #58a6ff" : "1px solid transparent",
                opacity: dragTypeKey === k ? 0.45 : 1 }}>
              <span draggable onDragStart={e => handleTypeDragStart(e, k)} style={{ color:"#3a4556", fontSize:"1rem", userSelect:"none", flexShrink:0, cursor:"grab" }} title="Arrastar">⠿</span>
              <span style={{ width:10, height:10, borderRadius:"50%", background: local[k].color || "#30363d", flexShrink:0 }} />
              <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0 }}>{k}</span>
              <div style={{ display:"flex", gap:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                <div style={{ position:"relative" }} ref={el => { typeColorRef.current[k] = el; }}>
                  <button type="button" className="icon-btn" title="Cor" onClick={() => setOpenTypeColorKey(openTypeColorKey === k ? null : k)}><IconPalette /></button>
                  {openTypeColorKey === k && (
                    <div className="color-picker" style={{ right:0, left:"auto" }}>
                      {CARD_COLORS.map(c => (
                        <button key={c.label} type="button" className={`color-swatch ${local[k].color === c.value ? "active" : ""}`}
                          style={{ background: c.value || "#1c2330", outline: local[k].color === c.value ? "2px solid #58a6ff" : "none" }}
                          title={c.label} onClick={() => setTypeColor(k, c.value)} />
                      ))}
                    </div>
                  )}
                </div>
                <button type="button" className="icon-btn danger sm" onClick={() => deleteTemplate(k)}><IconTrash /></button>
              </div>
            </div>
          ))}
          <input ref={docxInputRef} type="file" accept=".docx,.doc" style={{ display:"none" }} onChange={handleDocxFileChange} />
          <div style={{ display:"flex", gap:6, marginTop:8 }}>
            <input className="tpl-input" placeholder="Novo tipo..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addTemplate()} />
            <button className="btn-add-tpl" onClick={addTemplate} title="Adicionar tipo"><IconPlus /></button>
            <button className="btn-add-tpl" title="Importar Word (.docx)" onClick={() => { setDocxError(""); docxInputRef.current?.click(); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            </button>
          </div>
          {docxError && <p style={{ fontSize:"0.72rem", color:"#f85149", marginTop:6, lineHeight:1.4 }}>{docxError}</p>}
        </div>

        {/* Conteúdo */}
        <div style={S.content} className="tpl-manager-content">
          {selected ? (<>
            <button className="tpl-mobile-back" onClick={() => setMobileView("types")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              {selected}
            </button>
            <div style={{ padding:"12px 14px 0", flexShrink:0 }}>
              <p style={S.label}>Itens em <strong style={{ color:"#e6edf3" }}>{selected}</strong> <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0 }}>— arraste para reordenar</span></p>
            </div>
            <div style={S.list} className="tpl-scroll-list">
              {selectedItems.map((item, i) => (
                <div key={i}
                  style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:8, fontSize:"0.82rem", cursor:"grab",
                    background: item.type === "phase" ? (item.bgColor || "#1a2a3a") : (item.bgColor || "#1c2330"),
                    border: dragOverIdx === i && dragIdx !== i ? "1px dashed #58a6ff" : "1px solid transparent",
                    opacity: dragIdx === i ? 0.35 : 1, marginBottom: item.type === "phase" ? 4 : 0 }}
                  draggable onDragStart={() => handleDragStart(i)} onDragOver={e => handleDragOver(e, i)} onDrop={() => handleDrop(i)} onDragEnd={handleDragEnd}>
                  <span style={{ color:"#3a4556", fontSize:"1rem", userSelect:"none", flexShrink:0 }}>⠿</span>
                  {item.type === "phase" && <IconFlag />}
                  <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight: item.type === "phase" ? 700 : 400, fontSize: item.type === "phase" ? "0.85rem" : "0.82rem" }}>{item.name}</span>
                  <div style={{ display:"flex", gap:4, alignItems:"center", flexShrink:0 }}>
                    {item.type === "doc" && (
                      <div style={{ position:"relative" }} ref={el => colorRefs.current[i] = el}>
                        <button className="icon-btn" title="Cor" onClick={() => setOpenColorIdx(openColorIdx === i ? null : i)}><IconPalette /></button>
                        {openColorIdx === i && (
                          <div className="color-picker">
                            {CARD_COLORS.map(c => (
                              <button key={c.label} className={`color-swatch ${item.bgColor === c.value ? "active" : ""}`}
                                style={{ background: c.value || "#1c2330", outline: item.bgColor === c.value ? "2px solid #58a6ff" : "none" }}
                                title={c.label} onClick={() => setItemColor(i, c.value)} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <button className="icon-btn danger sm" style={item.type === "phase" ? { color:"#ccc" } : {}} onClick={() => removeItem(i)}><IconTrash /></button>
                  </div>
                </div>
              ))}
            </div>
            <div style={S.addBar}>
              <div style={{ display:"flex", gap:6 }}>
                <button className={`type-toggle ${addType === "doc"   ? "active" : ""}`} onClick={() => setAddType("doc")}>Documento</button>
                <button className={`type-toggle ${addType === "phase" ? "active" : ""}`} onClick={() => setAddType("phase")}><IconFlag /> Fase</button>
              </div>
              {addType === "phase" && (
                <div style={{ display:"flex", gap:6 }}>
                  {PHASE_COLORS.map((c, i) => (
                    <button key={i} className={`phase-color-swatch ${phaseColorIdx === i ? "active" : ""}`} style={{ background:c }} onClick={() => setPhaseColorIdx(i)} />
                  ))}
                </div>
              )}
              <div style={{ display:"flex", gap:6 }}>
                <input className="tpl-input" placeholder={addType === "phase" ? "Nome da fase..." : "Nome do documento..."} value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} style={{ flex:1 }} />
                <button className="btn-add-tpl" onClick={addItem}><IconPlus /></button>
              </div>
            </div>
          </>) : (
            <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#8b949e", fontSize:"0.85rem" }}>
              Selecione ou crie um tipo de processo.
            </div>
          )}
        </div>
      </div>

      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:14 }}>
        <button className="btn-save" onClick={handleSave}>
          {saved ? "✓ Salvo!" : "Salvar Modelos"}
        </button>
      </div>
    </div>
  );
}

// ── Seção Colaboradores ───────────────────────────────────────────────────────

function ColaboradoresSection({ token, onUnauthorized }) {
  const [collabs, setCollabs]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState("");
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [formNome, setFormNome]       = useState("");
  const [formCpf, setFormCpf]         = useState("");
  const [formEmail, setFormEmail]     = useState("");
  const [formErr, setFormErr]         = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const load = useCallback(() => {
    setErr(""); setLoading(true);
    fetch(`${API_URL}/api/admin/collaborators`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) throw new Error("401");
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then(data => setCollabs(data))
      .catch(e => {
        if (e.message === "401") onUnauthorized();
        else setErr("Não foi possível carregar os colaboradores.");
      })
      .finally(() => setLoading(false));
  }, [token, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const formatCpf = (val) => {
    const d = val.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
    return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
  };

  const openAdd = () => {
    setEditing(null); setFormNome(""); setFormCpf(""); setFormEmail(""); setFormErr(""); setShowModal(true);
  };
  const openEdit = (c) => {
    setEditing(c); setFormNome(c.nome); setFormCpf(c.cpf); setFormEmail(c.email); setFormErr(""); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); setFormErr(""); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormErr(""); setFormLoading(true);
    const body = { nome: formNome.trim(), cpf: formCpf.trim(), email: formEmail.trim() };
    try {
      const url    = editing ? `${API_URL}/api/admin/collaborators/${editing.id}` : `${API_URL}/api/admin/collaborators`;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const data   = await res.json();
      if (!res.ok) { setFormErr(data.error || "Falha ao salvar"); return; }
      closeModal(); load();
    } catch { setFormErr("Erro de conexão"); } finally { setFormLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remover este colaborador permanentemente?")) return;
    setErr("");
    try {
      const res  = await fetch(`${API_URL}/api/admin/collaborators/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao remover"); return; }
      load();
    } catch { setErr("Erro de conexão"); }
  };

  return (
    <div className="admin-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>Informações dos Colaboradores</h2>
        <button className="btn-primary" onClick={openAdd} style={{ gap: 5 }}>
          <IconUsers /> Adicionar
        </button>
      </div>
      <p className="admin-lead">Cadastro manual de colaboradores com nome, CPF e e-mail. Apenas administradores podem adicionar, editar ou remover.</p>
      {err && <div className="profile-err admin-alert">{err}</div>}
      {loading ? (
        <div className="admin-muted">Carregando...</div>
      ) : collabs.length === 0 ? (
        <div className="admin-table-wrap" style={{ padding: "28px 20px", textAlign: "center" }}>
          <p className="admin-muted">Nenhum colaborador cadastrado ainda.</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CPF</th>
                <th className="collab-col-email">E-mail</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {collabs.map(c => (
                <tr key={c.id}>
                  <td className="admin-td-user">{c.nome}</td>
                  <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem", color: "var(--muted)" }}>{c.cpf}</td>
                  <td className="admin-muted collab-col-email">{c.email}</td>
                  <td className="admin-td-actions">
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button type="button" className="icon-btn" title="Editar" onClick={() => openEdit(c)}><IconEdit /></button>
                      <button type="button" className="icon-btn danger" title="Remover" onClick={() => handleDelete(c.id)}><IconTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>{editing ? "Editar Colaborador" : "Novo Colaborador"}</h2>
              <button type="button" className="icon-btn" onClick={closeModal} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleSubmit}>
              <label className="profile-form-label">Nome *</label>
              <input className="doc-input" type="text" value={formNome} onChange={e => setFormNome(e.target.value)} required placeholder="Nome completo" autoFocus />
              <label className="profile-form-label">CPF *</label>
              <input className="doc-input" type="text" value={formCpf} onChange={e => setFormCpf(formatCpf(e.target.value))} required placeholder="000.000.000-00" inputMode="numeric" />
              <label className="profile-form-label">E-mail *</label>
              <input className="doc-input" type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} required placeholder="email@exemplo.com" />
              {formErr && <div className="profile-err">{formErr}</div>}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel-lg" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={formLoading} style={{ padding: "6px 18px" }}>
                  {formLoading ? "Salvando..." : (editing ? "Salvar alterações" : "Adicionar")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AdminPage ─────────────────────────────────────────────────────────────────

export default function AdminPage({ token, currentUserId, onUnauthorized, onSelfDemoted, sectors, onSectorsChange, templates, saveTemplates }) {
  const [activeTab, setActiveTab] = useState("usuarios");

  return (
    <div className="admin-panel">
      <div className="admin-panel-inner">
        <h1 className="admin-title">Administração</h1>

        <div className="admin-tabs" style={{ maxWidth: "none", width: "fit-content" }}>
          <button className={`admin-tab ${activeTab === "usuarios"      ? "active" : ""}`} onClick={() => setActiveTab("usuarios")}>Usuários</button>
          <button className={`admin-tab ${activeTab === "setores"       ? "active" : ""}`} onClick={() => setActiveTab("setores")}>Setores</button>
          <button className={`admin-tab ${activeTab === "modelos"       ? "active" : ""}`} onClick={() => setActiveTab("modelos")}>Modelos</button>
          <button className={`admin-tab ${activeTab === "colaboradores" ? "active" : ""}`} onClick={() => setActiveTab("colaboradores")}>Colaboradores</button>
        </div>

        {activeTab === "usuarios"      && <UsersSection token={token} currentUserId={currentUserId} onUnauthorized={onUnauthorized} onSelfDemoted={onSelfDemoted} />}
        {activeTab === "setores"       && <SetoresSection token={token} sectors={sectors} onSectorsChange={onSectorsChange} />}
        {activeTab === "modelos"       && <ModelosSection templates={templates} onSave={saveTemplates} />}
        {activeTab === "colaboradores" && <ColaboradoresSection token={token} onUnauthorized={onUnauthorized} />}
      </div>
    </div>
  );
}
