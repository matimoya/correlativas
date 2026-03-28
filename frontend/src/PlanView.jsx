import { useState, useMemo } from "react";

export default function PlanView({ materias, approved, plan, setPlan }) {
  const [adding, setAdding] = useState(null); // semester key being added to

  const isApproved = (code) => code in approved;

  // All planned codes (across all semesters)
  const plannedCodes = useMemo(() => {
    const set = new Set();
    for (const codes of Object.values(plan)) {
      codes.forEach((c) => set.add(c));
    }
    return set;
  }, [plan]);

  // Figure out which subjects can be planned for a given semester
  // considering approved + subjects planned in earlier semesters
  function getAvailableForSemester(semKey) {
    const sortedKeys = Object.keys(plan).sort();
    const priorPlanned = new Set();
    for (const k of sortedKeys) {
      if (k >= semKey) break;
      plan[k].forEach((c) => priorPlanned.add(c));
    }

    const effectiveApproved = new Set([
      ...Object.keys(approved),
      ...priorPlanned,
    ]);

    return materias.filter((m) => {
      if (isApproved(m.code)) return false;
      if (plannedCodes.has(m.code)) return false;
      if (m.prerequisites.length === 0) return true;
      return m.prerequisites.every((p) => effectiveApproved.has(p));
    });
  }

  // Sorted semester keys
  const semesterKeys = Object.keys(plan).sort();

  function addSemester() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentSem = now.getMonth() < 6 ? 1 : 2;

    let nextYear = currentYear;
    let nextSem = currentSem;

    if (semesterKeys.length > 0) {
      const last = semesterKeys[semesterKeys.length - 1];
      const [y, s] = last.split("-").map(Number);
      if (s === 1) {
        nextYear = y;
        nextSem = 2;
      } else {
        nextYear = y + 1;
        nextSem = 1;
      }
    }

    const key = `${nextYear}-${nextSem}`;
    if (!plan[key]) {
      setPlan((prev) => ({ ...prev, [key]: [] }));
    }
  }

  function removeSemester(key) {
    setPlan((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function addToPlan(semKey, code) {
    setPlan((prev) => ({
      ...prev,
      [semKey]: [...(prev[semKey] || []), code],
    }));
    setAdding(null);
  }

  function removeFromPlan(semKey, code) {
    setPlan((prev) => ({
      ...prev,
      [semKey]: (prev[semKey] || []).filter((c) => c !== code),
    }));
  }

  function getName(code) {
    const m = materias.find((x) => x.code === code);
    return m ? m.name : code;
  }

  // Count total planned
  const totalPlanned = [...plannedCodes].length;
  const totalRemaining =
    materias.length - Object.keys(approved).length;

  return (
    <div className="plan-view">
      <div className="plan-header">
        <div className="plan-stats">
          <span className="plan-stat">
            <strong>{totalPlanned}</strong> planificadas
          </span>
          <span className="plan-stat-sep" />
          <span className="plan-stat">
            <strong>{totalRemaining - totalPlanned}</strong> sin planificar
          </span>
        </div>
        <button className="btn-add-sem" onClick={addSemester}>
          + Agregar cuatrimestre
        </button>
      </div>

      <div className="plan-grid">
        {semesterKeys.map((key) => {
          const [year, sem] = key.split("-");
          const codes = plan[key] || [];
          const availableForThis = getAvailableForSemester(key);

          return (
            <div className="plan-col" key={key}>
              <div className="plan-col-header">
                <div className="plan-col-title">
                  <span className="plan-year">{year}</span>
                  <span className="plan-sem">
                    {sem === "1" ? "1er Cuat." : "2do Cuat."}
                  </span>
                </div>
                <button
                  className="plan-col-remove"
                  onClick={() => removeSemester(key)}
                  title="Eliminar cuatrimestre"
                >
                  &times;
                </button>
              </div>

              <div className="plan-col-count">
                {codes.length} materia{codes.length !== 1 ? "s" : ""}
              </div>

              <div className="plan-subjects">
                {codes.map((code) => (
                  <div className="plan-card" key={code}>
                    <div className="plan-card-top">
                      <span className="plan-card-code">{code}</span>
                      <button
                        className="plan-card-remove"
                        onClick={() => removeFromPlan(key, code)}
                      >
                        &times;
                      </button>
                    </div>
                    <span className="plan-card-name">{getName(code)}</span>
                  </div>
                ))}
              </div>

              {adding === key ? (
                <div className="plan-dropdown">
                  <div className="plan-dropdown-header">
                    <span>Seleccionar materia</span>
                    <button onClick={() => setAdding(null)}>&times;</button>
                  </div>
                  <div className="plan-dropdown-list">
                    {availableForThis.length === 0 ? (
                      <div className="plan-dropdown-empty">
                        No hay materias disponibles
                      </div>
                    ) : (
                      availableForThis.map((m) => (
                        <button
                          key={m.code}
                          className="plan-dropdown-item"
                          onClick={() => addToPlan(key, m.code)}
                        >
                          <span className="plan-dropdown-code">{m.code}</span>
                          <span>{m.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <button
                  className="plan-add-btn"
                  onClick={() => setAdding(key)}
                >
                  + Agregar materia
                </button>
              )}
            </div>
          );
        })}

        {semesterKeys.length === 0 && (
          <div className="plan-empty">
            <p>No hay cuatrimestres planificados.</p>
            <p>Hace click en "Agregar cuatrimestre" para empezar a planificar.</p>
          </div>
        )}
      </div>
    </div>
  );
}
