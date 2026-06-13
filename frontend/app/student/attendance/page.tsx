"use client";
import { useState } from "react";
import TopBar from "@/components/layout/TopBar";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const mockHistory: Record<string, { subject: string; status: "present"|"absent"; time: string; confidence?: number }[]> = {
  "2026-03-13": [
    { subject: "Engineering Mathematics 4", status: "present", time: "09:00 AM", confidence: 0.97 },
    { subject: "Data Structures", status: "present", time: "11:00 AM", confidence: 0.93 },
    { subject: "Physics", status: "absent", time: "02:00 PM" },
  ],
  "2026-03-14": [{ subject: "Chemistry", status: "present", time: "10:00 AM", confidence: 0.91 }],
  "2026-03-16": [
    { subject: "Engineering Mathematics 4", status: "present", time: "09:00 AM", confidence: 0.88 },
    { subject: "Data Structures", status: "absent", time: "12:00 PM" },
  ],
  "2026-03-18": [
    { subject: "Engineering Mathematics 4", status: "present", time: "09:00 AM", confidence: 0.95 },
    { subject: "Data Structures", status: "present", time: "11:00 AM", confidence: 0.92 },
    { subject: "Chemistry", status: "present", time: "02:00 PM", confidence: 0.89 },
  ],
  "2026-03-20": [{ subject: "Physics", status: "absent", time: "10:00 AM" }],
  "2026-03-25": [
    { subject: "Engineering Mathematics 4", status: "present", time: "09:00 AM", confidence: 0.96 },
    { subject: "Data Structures", status: "present", time: "11:00 AM", confidence: 0.91 },
  ],
  "2026-03-27": [
    { subject: "Engineering Mathematics 4", status: "absent", time: "02:07 PM" },
    { subject: "Data Structures", status: "present", time: "04:00 PM", confidence: 0.94 },
  ],
};

export default function StudentAttendancePage() {
  const [year, setYear]   = useState(2026);
  const [month, setMonth] = useState(2);
  const [selected, setSelected] = useState("2026-03-13");

  function prevMonth() { if (month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1); }
  function nextMonth() { if (month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1); }

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const cells       = [...Array(firstDay).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  const data        = mockHistory[selected];

  function statusForDay(day: number) {
    const key = `${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const d = mockHistory[key];
    if (!d) return null;
    const hasAbsent  = d.some(l=>l.status==="absent");
    const hasPresent = d.some(l=>l.status==="present");
    if (hasAbsent && hasPresent) return "mixed";
    if (hasAbsent) return "absent";
    return "present";
  }

  return (
    <div className="page-content">
      <TopBar title="Attendance History" showFilter />

      {/* Calendar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <button onClick={prevMonth} style={{background:"none",border:"none",color:"var(--text-primary)",cursor:"pointer"}}><ChevronLeft size={22}/></button>
          <span style={{fontWeight:600,fontSize:16}}>{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} style={{background:"none",border:"none",color:"var(--text-primary)",cursor:"pointer"}}><ChevronRight size={22}/></button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
          {DAYS.map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"var(--text-secondary)",fontWeight:500}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {cells.map((day,i)=>{
            if(!day) return <div key={i}/>;
            const key=`${year}-${String(month+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const status=statusForDay(day);
            const isSel=key===selected;
            return (
              <button key={i} onClick={()=>setSelected(key)} style={{
                aspectRatio:"1",borderRadius:99,border:"none",cursor:"pointer",
                fontSize:13,fontWeight:isSel?700:400,transition:"all 0.15s",
                display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                background: isSel?"var(--accent)":
                  status==="present"?"var(--success-dim)":
                  status==="absent"?"var(--danger-dim)":
                  status==="mixed"?"var(--warning-dim)":"transparent",
                color: isSel?"white":
                  status==="present"?"var(--success)":
                  status==="absent"?"var(--danger)":
                  status==="mixed"?"var(--warning)":"var(--text-primary)",
              }}>
                {day}
              </button>
            );
          })}
        </div>
        {/* Legend */}
        <div style={{display:"flex",gap:12,marginTop:14,justifyContent:"center",flexWrap:"wrap"}}>
          {[["var(--success)","Present"],["var(--danger)","Absent"],["var(--warning)","Mixed"]].map(([c,l])=>(
            <span key={l} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"var(--text-secondary)"}}>
              <span style={{width:10,height:10,borderRadius:99,background:c,display:"inline-block"}}/>{l}
            </span>
          ))}
        </div>
      </div>

      {/* Selected Day Records */}
      {data ? (
        <>
          <div className="section-header" style={{marginBottom:12}}>
            <span style={{fontSize:15,fontWeight:600}}>
              {new Date(selected).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}
            </span>
            <span className="badge badge-accent">{data.length} Lecture{data.length>1?"s":""}</span>
          </div>
          {data.map((l,i)=>(
            <div key={i} className={`lecture-card ${l.status==="absent"?"absent":""}`} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <span style={{fontSize:13,color:"var(--text-secondary)"}}>🕐 {l.time}</span>
                <span className={`badge ${l.status==="present"?"badge-present":"badge-absent"}`}>
                  {l.status==="present"?"Present":"Absent"}
                </span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:600,fontSize:15}}>{l.subject}</span>
                {l.confidence && (
                  <button style={{background:"none",border:"1px solid var(--border)",borderRadius:8,padding:"4px 10px",color:"var(--text-secondary)",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",gap:4}}>
                    <Eye size={12}/> Evidence
                  </button>
                )}
              </div>
              {l.confidence && (
                <div style={{fontSize:12,color:"var(--text-muted)",marginTop:4}}>
                  AI Match: {Math.round(l.confidence*100)}% confidence
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <div style={{textAlign:"center",padding:"32px 0",color:"var(--text-muted)"}}>
          <div style={{fontSize:36,marginBottom:8}}>📅</div>
          <p>No lectures recorded on this day</p>
        </div>
      )}
    </div>
  );
}
