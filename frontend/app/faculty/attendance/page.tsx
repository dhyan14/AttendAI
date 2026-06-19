"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

interface LectureRow {
  id: string;
  subject: string;
  div: string;
  lectureNo: number;
  time: string;
  present: number;
  total: number;
  status: string;
}

export default function AttendanceHistoryPage() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split("T")[0]);
  const [lectures, setLectures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await apiFetch("/attendance/lectures");
        if (res.ok) {
          const data = await res.json();
          setLectures(data);
        }
      } catch (err) {
        console.error("Error loading attendance history:", err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, []);

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

  // Group lectures by date
  const lecturesByDate: Record<string, { count: number; lectures: LectureRow[] }> = {};
  lectures.forEach(l => {
    const key = l.date; // YYYY-MM-DD
    if (!lecturesByDate[key]) {
      lecturesByDate[key] = { count: 0, lectures: [] };
    }
    lecturesByDate[key].count += 1;
    lecturesByDate[key].lectures.push({
      id: l.id,
      subject: l.subject_name,
      div: `Div ${l.division}`,
      lectureNo: l.lecture_no,
      time: l.time,
      present: l.present_count,
      total: l.total_students,
      status: l.status,
    });
  });

  const selectedData = lecturesByDate[selectedDate];
  const selDay = selectedDate ? new Date(selectedDate) : null;

  return (
    <div className="page-content" style={{ paddingBottom: 100 }}>
      <TopBar title="Attendance History" />

      <div className="history-layout">
        {/* Left Side: Calendar Card */}
        <div className="calendar-card-wrap">
          <div className="card" style={{ padding: 16 }}>
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
            {loading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                <Loader2 className="animate-spin" size={24} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={i} />;
                  const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const data = lecturesByDate[key];
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
            )}
          </div>
        </div>

        {/* Right Side: Selected Date Details */}
        <div className="lectures-wrap">
          {selDay && selectedData ? (
            <>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
                  {selDay.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </span>
                <span className="badge badge-accent" style={{ marginLeft: 8 }}>{selectedData.count} Lecture{selectedData.count > 1 ? "s" : ""}</span>
              </div>

              {selectedData.lectures.map((l, i) => (
                <div 
                  key={l.id} 
                  className="card-accent" 
                  style={{ marginBottom: 12, cursor: "pointer", borderLeftColor: l.status === "finalized" ? "var(--success)" : "var(--accent)" }}
                  onClick={() => router.push(`/faculty/attendance/take?lecture_id=${l.id}`)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="badge badge-muted" style={{ fontSize: 11 }}>⊞ {l.div}</span>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Lecture {l.lectureNo}</span>
                  </div>
                  <h3 style={{ fontSize: 17, marginBottom: 10 }}>{l.subject}</h3>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 4 }}>
                      🕐 {l.time}
                    </span>
                    <span className={`badge ${l.status === "finalized" ? "badge-present" : "badge-warning"}`}>
                      {l.status === "finalized" ? `${l.present}/${l.total} Present` : "Pending Review"}
                    </span>
                  </div>
                </div>
              ))}
            </>
          ) : (
            selDay && !loading && (
              <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                  {selDay.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>No lectures on this day</p>
              </div>
            )
          )}
        </div>
      </div>

      <style>{`
        .history-layout {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (min-width: 900px) {
          .history-layout {
            grid-template-columns: 380px 1fr;
            gap: 28px;
          }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
