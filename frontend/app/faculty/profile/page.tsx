"use client";
import TopBar from "@/components/layout/TopBar";
import { User, Mail, BadgeCheck, Building2, BookOpen } from "lucide-react";

export default function FacultyProfilePage() {
  const profile = {
    name: "Jaimin Patel",
    email: "jaiminpatel@svgu.ac.in",
    role: "Faculty Member",
    org: "Sardar Vallabhbhai Global University",
    dept: "BTech Computer Science",
    designation: "Assistant Professor",
    avatar: "JP",
  };

  return (
    <div className="page-content">
      <TopBar title="Profile" />

      {/* Avatar + Name */}
      <div style={{ textAlign: "center", padding: "20px 0 28px" }}>
        <div className="avatar" style={{ width: 90, height: 90, fontSize: 30, margin: "0 auto 14px" }}>
          {profile.avatar}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{profile.name}</h2>
        <span className="badge badge-accent">{profile.role}</span>
      </div>

      {/* Personal Information */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Personal Information</div>
        <div>
          <div className="info-row">
            <div className="info-row-icon"><User size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Name</div>
              <div className="info-row-value">{profile.name}</div>
            </div>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>✎</button>
          </div>
          <div className="info-row">
            <div className="info-row-icon"><Mail size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Email</div>
              <div className="info-row-value">{profile.email}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Academic Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Academic Details</div>
        <div>
          <div className="info-row">
            <div className="info-row-icon"><BadgeCheck size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Role</div>
              <div className="info-row-value">Faculty</div>
            </div>
          </div>
          <div className="info-row">
            <div className="info-row-icon"><Building2 size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Organisation</div>
              <div className="info-row-value">{profile.org}</div>
            </div>
          </div>
          <div className="info-row">
            <div className="info-row-icon"><BookOpen size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Departments</div>
              <div className="info-row-value">{profile.dept}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <button
        className="btn btn-secondary"
        style={{ width: "100%", color: "var(--danger)", borderColor: "var(--danger-dim)" }}
        onClick={() => {
          localStorage.clear();
          window.location.href = "/login";
        }}
      >
        Sign Out
      </button>
    </div>
  );
}
