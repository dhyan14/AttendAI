"use client";
import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { ChevronLeft, ChevronRight } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Mock lecture data: date → lecture count
const mockLectures: Record<string, { count: number; lectures: { subject: string; div: string; lectureNo: number; time: string; present: number; total: number }[] }> = {
  "2026-03-02": { count: 1, lectures: [{ subject: "Data Structures", div: "Div A", lectureNo: 1, time: "10:00 AM", present: 68, total: 72 }] },
  "2026-03-12": { count: 1, lectures: [{ subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 2, time: "11:00 AM", present: 55, total: 76 }] },
  "2026-03-13": { count: 3, lectures: [
    { subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 3, time: "09:00 AM", present: 60, total: 76 },
    { subject: "Data Structures", div: "Div A", lectureNo: 2, time: "11:00 AM", present: 65, total: 72 },
    { subject: "Physics", div: "Div C", lectureNo: 1, time: "02:00 PM", present: 40, total: 55 },
  ]},
  "2026-03-14": { count: 1, lectures: [{ subject: "Chemistry", div: "Div A", lectureNo: 1, time: "10:00 AM", present: 50, total: 60 }] },
  "2026-03-16": { count: 2, lectures: [
    { subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 4, time: "09:00 AM", present: 62, total: 76 },
    { subject: "Data Structures", div: "Div A", lectureNo: 3, time: "12:00 PM", present: 68, total: 72 },
  ]},
  "2026-03-17": { count: 1, lectures: [{ subject: "Physics", div: "Div C", lectureNo: 2, time: "10:00 AM", present: 42, total: 55 }] },
  "2026-03-18": { count: 3, lectures: [
    { subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 5, time: "09:00 AM", present: 58, total: 76 },
    { subject: "Data Structures", div: "Div A", lectureNo: 4, time: "11:00 AM", present: 70, total: 72 },
    { subject: "Chemistry", div: "Div A", lectureNo: 2, time: "02:00 PM", present: 52, total: 60 },
  ]},
  "2026-03-20": { count: 1, lectures: [{ subject: "Physics", div: "Div C", lectureNo: 3, time: "10:00 AM", present: 45, total: 55 }] },
  "2026-03-23": { count: 2, lectures: [
    { subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 5, time: "09:00 AM", present: 33, total: 76 },
    { subject: "Data Structures", div: "Div A", lectureNo: 5, time: "11:00 AM", present: 66, total: 72 },
  ]},
  "2026-03-24": { count: 2, lectures: [
    { subject: "Physics", div: "Div C", lectureNo: 4, time: "10:00 AM", present: 48, total: 55 },
    { subject: "Chemistry", div: "Div A", lectureNo: 3, time: "12:00 PM", present: 54, total: 60 },
  ]},
  "2026-03-25": { count: 5, lectures: [
    { subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 5, time: "09:00 AM", present: 33, total: 76 },
    { subject: "Data Structures", div: "Div A", lectureNo: 5, time: "11:00 AM", present: 66, total: 72 },
    { subject: "Physics", div: "Div C", lectureNo: 4, time: "01:00 PM", present: 48, total: 55 },
    { subject: "Chemistry", div: "Div A", lectureNo: 3, time: "02:00 PM", present: 54, total: 60 },
    { subject: "Engineering Mathematics 4", div: "Div A", lectureNo: 2, time: "04:00 PM", present: 58, total: 70 },
  ]},
  "2026-03-27": { count: 3, lectures: [
    { subject: "Engineering Mathematics 4", div: "Div B", lectureNo: 5, time: "02:07 PM", present: 33, total: 76 },
    { subject: "Data Structures", div: "Div A", lectureNo: 6, time: "04:00 PM", present: 70, total: 72 },
    { subject: "Physics", div: "Div C", lectureNo: 5, time: "05:00 PM", present: 50, total: 55 },
  ]},
  "2026-03-30": { count: 2, lectures: [
    { subject: "Chemistry", div: "Div A", lectureNo: 4, time: "10:00 AM", present: 55, total: 60 },
    { subject: "Physics", div: "Div C", lectureNo: 6, time: "12:00 PM", present: 52, total: 55 },
  ]},
};

export default function AttendanceHistoryPage() {
  const now = new Date();
  const [year, setYear]   = useState(2026);
  const [month, setMonth] = useState(2); // 0-indexed; 2 = March
  const [selectedDate, setSelectedDate] = useState("2026-03-27");

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedData = mockLectures[selectedDate];
  const selDay = selectedDate ? new Date(selectedDate) : null;

  return (
    <div className="page-content">
      <TopBar title="Attendance History" showFilter />

      {/* Calendar Card */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        {/* Month Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer" }}>
            <ChevronLeft size={22} />
          </button>
          <span style={{ fontWeight: 600, fontSize: 16 }}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer" }}>
            <ChevronRight size={22} />
          </button>
        </div>

        {/* Day Headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 11, color: "var(--text-secondary)", fontWeight: 500 }}>{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const data = mockLectures[key];
            const isSelected = key === selectedDate;
            const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(key)}
                style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", aspectRatio: "1",
                  borderRadius: 99, border: "none",
                  background: isSelected ? "var(--accent)" : "transparent",
                  color: isSelected ? "white" : isToday ? "var(--accent)" : "var(--text-primary)",
                  cursor: "pointer",
                  fontWeight: isToday || isSelected ? 700 : 400,
                  fontSize: 14, transition: "all 0.15s",
                }}
              >
                {data && !isSelected && (
                  <div style={{
                    position: "absolute", top: 2, right: 2,
                    width: 18, height: 18, borderRadius: 99,
                    background: "var(--accent)", color: "white",
                    fontSize: 9, fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{data.count}</div>
                )}
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Lectures */}
      {selDay && selectedData && (
        <>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {selDay.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            </span>
            <span className="badge badge-accent">{selectedData.count} Lecture{selectedData.count > 1 ? "s" : ""}</span>
          </div>

          {selectedData.lectures.map((l, i) => (
            <div key={i} className="card-accent" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span className="badge badge-muted" style={{ fontSize: 11 }}>⊞ {l.div}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Lecture {l.lectureNo}</span>
              </div>
              <h3 style={{ fontSize: 17, marginBottom: 10 }}>{l.subject}</h3>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                  🕐 {l.time}
                </span>
                <span className="badge badge-present">{l.present}/{l.total} Present</span>
              </div>
            </div>
          ))}
        </>
      )}

      {selDay && !selectedData && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📅</div>
          <p>No lectures on this day</p>
        </div>
      )}
    </div>
  );
}
