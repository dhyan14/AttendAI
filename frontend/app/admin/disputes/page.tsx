"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { ShieldAlert, Check, X, MessageSquare, Loader2, Award, Calendar, AlertCircle } from "lucide-react";

interface Dispute {
  id: string;
  student_id: string;
  student_name: string;
  roll_no: string;
  lecture_id: string;
  lecture_date: string;
  subject_name: string;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "resolved" | "rejected">("open");

  // Resolve dialog state
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [resolving, setResolving] = useState(false);

  async function loadDisputes() {
    setLoading(true);
    try {
      const res = await apiFetch("/disputes/");
      if (res.ok) {
        const data = await res.json();
        setDisputes(data);
      }
    } catch (err) {
      console.error("Failed to load disputes:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDisputes();
  }, []);

  async function handleResolve(status: "resolved" | "rejected") {
    if (!selectedDispute) return;
    setResolving(true);
    try {
      const res = await apiFetch(`/disputes/${selectedDispute.id}/resolve`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          admin_note: adminNote,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to resolve dispute");
      }

      // Reload disputes
      await loadDisputes();
      setSelectedDispute(null);
      setAdminNote("");
    } catch (err: any) {
      alert(err.message || "Error resolving dispute");
    } finally {
      setResolving(false);
    }
  }

  const filteredDisputes = disputes.filter(d => {
    if (filter === "all") return true;
    return d.status === filter;
  });

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 100 }}>
      <TopBar title="Disputes" showBack={true} />

      {/* Tabs */}
      <div className="toggle-pill" style={{ marginBottom: 16 }}>
        <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>Open</button>
        <button className={filter === "resolved" ? "active" : ""} onClick={() => setFilter("resolved")}>Resolved</button>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 size={32} className="animate-spin" style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
        </div>
      ) : filteredDisputes.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "40px 16px", color: "var(--text-secondary)" }}>
          <ShieldAlert size={48} style={{ color: "var(--text-muted)", marginBottom: 12, margin: "0 auto 12px" }} />
          <p>No disputes found.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredDisputes.map(d => (
            <div key={d.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 2 }}>{d.student_name}</h3>
                  <span className="badge badge-muted" style={{ fontSize: 10 }}>Roll No: {d.roll_no}</span>
                </div>
                <span className={`badge ${d.status === "open" ? "badge-warning" : d.status === "resolved" ? "badge-present" : "badge-absent"}`}>
                  {d.status.toUpperCase()}
                </span>
              </div>

              <div className="divider" style={{ margin: "4px 0" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  <Award size={14} />
                  <span>{d.subject_name}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  <Calendar size={14} />
                  <span>{d.lecture_date}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, color: "var(--text-primary)", background: "var(--bg-card-2)", padding: 8, borderRadius: 8 }}>
                  <MessageSquare size={14} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent)" }} />
                  <div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 2 }}>Student Reason</div>
                    <div>{d.reason}</div>
                  </div>
                </div>

                {d.admin_note && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 13, color: "var(--text-secondary)", borderLeft: "2px solid var(--accent)", paddingLeft: 8, marginTop: 4 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Admin Note</div>
                      <div>{d.admin_note}</div>
                    </div>
                  </div>
                )}
              </div>

              {d.status === "open" && (
                <button
                  className="btn btn-primary"
                  style={{ padding: "10px 16px", fontSize: 13, marginTop: 8 }}
                  onClick={() => setSelectedDispute(d)}
                >
                  Action Dispute
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action Dialog / Modal */}
      {selectedDispute && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="card" style={{ width: "100%", maxWidth: 390, position: "relative" }}>
            <h3 style={{ marginBottom: 12 }}>Resolve Dispute</h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              Reviewing dispute from <strong>{selectedDispute.student_name}</strong> for <strong>{selectedDispute.subject_name}</strong>.
            </p>

            <div className="form-group">
              <label className="form-label">Admin Note / Remarks</label>
              <textarea
                className="input"
                placeholder="Add comments explaining approval or rejection..."
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                style={{ height: 90, resize: "none", width: "100%", boxSizing: "border-box" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
              <button
                className="btn btn-secondary"
                style={{ gap: 6, color: "var(--danger)", borderColor: "rgba(255,69,58,0.2)" }}
                onClick={() => handleResolve("rejected")}
                disabled={resolving}
              >
                <X size={16} /> Reject
              </button>
              <button
                className="btn btn-primary"
                style={{ gap: 6, background: "var(--success)" }}
                onClick={() => handleResolve("resolved")}
                disabled={resolving}
              >
                <Check size={16} /> Approve
              </button>
            </div>

            <button
              className="btn btn-ghost"
              style={{ width: "100%", marginTop: 10, fontSize: 13, padding: 8 }}
              onClick={() => { setSelectedDispute(null); setAdminNote(""); }}
              disabled={resolving}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
