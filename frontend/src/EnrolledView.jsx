import { useState, useRef, useCallback } from "react";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const DAY_TO_GCAL = {
  Lunes: "MO",
  Martes: "TU",
  "Miércoles": "WE",
  Jueves: "TH",
  Viernes: "FR",
  "Sábado": "SA",
};

function firstWeekday(startDate, dayName) {
  const target = DAYS.indexOf(dayName);
  if (target === -1) return startDate;
  const jsDay = target + 1;
  const d = new Date(startDate);
  while (d.getDay() !== jsDay) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function toGCalDateStr(date, timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function buildGCalUrl(subjectName, block, semesterStart, semesterEnd) {
  const firstDay = firstWeekday(semesterStart, block.day);
  const startStr = toGCalDateStr(firstDay, block.start);
  const endStr = toGCalDateStr(firstDay, block.end);
  const endDate = new Date(semesterEnd);
  endDate.setDate(endDate.getDate() + 1);
  const untilStr = endDate.toISOString().replace(/[-:]/g, "").split("T")[0];
  const rrule = `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}T235959Z;BYDAY=${DAY_TO_GCAL[block.day]}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: subjectName,
    dates: `${startStr}/${endStr}`,
    recur: rrule,
    location: block.classroom || "",
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function minutesToTime(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Snap to nearest 30-minute slot
function snapToSlot(min) {
  return Math.round(min / 30) * 30;
}

const COLORS = [
  { bg: "rgba(56, 139, 253, 0.22)", border: "rgba(56, 139, 253, 0.6)", text: "#58a6ff" },
  { bg: "rgba(63, 185, 80, 0.22)", border: "rgba(63, 185, 80, 0.6)", text: "#3fb950" },
  { bg: "rgba(210, 153, 34, 0.22)", border: "rgba(210, 153, 34, 0.6)", text: "#d29922" },
  { bg: "rgba(188, 76, 196, 0.22)", border: "rgba(188, 76, 196, 0.6)", text: "#bc4cc4" },
  { bg: "rgba(219, 97, 62, 0.22)", border: "rgba(219, 97, 62, 0.6)", text: "#db613e" },
  { bg: "rgba(56, 203, 203, 0.22)", border: "rgba(56, 203, 203, 0.6)", text: "#38cbcb" },
  { bg: "rgba(231, 76, 60, 0.22)", border: "rgba(231, 76, 60, 0.6)", text: "#e74c3c" },
  { bg: "rgba(142, 68, 173, 0.22)", border: "rgba(142, 68, 173, 0.6)", text: "#8e44ad" },
];

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 23;
const GRID_TOTAL_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;

export default function EnrolledView({ materias, approved, enrolled, setEnrolled }) {
  const [adding, setAdding] = useState(false);
  const [editingCode, setEditingCode] = useState(null);
  const [dragState, setDragState] = useState(null); // { day, startMin, currentMin }
  const [hoverSlot, setHoverSlot] = useState(null); // { day, min }
  const dayBodyRefs = useRef({});

  const now = new Date();
  const currentSem = now.getMonth() < 6 ? 1 : 2;
  const defaultStart = currentSem === 1
    ? `${now.getFullYear()}-03-10`
    : `${now.getFullYear()}-08-11`;
  const defaultEnd = currentSem === 1
    ? `${now.getFullYear()}-07-05`
    : `${now.getFullYear()}-11-29`;
  const [semStart, setSemStart] = useState(defaultStart);
  const [semEnd, setSemEnd] = useState(defaultEnd);

  const isApproved = (code) => code in approved;

  const available = materias.filter((m) => {
    if (isApproved(m.code)) return false;
    if (enrolled.some((e) => e.code === m.code)) return false;
    if (m.prerequisites.length === 0) return true;
    return m.prerequisites.every((p) => isApproved(p));
  });

  function getName(code) {
    const m = materias.find((x) => x.code === code);
    return m ? m.name : code;
  }

  function addSubject(code) {
    setEnrolled((prev) => [...prev, { code, schedule: [] }]);
    setAdding(false);
    setEditingCode(code);
  }

  function removeSubject(code) {
    setEnrolled((prev) => prev.filter((e) => e.code !== code));
    if (editingCode === code) setEditingCode(null);
  }

  function addBlock(code, day, startMin, endMin) {
    const block = {
      day,
      start: minutesToTime(startMin),
      end: minutesToTime(endMin),
      classroom: "",
    };
    setEnrolled((prev) =>
      prev.map((e) =>
        e.code === code ? { ...e, schedule: [...e.schedule, block] } : e
      )
    );
  }

  function removeBlock(code, idx) {
    setEnrolled((prev) =>
      prev.map((e) =>
        e.code === code
          ? { ...e, schedule: e.schedule.filter((_, i) => i !== idx) }
          : e
      )
    );
  }

  function updateBlockClassroom(code, idx, classroom) {
    setEnrolled((prev) =>
      prev.map((e) =>
        e.code === code
          ? {
              ...e,
              schedule: e.schedule.map((b, i) =>
                i === idx ? { ...b, classroom } : b
              ),
            }
          : e
      )
    );
  }

  function exportAllICS() {
    let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Correlativas//UNLaM//ES\n`;
    const endDate = new Date(semEnd);
    endDate.setDate(endDate.getDate() + 1);
    const untilStr = endDate.toISOString().replace(/[-:]/g, "").split("T")[0];

    for (const subj of enrolled) {
      const name = getName(subj.code);
      for (const block of subj.schedule) {
        const firstDay = firstWeekday(semStart, block.day);
        const startStr = toGCalDateStr(firstDay, block.start);
        const endStr = toGCalDateStr(firstDay, block.end);
        ics += `BEGIN:VEVENT\nDTSTART:${startStr}\nDTEND:${endStr}\n`;
        ics += `RRULE:FREQ=WEEKLY;UNTIL=${untilStr}T235959Z;BYDAY=${DAY_TO_GCAL[block.day]}\n`;
        ics += `SUMMARY:${name}\n`;
        if (block.classroom) ics += `LOCATION:${block.classroom}\n`;
        ics += `END:VEVENT\n`;
      }
    }
    ics += `END:VCALENDAR`;

    const blob = new Blob([ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cursando.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  // Build all blocks for timetable
  const allBlocks = [];
  for (const subj of enrolled) {
    for (const block of subj.schedule) {
      allBlocks.push({
        code: subj.code,
        name: getName(subj.code),
        day: block.day,
        start: block.start,
        end: block.end,
        startMin: timeToMinutes(block.start),
        endMin: timeToMinutes(block.end),
        classroom: block.classroom,
      });
    }
  }

  // Color map
  const colorMap = {};
  let colorIdx = 0;
  for (const subj of enrolled) {
    if (!(subj.code in colorMap)) {
      colorMap[subj.code] = COLORS[colorIdx % COLORS.length];
      colorIdx++;
    }
  }

  const hourLabels = [];
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    hourLabels.push(h);
  }

  // Mouse handlers for drag-to-create on timetable
  const getMinutesFromY = useCallback((day, clientY) => {
    const el = dayBodyRefs.current[day];
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    const raw = GRID_START_HOUR * 60 + ratio * GRID_TOTAL_MINUTES;
    return snapToSlot(Math.max(GRID_START_HOUR * 60, Math.min(GRID_END_HOUR * 60, raw)));
  }, []);

  function handleMouseDown(day, e) {
    if (!editingCode) return;
    const min = getMinutesFromY(day, e.clientY);
    setDragState({ day, startMin: min, currentMin: min });
  }

  function handleMouseMove(day, e) {
    if (dragState && dragState.day === day) {
      const min = getMinutesFromY(day, e.clientY);
      setDragState((prev) => ({ ...prev, currentMin: min }));
    } else if (editingCode && !dragState) {
      const min = getMinutesFromY(day, e.clientY);
      setHoverSlot({ day, min });
    }
  }

  function handleMouseUp() {
    if (dragState && editingCode) {
      const start = Math.min(dragState.startMin, dragState.currentMin);
      const end = Math.max(dragState.startMin, dragState.currentMin);
      // Minimum 30 min block
      const finalEnd = end === start ? start + 120 : end;
      addBlock(editingCode, dragState.day, start, Math.min(finalEnd, GRID_END_HOUR * 60));
    }
    setDragState(null);
  }

  function handleMouseLeave() {
    setHoverSlot(null);
  }

  // Drag preview
  let dragPreview = null;
  if (dragState) {
    const start = Math.min(dragState.startMin, dragState.currentMin);
    const end = Math.max(dragState.startMin, dragState.currentMin);
    const finalEnd = end === start ? start + 120 : end;
    const top = ((start - GRID_START_HOUR * 60) / GRID_TOTAL_MINUTES) * 100;
    const height = ((Math.min(finalEnd, GRID_END_HOUR * 60) - start) / GRID_TOTAL_MINUTES) * 100;
    const color = editingCode ? (colorMap[editingCode] || COLORS[0]) : COLORS[0];
    dragPreview = {
      day: dragState.day,
      top,
      height,
      color,
      startTime: minutesToTime(start),
      endTime: minutesToTime(Math.min(finalEnd, GRID_END_HOUR * 60)),
    };
  }

  const editingName = editingCode ? getName(editingCode) : null;
  const editingColor = editingCode ? (colorMap[editingCode] || COLORS[0]) : null;

  return (
    <div className="enrolled-view">
      <div className="enrolled-header">
        <div className="enrolled-header-left">
          <span className="enrolled-count">
            <strong>{enrolled.length}</strong> materia{enrolled.length !== 1 ? "s" : ""} inscripta{enrolled.length !== 1 ? "s" : ""}
          </span>
          <div className="enrolled-sem-dates">
            <label>
              Inicio cuat:
              <input type="date" value={semStart} onChange={(e) => setSemStart(e.target.value)} />
            </label>
            <label>
              Fin cuat:
              <input type="date" value={semEnd} onChange={(e) => setSemEnd(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="enrolled-header-right">
          {enrolled.length > 0 && enrolled.some((e) => e.schedule.length > 0) && (
            <>
              <button className="btn-export-ics" onClick={exportAllICS}>
                Descargar .ics
              </button>
              <button
                className="btn-export-gcal"
                onClick={() => {
                  for (const subj of enrolled) {
                    const name = getName(subj.code);
                    for (const block of subj.schedule) {
                      const url = buildGCalUrl(name, block, semStart, semEnd);
                      window.open(url, "_blank");
                    }
                  }
                }}
              >
                Agregar a Google Calendar
              </button>
            </>
          )}
          <button className="btn-add-enrolled" onClick={() => setAdding(!adding)}>
            + Agregar materia
          </button>
        </div>
      </div>

      {adding && (
        <div className="enrolled-dropdown">
          <div className="enrolled-dropdown-header">
            <span>Seleccionar materia habilitada</span>
            <button onClick={() => setAdding(false)}>&times;</button>
          </div>
          <div className="enrolled-dropdown-list">
            {available.length === 0 ? (
              <div className="enrolled-dropdown-empty">No hay materias disponibles</div>
            ) : (
              available.map((m) => (
                <button
                  key={m.code}
                  className="enrolled-dropdown-item"
                  onClick={() => addSubject(m.code)}
                >
                  <span className="enrolled-dropdown-code">{m.code}</span>
                  <span>{m.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Editing banner */}
      {editingCode && (
        <div className="enrolled-editing-banner" style={{ borderColor: editingColor?.border }}>
          <span className="enrolled-editing-dot" style={{ background: editingColor?.text }} />
          <span className="enrolled-editing-text">
            Editando horarios de <strong>{editingName}</strong> — click y arrastrar en el calendario para agregar bloques
          </span>
          <button className="enrolled-editing-done" onClick={() => setEditingCode(null)}>
            Listo
          </button>
        </div>
      )}

      <div className="enrolled-content">
        {/* Subject cards */}
        <div className="enrolled-cards">
          {enrolled.length === 0 && !adding && (
            <div className="enrolled-empty">
              <p>No hay materias inscriptas.</p>
              <p>Hace click en "Agregar materia" para empezar.</p>
            </div>
          )}
          {enrolled.map((subj) => {
            const name = getName(subj.code);
            const isEditing = editingCode === subj.code;
            const color = colorMap[subj.code] || COLORS[0];
            return (
              <div
                className={`enrolled-card ${isEditing ? "editing" : ""}`}
                key={subj.code}
                style={isEditing ? { borderColor: color.border } : undefined}
              >
                <div className="enrolled-card-header">
                  <div>
                    <span className="enrolled-card-color" style={{ background: color.text }} />
                    <span className="enrolled-card-code">{subj.code}</span>
                    <span className="enrolled-card-name">{name}</span>
                  </div>
                  <div className="enrolled-card-actions">
                    <button
                      className={`enrolled-card-edit ${isEditing ? "active" : ""}`}
                      onClick={() => setEditingCode(isEditing ? null : subj.code)}
                    >
                      {isEditing ? "Listo" : "Editar horarios"}
                    </button>
                    <button
                      className="enrolled-card-remove"
                      onClick={() => removeSubject(subj.code)}
                    >
                      &times;
                    </button>
                  </div>
                </div>

                {subj.schedule.length > 0 && (
                  <div className="enrolled-schedule-list">
                    {subj.schedule.map((block, idx) => {
                      const durMin = timeToMinutes(block.end) - timeToMinutes(block.start);
                      const durH = Math.floor(durMin / 60);
                      const durM = durMin % 60;
                      const durStr = durM > 0 ? `${durH}h${durM}m` : `${durH}h`;
                      return (
                        <div className="enrolled-block" key={idx} style={{ borderLeftColor: color.border }}>
                          <span className="enrolled-block-day">{block.day}</span>
                          <span className="enrolled-block-time">{block.start} - {block.end}</span>
                          <span className="enrolled-block-dur">{durStr}</span>
                          {block.classroom && (
                            <span className="enrolled-block-room">{block.classroom}</span>
                          )}
                          {isEditing && (
                            <>
                              <input
                                className="enrolled-block-classroom-input"
                                type="text"
                                placeholder="Aula"
                                value={block.classroom}
                                onChange={(e) => updateBlockClassroom(subj.code, idx, e.target.value)}
                              />
                              <button className="enrolled-block-remove" onClick={() => removeBlock(subj.code, idx)}>
                                &times;
                              </button>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {subj.schedule.length > 0 && !isEditing && (
                  <div className="enrolled-card-gcal">
                    {subj.schedule.map((block, idx) => (
                      <a
                        key={idx}
                        className="enrolled-gcal-link"
                        href={buildGCalUrl(name, block, semStart, semEnd)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Agregar ${block.day} a Google Calendar`}
                      >
                        GCal {block.day.slice(0, 3)}
                      </a>
                    ))}
                  </div>
                )}

                {subj.schedule.length === 0 && (
                  <div className="enrolled-card-hint">
                    {isEditing
                      ? "Arrastra en el calendario para agregar un bloque horario"
                      : "Sin horarios — click en \"Editar horarios\" para agregar"}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Weekly calendar timetable */}
        <div className="timetable">
          <div className="timetable-title">Horario semanal</div>
          <div className="timetable-calendar" onMouseUp={handleMouseUp} onMouseLeave={() => { handleMouseUp(); handleMouseLeave(); }}>
            {/* Hour labels column */}
            <div className="tt-hours">
              {hourLabels.map((h) => (
                <div
                  className="tt-hour-label"
                  key={h}
                  style={{ top: `${((h - GRID_START_HOUR) * 60 / GRID_TOTAL_MINUTES) * 100}%` }}
                >
                  {pad(h)}:00
                </div>
              ))}
            </div>

            {/* Day columns */}
            {DAYS.slice(0, 6).map((day) => (
              <div className="tt-day-col" key={day}>
                <div className="tt-day-header">{day.slice(0, 3)}</div>
                <div
                  className={`tt-day-body ${editingCode ? "editable" : ""}`}
                  ref={(el) => (dayBodyRefs.current[day] = el)}
                  onMouseDown={(e) => handleMouseDown(day, e)}
                  onMouseMove={(e) => handleMouseMove(day, e)}
                  onMouseLeave={handleMouseLeave}
                >
                  {/* Half-hour grid lines */}
                  {hourLabels.map((h) => (
                    <div key={h}>
                      <div
                        className="tt-grid-line"
                        style={{ top: `${((h - GRID_START_HOUR) * 60 / GRID_TOTAL_MINUTES) * 100}%` }}
                      />
                      <div
                        className="tt-grid-line half"
                        style={{ top: `${(((h - GRID_START_HOUR) * 60 + 30) / GRID_TOTAL_MINUTES) * 100}%` }}
                      />
                    </div>
                  ))}

                  {/* Hover indicator */}
                  {editingCode && hoverSlot && hoverSlot.day === day && !dragState && (
                    <div
                      className="tt-hover-indicator"
                      style={{
                        top: `${((hoverSlot.min - GRID_START_HOUR * 60) / GRID_TOTAL_MINUTES) * 100}%`,
                        height: `${(120 / GRID_TOTAL_MINUTES) * 100}%`,
                        background: editingColor?.bg,
                        borderLeft: `3px solid ${editingColor?.border}`,
                      }}
                    >
                      <span style={{ color: editingColor?.text }}>{minutesToTime(hoverSlot.min)}</span>
                    </div>
                  )}

                  {/* Drag preview */}
                  {dragPreview && dragPreview.day === day && (
                    <div
                      className="tt-drag-preview"
                      style={{
                        top: `${dragPreview.top}%`,
                        height: `${dragPreview.height}%`,
                        background: dragPreview.color.bg,
                        borderLeft: `3px solid ${dragPreview.color.border}`,
                      }}
                    >
                      <span className="tt-event-time" style={{ color: dragPreview.color.text }}>
                        {dragPreview.startTime} - {dragPreview.endTime}
                      </span>
                      <span className="tt-event-name">{editingName}</span>
                    </div>
                  )}

                  {/* Event blocks */}
                  {allBlocks
                    .filter((b) => b.day === day)
                    .map((block, i) => {
                      const top = ((block.startMin - GRID_START_HOUR * 60) / GRID_TOTAL_MINUTES) * 100;
                      const height = ((block.endMin - block.startMin) / GRID_TOTAL_MINUTES) * 100;
                      const color = colorMap[block.code] || COLORS[0];
                      const durMin = block.endMin - block.startMin;
                      const durH = Math.floor(durMin / 60);
                      const durM = durMin % 60;
                      const durStr = durM > 0 ? `${durH}h${durM}m` : `${durH}h`;

                      return (
                        <div
                          className="tt-event"
                          key={`${block.code}-${i}`}
                          style={{
                            top: `${top}%`,
                            height: `${height}%`,
                            background: color.bg,
                            borderLeft: `3px solid ${color.border}`,
                          }}
                        >
                          <span className="tt-event-time" style={{ color: color.text }}>
                            {block.start} - {block.end}
                          </span>
                          <span className="tt-event-name">{block.name}</span>
                          <span className="tt-event-meta">
                            {durStr}
                            {block.classroom && ` · ${block.classroom}`}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
