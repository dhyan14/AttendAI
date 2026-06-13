"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { User, Mail, BadgeCheck, Building2, BookOpen, Loader2 } from "lucide-react";

interface FacultyProfile {
  id: string;
  name: string;
  designation: string | null;
  dept_id: string;
  dept_name: string;
  email: string;
}

export default function FacultyProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<FacultyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await apiFetch("/faculty/me");
        if (res.ok) {
          setProfile(await res.json());
        }
      } catch (err) {
        console.error("Error loading faculty profile:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  function handleSignOut() {
    localStorage.clear();
    router.replace("/login");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>Loading profile...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Profile" />

      {/* Avatar + Name */}
      <div style={{ textAlign: "center", padding: "20px 0 28px" }}>
        <div className="avatar" style={{ width: 90, height: 90, fontSize: 30, margin: "0 auto 14px" }}>
          {profile?.name ? profile.name.charAt(0) : "F"}
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{profile?.name || "Faculty Member"}</h2>
        <span className="badge badge-accent">Faculty Member</span>
      </div>

      {/* Personal Information */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>Personal Information</div>
        <div>
          <div className="info-row">
            <div className="info-row-icon"><User size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Name</div>
              <div className="info-row-value">{profile?.name}</div>
            </div>
          </div>
          <div className="info-row">
            <div className="info-row-icon"><Mail size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Email</div>
              <div className="info-row-value">{profile?.email}</div>
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
              <div className="info-row-value">Sardar Vallabhbhai Global University</div>
            </div>
          </div>
          <div className="info-row">
            <div className="info-row-icon"><BookOpen size={16} /></div>
            <div className="info-row-content">
              <div className="info-row-label">Department</div>
              <div className="info-row-value">{profile?.dept_name || "Unknown"}</div>
            </div>
          </div>
          {profile?.designation && (
            <div className="info-row">
              <div className="info-row-icon"><User size={16} /></div>
              <div className="info-row-content">
                <div className="info-row-label">Designation</div>
                <div className="info-row-value">{profile.designation}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logout */}
      <button
        className="btn btn-secondary"
        style={{ width: "100%", color: "var(--danger)", borderColor: "var(--danger-dim)" }}
        onClick={handleSignOut}
      >
        Sign Out
      </button>
    </div>
  );
}
