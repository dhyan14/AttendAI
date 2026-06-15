"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import {
  AlertTriangle, CheckCircle, Clock, XCircle, Plus, Loader2, ChevronRight, X, Check,
} from "lucide-react";

interface Dispute {
  id: string;
  lecture_id: string;
  subject_name: string;
  date: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  admin_note?: string;
  created_at: string;
}

interface Lecture {
  id: string;
  subject_name: string;
  date: string;
  status: string;
  student_status?: "present" | "absent";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "approved") return <span className="badge badge-present">Approved</span>;
  if (status === "rejected") return <span className="badge badge-absent">Rejected</span>;
  return <span className="badge badge-warning">Pending</span>;
}

export default function StudentDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedLecture, setSelectedLecture] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    async function load() {
      try {
        const [dRes, lRes] = await Promise.all([
          apiFetch("/disputes/my"),
          apiFetch("/student/attendance"),
        ]);
        if (dRes.ok) setDisputes(await dRes.json());
        if (lRes.ok) {
          const data = await lRes.json();
          // filter absent lectures only — these can be disputed
          setLectures((data.records || []).filter((l: Lecture) => l.student_status === "absent"));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function submitDispute() {
    if (!selectedLecture || !reason.trim()) return;
    setSubmitting(true);
    try {
      const r = await apiFetch("/disputes", {
        method: "POST",
        body: JSON.stringify({ lecture_id: selectedLecture, reason: reason.trim() }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || "Failed");
      const newDispute = await r.json();
      setDisputes(d => [newDispute, ...d]);
      showToast("✓ Dispute submitted");
      setShowModal(false);
      setSelectedLecture("");
      setReason("");
    } catch (err: any) {
      showToast("✗ " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const pending = disputes.filter(d => d.status === "pending").length;
  const approved = disputes.filter(d => d.status === "approved").length;

  return (
    <div className="page-content fade-up">
      {toast && <div className={`toast${toast.startsWith("✗") ? " error" : ""}`}>{toast}</div>}

      <TopBar
        title="My Disputes"
        rightAction={
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={15} /> Raise
          </button>
        }
      />

      {/* Stats */}
      <div className="stats-grid" style={{ marginTop: 16 }}>
        {[
          { label: "Total Raised", value: disputes.length, color: "var(--accent)", bg: "var(--accent-dim)", icon: <AlertTriangle size={18} /> },
          { label: "Pending", value: pending, color: "var(--warning)", bg: "var(--warning-dim)", icon: <Clock size={18} /> },
          { label: "Approved", value: approved, color: "var(--success)", bg: "var(--success-dim)", icon: <CheckCircle size={18} /> },
        ].map((s, i) => (
          <div key={i} className="stat-card">
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>{s.icon}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Disputes list */}
      {loading ? (
        <div className="empty-state">
          <Loader2 size={28} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : disputes.length === 0 ? (
        <div className="empty-state">
          <AlertTriangle size={36} />
          <p>No disputes raised yet</p>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>
            <Plus size={14} /> Raise a Dispute
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {disputes.map(d => (
            <div key={d.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{d.subject_name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{d.date}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>

              <div style={{
                background: "var(--bg-card-2)", borderRadius: 10,
                padding: "10px 12px", fontSize: 13,
                color: "var(--text-secondary)", lineHeight: 1.5,
              }}>
                {d.reason}
              </div>

              {d.admin_note && (
                <div style={{
                  marginTop: 8, borderTop: "1px solid var(--border-subtle)", paddingTop: 8,
                  display: "flex", gap: 6, alignItems: "flex-start",
                }}>
                  <div style={{
                    flexShrink: 0, width: 20, height: 20, borderRadius: 6,
                    background: d.status === "approved" ? "var(--success-dim)" : "var(--danger-dim)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {d.status === "approved"
                      ? <Check size={12} color="var(--success)" />
                      : <X size={12} color="var(--danger)" />
                    }
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    <strong>Admin:</strong> {d.admin_note}
                  </span>
                </div>
              )}

              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
                Submitted {new Date(d.created_at).toLocaleDateString("en-IN")}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-sheet">
            <div className="modal-header">
              <span className="modal-title">Raise a Dispute</span>
              <button
                onClick={() => setShowModal(false)}
                style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-card-2)", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Select Absent Session</label>
              <select
                className="select-input"
                value={selectedLecture}
                onChange={e => setSelectedLecture(e.target.value)}
              >
                <option value="">Choose a session you were marked absent...</option>
                {lectures.map(l => (
                  <option key={l.id} value={l.id}>{l.subject_name} — {l.date}</option>
                ))}
              </select>
              {lectures.length === 0 && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
                  No absent sessions found to dispute.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Reason for Dispute</label>
              <textarea
                className="input"
                rows={4}
                placeholder="Explain why you believe attendance was incorrect…"
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{ resize: "vertical" }}
              />
            </div>

            <button
              className="btn btn-primary btn-primary-full"
              onClick={submitDispute}
              disabled={submitting || !selectedLecture || !reason.trim()}
            >
              {submitting
                ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Submitting…</>
                : <><Check size={15} /> Submit Dispute</>
              }
            </button>

            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      )}
    </div>
  );
}
