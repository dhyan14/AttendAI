"use client";
import TopBar from "@/components/layout/TopBar";
import { User, Mail, BookOpen, Hash, Layers } from "lucide-react";

export default function StudentProfilePage() {
  const profile = {
    name: "Rahul Sharma",
    email: "rahul.sharma@college.edu",
    rollNo: "CS001",
    enrollment: "EN2024001",
    division: "A",
    batch: "B1",
    semester: 4,
    dept: "BTech Computer Science",
    org: "Sardar Vallabhbhai Global University",
    avatar: "RS",
  };

  return (
    <div className="page-content">
      <TopBar title="Profile" />

      {/* Avatar + Name */}
      <div style={{ textAlign:"center", padding:"20px 0 28px" }}>
        <div className="avatar" style={{ width:90, height:90, fontSize:30, margin:"0 auto 14px" }}>
          {profile.avatar}
        </div>
        <h2 style={{ fontSize:22, fontWeight:700, marginBottom:4 }}>{profile.name}</h2>
        <span className="badge badge-accent">Student</span>
      </div>

      {/* Personal Information */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title" style={{ marginBottom:12 }}>Personal Information</div>
        <div className="info-row">
          <div className="info-row-icon"><User size={16}/></div>
          <div className="info-row-content">
            <div className="info-row-label">Name</div>
            <div className="info-row-value">{profile.name}</div>
          </div>
        </div>
        <div className="info-row">
          <div className="info-row-icon"><Mail size={16}/></div>
          <div className="info-row-content">
            <div className="info-row-label">Email</div>
            <div className="info-row-value">{profile.email}</div>
          </div>
        </div>
      </div>

      {/* Academic Details */}
      <div className="card" style={{ marginBottom:16 }}>
        <div className="section-title" style={{ marginBottom:12 }}>Academic Details</div>
        {[
          { icon:<Hash size={16}/>,      label:"Roll Number",   value:profile.rollNo },
          { icon:<BookOpen size={16}/>,  label:"Enrollment",    value:profile.enrollment },
          { icon:<Layers size={16}/>,    label:"Division / Batch", value:`Div ${profile.division} · ${profile.batch}` },
          { icon:<BookOpen size={16}/>,  label:"Semester",      value:`Semester ${profile.semester}` },
          { icon:<BookOpen size={16}/>,  label:"Department",    value:profile.dept },
          { icon:<User size={16}/>,      label:"Organisation",  value:profile.org },
        ].map((row,i)=>(
          <div key={i} className="info-row">
            <div className="info-row-icon">{row.icon}</div>
            <div className="info-row-content">
              <div className="info-row-label">{row.label}</div>
              <div className="info-row-value">{row.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Logout */}
      <button
        className="btn btn-secondary"
        style={{ width:"100%", color:"var(--danger)", borderColor:"var(--danger-dim)" }}
        onClick={() => { localStorage.clear(); window.location.href="/login"; }}
      >
        Sign Out
      </button>
    </div>
  );
}
