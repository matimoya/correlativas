import { useState, useEffect, useRef, useCallback } from "react";
import PlanView from "./PlanView.jsx";
import EnrolledView from "./EnrolledView.jsx";
import "./app.css";

const YEAR_LABELS = {
  1: "er año",
  2: "do año",
  3: "er año",
  4: "to año",
  5: "to año",
  0: "Transversales",
};

const YEAR_ORDER = [1, 2, 3, 4, 5, 0];

const ELECTIVE_OPTIONS = {
  "3672": [
    { code: "3677", name: "Lenguaje Orientado a Negocios" },
  ],
  "3673": [
    { code: "3678", name: "Tecnologias en Seguridad" },
    { code: "3599", name: "Redes Moviles e IoT" },
  ],
  "3674": [
    { code: "3679", name: "Vision Artificial" },
  ],
};

const ELECTIVE_SLOTS = new Set(Object.keys(ELECTIVE_OPTIONS));

// Titulo intermedio: all year 1-3 + Ingles I & II
function getIntermediateRequired(materias) {
  return materias.filter(
    (m) =>
      (m.year >= 1 && m.year <= 3) ||
      m.code === "901" ||
      m.code === "902"
  );
}

function App() {
  const [materias, setMaterias] = useState([]);
  const [approved, setApproved] = useState({});
  const [electives, setElectives] = useState({});
  const [positions, setPositions] = useState({});
  const [plan, setPlan] = useState({});
  const [enrolled, setEnrolled] = useState([]);
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState({}); // codes of selected available subjects (code -> true)
  const [view, setView] = useState("correlativas");
  const gridRef = useRef(null);
  const nodeRefs = useRef({});

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}materias.json`)
      .then((r) => r.json())
      .then((m) => {
        setMaterias(m);
        try {
          const saved = JSON.parse(localStorage.getItem("correlativas-progress") || "{}");
          setApproved(saved.approved || {});
          setElectives(saved.electives || {});
          setPlan(saved.plan || {});
          setEnrolled(saved.enrolled || []);
        } catch {
          // no saved progress
        }
      });
  }, []);

  const isApproved = useCallback((code) => code in approved, [approved]);

  const enrolledCodes = new Set(enrolled.map((e) => e.code));

  const available = new Set();
  for (const m of materias) {
    if (isApproved(m.code)) continue;
    if (
      m.prerequisites.length === 0 ||
      m.prerequisites.every((p) => isApproved(p))
    ) {
      available.add(m.code);
    }
  }

  const recalcPositions = useCallback(() => {
    if (!gridRef.current) return;
    const gridRect = gridRef.current.getBoundingClientRect();
    const newPos = {};
    for (const code of Object.keys(nodeRefs.current)) {
      const el = nodeRefs.current[code];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      newPos[code] = {
        left: r.left - gridRect.left,
        right: r.right - gridRect.left,
        top: r.top - gridRect.top,
        bottom: r.bottom - gridRect.top,
        cy: r.top - gridRect.top + r.height / 2,
      };
    }
    setPositions(newPos);
  }, []);

  useEffect(() => {
    if (materias.length === 0) return;
    const timer = setTimeout(recalcPositions, 50);
    window.addEventListener("resize", recalcPositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", recalcPositions);
    };
  }, [materias, approved, recalcPositions]);

  const grouped = {};
  for (const m of materias) {
    const key = `${m.year}-${m.semester}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  }

  function toggleMateria(code) {
    if (isApproved(code)) {
      const currentGrade = approved[code];
      const input = prompt(
        "Cambiar nota (dejar vacio para sin nota, escribir 'quitar' para desaprobar):",
        currentGrade != null ? String(currentGrade) : ""
      );
      if (input === null) return;
      if (input.trim().toLowerCase() === "quitar") {
        setApproved((prev) => {
          const next = { ...prev };
          const queue = [code];
          const toRemove = new Set();
          while (queue.length > 0) {
            const current = queue.shift();
            toRemove.add(current);
            for (const m of materias) {
              if (
                m.prerequisites.includes(current) &&
                m.code in next &&
                !toRemove.has(m.code)
              ) {
                queue.push(m.code);
              }
            }
          }
          for (const c of toRemove) delete next[c];
          return next;
        });
        return;
      }
      const grade = input.trim() === "" ? null : parseInt(input, 10);
      if (grade !== null && (isNaN(grade) || grade < 1 || grade > 10)) return;
      setApproved((prev) => ({ ...prev, [code]: grade }));
    } else if (available.has(code)) {
      // Toggle selected state
      setSelected((prev) => {
        const next = { ...prev };
        if (next[code]) {
          delete next[code];
        } else {
          next[code] = true;
        }
        return next;
      });
    }
  }

  function gradeSelected(code, value) {
    const grade = value.trim() === "" ? null : parseInt(value, 10);
    if (grade !== null && (isNaN(grade) || grade < 1 || grade > 10)) return;
    setApproved((prev) => ({ ...prev, [code]: grade }));
    setSelected((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
  }

  function sendSelectedToPlan() {
    const codes = Object.keys(selected);
    if (codes.length === 0) return;

    // Find next semester key
    const semKeys = Object.keys(plan).sort();
    let nextYear, nextSem;
    const now = new Date();
    if (semKeys.length > 0) {
      const last = semKeys[semKeys.length - 1];
      const [y, s] = last.split("-").map(Number);
      if (s === 1) { nextYear = y; nextSem = 2; }
      else { nextYear = y + 1; nextSem = 1; }
    } else {
      nextYear = now.getFullYear();
      nextSem = now.getMonth() < 6 ? 1 : 2;
    }

    const key = `${nextYear}-${nextSem}`;
    setPlan((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), ...codes],
    }));
    setSelected({});
    setView("plan");
  }

  function changeElective(slotCode, chosenCode) {
    setElectives((prev) => ({ ...prev, [slotCode]: chosenCode }));
  }

  function saveProgress() {
    localStorage.setItem(
      "correlativas-progress",
      JSON.stringify({ approved, electives, plan, enrolled })
    );
    showToast("Progreso guardado correctamente");
  }

  function resetProgress() {
    if (!confirm("Seguro que queres reiniciar todo el progreso?")) return;
    setApproved({});
    setElectives({});
    setPlan({});
    setEnrolled([]);
    setSelected({});
  }

  function exportProgress() {
    const data = JSON.stringify({ approved, electives, plan, enrolled }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "correlativas-progreso.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Progreso exportado");
  }

  const [showDropZone, setShowDropZone] = useState(false);

  function loadProgressFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        setApproved(data.approved || {});
        setElectives(data.electives || {});
        setPlan(data.plan || {});
        setEnrolled(data.enrolled || []);
        localStorage.setItem("correlativas-progress", JSON.stringify(data));
        showToast("Progreso importado correctamente");
      } catch {
        showToast("Error al leer el archivo");
      }
    };
    reader.readAsText(file);
  }

  function importProgress() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) loadProgressFile(file);
    };
    input.click();
  }

  useEffect(() => {
    let dragCounter = 0;
    function handleDragEnter(e) {
      e.preventDefault();
      dragCounter++;
      if (dragCounter === 1) setShowDropZone(true);
    }
    function handleDragOver(e) {
      e.preventDefault();
    }
    function handleDragLeave(e) {
      e.preventDefault();
      dragCounter--;
      if (dragCounter === 0) setShowDropZone(false);
    }
    function handleDrop(e) {
      e.preventDefault();
      dragCounter = 0;
      setShowDropZone(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".json")) loadProgressFile(file);
      else if (file) showToast("Solo se aceptan archivos .json");
    }
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const [toast, setToast] = useState(null);
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // Stats
  const approvedCount = Object.keys(approved).length;
  const grades = Object.values(approved).filter((g) => g != null);
  const avg =
    grades.length > 0
      ? (grades.reduce((a, b) => a + b, 0) / grades.length).toFixed(1)
      : "-";
  const pct =
    materias.length > 0
      ? Math.round((approvedCount / materias.length) * 100)
      : 0;

  // Title progress
  const intermediateReq = getIntermediateRequired(materias);
  const intermediateApproved = intermediateReq.filter((m) =>
    isApproved(m.code)
  ).length;
  const intermediateTotal = intermediateReq.length;
  const intermediatePct =
    intermediateTotal > 0
      ? Math.round((intermediateApproved / intermediateTotal) * 100)
      : 0;
  const intermediateComplete = intermediateApproved === intermediateTotal;

  const finalTotal = materias.length;
  const finalPct = pct;
  const finalComplete = approvedCount === finalTotal;

  // Hover relations
  const hoveredPrereqs = new Set();
  const hoveredUnlocks = new Set();
  if (hovered) {
    const m = materias.find((x) => x.code === hovered);
    if (m) {
      m.prerequisites.forEach((p) => hoveredPrereqs.add(p));
      for (const other of materias) {
        if (other.prerequisites.includes(hovered)) {
          hoveredUnlocks.add(other.code);
        }
      }
    }
  }
  const hoveredRelated = new Set([...hoveredPrereqs, ...hoveredUnlocks]);

  // Preview: what would change if we approved all selected + enrolled subjects
  const selectedCodes = Object.keys(selected);
  const previewCodes = [...selectedCodes, ...enrolled.filter((e) => !isApproved(e.code) && !selected[e.code]).map((e) => e.code)];
  let previewData = null;
  if (previewCodes.length > 0) {
    const simApproved = { ...approved };
    for (const c of previewCodes) simApproved[c] = null;
    const simIsApproved = (c) => c in simApproved;

    // New subjects that would become available
    const newAvailable = [];
    for (const m of materias) {
      if (simIsApproved(m.code)) continue;
      if (available.has(m.code)) continue;
      if (
        m.prerequisites.length > 0 &&
        m.prerequisites.every((p) => simIsApproved(p))
      ) {
        newAvailable.push(m);
      }
    }

    const simCount = Object.keys(simApproved).length;
    const simPct = materias.length > 0 ? Math.round((simCount / materias.length) * 100) : 0;
    const simIntApproved = intermediateReq.filter((m) => simIsApproved(m.code)).length;
    const simIntPct = intermediateTotal > 0 ? Math.round((simIntApproved / intermediateTotal) * 100) : 0;

    previewData = {
      selectedCodes: previewCodes,
      newAvailable,
      approvedCount: simCount,
      approvedPct: simPct,
      intermediatePct: simIntPct,
      intermediateApproved: simIntApproved,
    };
  }

  function getName(code) {
    const m = materias.find((x) => x.code === code);
    return m ? m.name : code;
  }

  // Connectors
  const connectors = [];
  for (const m of materias) {
    for (const prereq of m.prerequisites) {
      const from = positions[prereq];
      const to = positions[m.code];
      if (!from || !to) continue;

      const x1 = from.right + 2;
      const y1 = from.cy;
      const x2 = to.left - 2;
      const y2 = to.cy;

      const dx = Math.abs(x2 - x1);
      const cpOffset = Math.max(dx * 0.5, 40);

      const bothApproved = isApproved(prereq) && isApproved(m.code);
      const oneApproved = isApproved(prereq) && available.has(m.code);
      const isHighlighted =
        hovered && (hovered === prereq || hovered === m.code);

      let stroke, opacity, width;
      if (isHighlighted) {
        stroke = bothApproved
          ? "#4ade80"
          : oneApproved
            ? "#fbbf24"
            : "#64748b";
        opacity = 0.9;
        width = 2.5;
      } else if (bothApproved) {
        stroke = "#22c55e";
        opacity = 0.35;
        width = 1.5;
      } else if (oneApproved) {
        stroke = "#f59e0b";
        opacity = 0.3;
        width = 1.5;
      } else {
        stroke = "#334155";
        opacity = 0.15;
        width = 1;
      }

      connectors.push(
        <path
          key={`${prereq}-${m.code}`}
          d={`M ${x1},${y1} C ${x1 + cpOffset},${y1} ${x2 - cpOffset},${y2} ${x2},${y2}`}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          opacity={opacity}
          style={{ transition: "all 0.3s ease" }}
        />
      );
    }
  }

  const gridW = gridRef.current?.scrollWidth || 0;
  const gridH = gridRef.current?.scrollHeight || 0;

  // Build hover tooltip data
  let tooltipData = null;
  if (hovered) {
    const m = materias.find((x) => x.code === hovered);
    if (m) {
      tooltipData = {
        code: m.code,
        name: ELECTIVE_SLOTS.has(m.code) && electives[m.code]
          ? ELECTIVE_OPTIONS[m.code].find((o) => o.code === electives[m.code])?.name || m.name
          : m.name,
        prereqs: m.prerequisites.map((c) => getName(c)),
        unlocks: [...hoveredUnlocks].map((c) => getName(c)),
        status: isApproved(m.code)
          ? "Aprobada"
          : available.has(m.code)
            ? "Habilitada"
            : "Bloqueada",
        grade: approved[m.code],
      };
    }
  }

  return (
    <div className="app">
      <header>
        <div className="header-left">
          <h1>Ingenieria en Informatica</h1>
          <p className="subtitle">
            Universidad Nacional de La Matanza &middot; Plan 2023
          </p>
        </div>

        <div className="header-center">
          <div className="title-progress">
            <div className={`title-card ${previewData ? "has-preview" : ""}`}>
              <div className="title-card-header">
                <span className={`title-badge ${intermediateComplete ? "complete" : ""}`}>
                  {intermediateComplete ? "✓" : `${intermediateApproved}/${intermediateTotal}`}
                </span>
                <span className="title-name">Tec. Univ. en Des. de Software</span>
              </div>
              <div className="mini-bar">
                <div
                  className={`mini-fill ${intermediateComplete ? "complete" : ""}`}
                  style={{ width: `${intermediatePct}%` }}
                />
                {previewData && (
                  <div
                    className="mini-fill preview"
                    style={{ width: `${previewData.intermediatePct}%` }}
                  />
                )}
              </div>
              <span className="title-pct">
                {intermediatePct}%
                {previewData && previewData.intermediatePct !== intermediatePct && (
                  <span className="title-pct-preview"> → {previewData.intermediatePct}%</span>
                )}
              </span>
            </div>
            <div className={`title-card ${previewData ? "has-preview" : ""}`}>
              <div className="title-card-header">
                <span className={`title-badge ${finalComplete ? "complete" : ""}`}>
                  {finalComplete ? "✓" : `${approvedCount}/${finalTotal}`}
                </span>
                <span className="title-name">Ingeniero en Informatica</span>
              </div>
              <div className="mini-bar">
                <div
                  className={`mini-fill ${finalComplete ? "complete" : ""}`}
                  style={{ width: `${finalPct}%` }}
                />
                {previewData && (
                  <div
                    className="mini-fill preview"
                    style={{ width: `${previewData.approvedPct}%` }}
                  />
                )}
              </div>
              <span className="title-pct">
                {finalPct}%
                {previewData && previewData.approvedPct !== finalPct && (
                  <span className="title-pct-preview"> → {previewData.approvedPct}%</span>
                )}
              </span>
            </div>
          </div>

          <div className="stats-row">
            <div className="stat">
              <span className="stat-num green">
                {approvedCount}
                {previewData && (
                  <span className="stat-preview"> → {previewData.approvedCount}</span>
                )}
              </span>
              <span className="stat-lbl">aprobadas</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num blue">{avg}</span>
              <span className="stat-lbl">promedio</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num amber">{available.size}</span>
              <span className="stat-lbl">habilitadas</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num dim">
                {materias.length - approvedCount - available.size}
              </span>
              <span className="stat-lbl">bloqueadas</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <div className="toolbar">
            <button className="btn-save" onClick={saveProgress}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Guardar
            </button>
            <button className="btn-save" onClick={exportProgress}>
              Exportar
            </button>
            <button className="btn-save" onClick={importProgress}>
              Importar
            </button>
            <button className="btn-reset" onClick={resetProgress}>
              Reiniciar
            </button>
          </div>
          <div className="legend">
            <span className="legend-item">
              <span className="dot green" /> Aprobada
            </span>
            <span className="legend-item">
              <span className="dot blue" /> Cursando
            </span>
            <span className="legend-item">
              <span className="dot amber" /> Habilitada
            </span>
            <span className="legend-item">
              <span className="dot gray" /> Bloqueada
            </span>
          </div>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab ${view === "correlativas" ? "active" : ""}`}
          onClick={() => setView("correlativas")}
        >
          Correlativas
        </button>
        <button
          className={`tab ${view === "plan" ? "active" : ""}`}
          onClick={() => setView("plan")}
        >
          Planificador
        </button>
        <button
          className={`tab ${view === "cursando" ? "active" : ""}`}
          onClick={() => setView("cursando")}
        >
          Cursando
        </button>
      </div>

      {view === "cursando" ? (
        <EnrolledView
          materias={materias}
          approved={approved}
          enrolled={enrolled}
          setEnrolled={setEnrolled}
        />
      ) : view === "plan" ? (
        <PlanView
          materias={materias}
          approved={approved}
          plan={plan}
          setPlan={setPlan}
        />
      ) : (
      <div className="canvas-wrapper" onClick={() => setSelected({})}>
        <div className="grid" ref={gridRef}>
          <svg className="connectors" width={gridW} height={gridH}>
            {connectors}
          </svg>

          {YEAR_ORDER.map((year, yi) => {
            const semesters = [1, 2].filter((s) => grouped[`${year}-${s}`]);
            return (
              <div className={`year-group${yi < YEAR_ORDER.length - 1 ? " has-divider" : ""}`} key={year}>
                <div className="year-header">
                  <span className="year-num">
                    {year === 0 ? "" : `${year}`}
                  </span>
                  <span className="year-text">
                    {year === 0 ? YEAR_LABELS[0] : `${YEAR_LABELS[year]}`}
                  </span>
                </div>
                <div className="year-semesters">
                  {semesters.map((sem) => {
                    const subjects = grouped[`${year}-${sem}`] || [];
                    return (
                      <div className="year-col" key={`${year}-${sem}`}>
                        {year !== 0 && (
                          <div className="sem-subtitle">
                            {sem === 1 ? "1er Cuatrimestre" : "2do Cuatrimestre"}
                          </div>
                        )}
                        <div className="semester-group">
                          {subjects.map((m) => {
                          const grade = approved[m.code];
                          const isHov = hovered === m.code;
                          const isRel = hoveredRelated.has(m.code);
                          const isPrereqOf = hoveredPrereqs.has(m.code);
                          const isUnlockedBy = hoveredUnlocks.has(m.code);
                          let cls = "materia";
                          const isSelected = m.code in selected;
                          const isEnrolled = enrolledCodes.has(m.code);
                          if (isApproved(m.code)) {
                            cls += " approved";
                            if (grade != null && grade < 7) cls += " low-grade";
                          }
                          else if (isSelected) cls += " selected";
                          else if (isEnrolled && available.has(m.code)) cls += " enrolled";
                          else if (available.has(m.code)) cls += " available";
                          else cls += " locked";
                          if (isHov) cls += " hovered";
                          if (isRel && hovered) cls += " related";
                          if (isPrereqOf && hovered) cls += " is-prereq";
                          if (isUnlockedBy && hovered) cls += " is-unlock";
                          if (previewData && previewData.newAvailable.some((x) => x.code === m.code)) cls += " preview-unlock";

                          const isElective = ELECTIVE_SLOTS.has(m.code);
                          const chosenElective = electives[m.code];
                          const electiveOpts = ELECTIVE_OPTIONS[m.code];
                          const displayName =
                            isElective && chosenElective
                              ? electiveOpts?.find(
                                  (o) => o.code === chosenElective
                                )?.name || m.name
                              : m.name;

                          return (
                            <div key={m.code} className="materia-wrapper">
                              <button
                                className={cls}
                                ref={(el) =>
                                  (nodeRefs.current[m.code] = el)
                                }
                                onClick={(e) => { e.stopPropagation(); toggleMateria(m.code); }}
                                onMouseEnter={() => setHovered(m.code)}
                                onMouseLeave={() => setHovered(null)}
                              >
                                <span className="materia-top">
                                  <span className="code">{m.code}</span>
                                  {grade != null && (
                                    <span className="grade">{grade}</span>
                                  )}
                                  {isSelected && (
                                    <input
                                      className="grade-input"
                                      type="number"
                                      min="1"
                                      max="10"
                                      placeholder="Nota"
                                      autoFocus
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          gradeSelected(m.code, e.target.value);
                                        }
                                        if (e.key === "Escape") {
                                          setSelected((prev) => {
                                            const next = { ...prev };
                                            delete next[m.code];
                                            return next;
                                          });
                                        }
                                      }}
                                      onBlur={(e) => {
                                        if (e.target.value.trim() !== "") {
                                          gradeSelected(m.code, e.target.value);
                                        }
                                      }}
                                    />
                                  )}
                                </span>
                                <span className="name">{displayName}</span>
                                {isElective && (
                                  <select
                                    className="elective-select"
                                    value={chosenElective || ""}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      changeElective(
                                        m.code,
                                        e.target.value || ""
                                      );
                                    }}
                                  >
                                    <option value="">Elegir electiva...</option>
                                    {electiveOpts.map((opt) => (
                                      <option key={opt.code} value={opt.code}>
                                        {opt.name}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </button>
                            </div>
                          );
                        })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {previewData && (
          <div className="preview-bar" onClick={(e) => e.stopPropagation()}>
            <div className="preview-bar-main">
              <div className="preview-bar-info">
                <span className="preview-name">
                  {previewCodes.length} materia{previewCodes.length !== 1 ? "s" : ""} en progreso
                  {selectedCodes.length > 0 && enrolled.filter((e) => !isApproved(e.code) && !selected[e.code]).length > 0
                    ? ` (${selectedCodes.length} seleccionada${selectedCodes.length !== 1 ? "s" : ""} + ${enrolled.filter((e) => !isApproved(e.code) && !selected[e.code]).length} cursando)`
                    : selectedCodes.length > 0
                      ? ` (${selectedCodes.length} seleccionada${selectedCodes.length !== 1 ? "s" : ""})`
                      : ` (${enrolled.filter((e) => !isApproved(e.code)).length} cursando)`
                  }
                </span>
                {selectedCodes.length > 0 && <span className="preview-hint">Ingresá la nota en cada tarjeta para aprobar</span>}
              </div>
              <div className="preview-bar-actions">
                <button className="btn-to-plan" onClick={sendSelectedToPlan}>
                  Enviar al planificador
                </button>
                <button className="preview-close" onClick={() => setSelected({})}>&times;</button>
              </div>
            </div>
            <div className="preview-bar-details">
              <div className="preview-bar-stats">
                <div className="preview-stat-inline">
                  <span className="preview-stat-lbl">Aprobadas:</span>
                  <span className="preview-stat-val">{previewData.approvedCount}/{materias.length}</span>
                  <div className="mini-bar"><div className="mini-fill" style={{ width: `${previewData.approvedPct}%` }} /></div>
                  <span className="preview-stat-pct">{previewData.approvedPct}%</span>
                </div>
                <div className="preview-stat-inline">
                  <span className="preview-stat-lbl">Titulo intermedio:</span>
                  <span className="preview-stat-val">{previewData.intermediateApproved}/{intermediateTotal}</span>
                  <div className="mini-bar"><div className="mini-fill" style={{ width: `${previewData.intermediatePct}%` }} /></div>
                  <span className="preview-stat-pct">{previewData.intermediatePct}%</span>
                </div>
              </div>
              <div className="preview-bar-unlocks">
                {previewData.newAvailable.length > 0 ? (
                  <>
                    <span className="preview-bar-unlocks-label">Habilita:</span>
                    {previewData.newAvailable.map((m) => (
                      <span key={m.code} className="preview-bar-tag">{m.name}</span>
                    ))}
                  </>
                ) : (
                  <span className="preview-empty">No habilita nuevas materias por sí sola</span>
                )}
              </div>
            </div>
          </div>
        )}

        {tooltipData && (
          <div className="tooltip">
            <div className="tooltip-header">
              <span className="tooltip-code">{tooltipData.code}</span>
              <span className={`tooltip-status ${tooltipData.status === "Aprobada" ? "green" : tooltipData.status === "Habilitada" ? "amber" : "dim"}`}>
                {tooltipData.status}
                {tooltipData.grade != null && ` (${tooltipData.grade})`}
              </span>
            </div>
            <div className="tooltip-name">{tooltipData.name}</div>
            {tooltipData.prereqs.length > 0 && (
              <div className="tooltip-section">
                <span className="tooltip-label">Requiere:</span>
                {tooltipData.prereqs.map((n, i) => (
                  <span key={i} className="tooltip-tag prereq">{n}</span>
                ))}
              </div>
            )}
            {tooltipData.unlocks.length > 0 && (
              <div className="tooltip-section">
                <span className="tooltip-label">Habilita:</span>
                {tooltipData.unlocks.map((n, i) => (
                  <span key={i} className="tooltip-tag unlock">{n}</span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {toast && (
        <div className="toast">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          {toast}
        </div>
      )}

      {showDropZone && (
        <div className="drop-overlay">
          <div className="drop-box">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Solta el archivo .json para importar tu progreso</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
