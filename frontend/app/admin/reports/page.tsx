"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import TopBar from "@/components/layout/TopBar";
import { 
  FileText, Download, FileSpreadsheet, Loader2, 
  AlertTriangle, CheckCircle, Search, Filter 
} from "lucide-react";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Student {
  id: string;
  roll_no: string;
  name: string;
  semester: number | null;
  division: string | null;
}

interface ReportRow {
  rollNo: string;
  name: string;
  division: string;
  totalLectures: number;
  attended: number;
  percentage: number;
  status: "safe" | "critical" | "warning";
}

interface OrgSummaryDept {
  dept_name: string;
  dept_code: string;
  student_count: number;
  avg_attendance: number;
  present_count: number;
  absent_count: number;
}

export default function AdminReportsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [orgSummary, setOrgSummary] = useState<OrgSummaryDept[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  
  // Filter Inputs
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedSem, setSelectedSem] = useState("4");
  const [reportType, setReportType] = useState("summary"); // 'summary' | 'defaulters'
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Report State
  const [generating, setGenerating] = useState(false);
  const [reportData, setReportData] = useState<ReportRow[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [deptRes, summaryRes] = await Promise.all([
          apiFetch("/departments"),
          apiFetch("/reports/summary"),
        ]);
        if (deptRes.ok) {
          const data = await deptRes.json();
          setDepartments(data);
          if (data.length > 0) setSelectedDept(data[0].id);
        }
        if (summaryRes.ok) {
          const s = await summaryRes.json();
          setOrgSummary(s.departments || []);
        }
      } catch (err) {
        console.error("Failed to load report data:", err);
      } finally {
        setDeptsLoading(false);
        setSummaryLoading(false);
      }
    }
    loadInitialData();
  }, []);

  // Show a temp toast message
  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  // Generate Report — fetches real attendance data per student
  async function handleGenerateReport(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDept) return;
    setGenerating(true);
    setReportData(null);

    try {
      // 1. Fetch students for the department
      let query = `/students?dept_id=${selectedDept}`;
      if (selectedSem) query += `&semester=${selectedSem}`;
      const res = await apiFetch(query);
      if (!res.ok) throw new Error("Failed to fetch student list");
      const studentsList: Student[] = await res.json();

      // 2. For each student, fetch their real attendance stats
      const rows: ReportRow[] = await Promise.all(
        studentsList.map(async (s) => {
          try {
            const attRes = await apiFetch(`/students/${s.id}/attendance`);
            if (attRes.ok) {
              const att = await attRes.json();
              const pct = att.percentage ?? 0;
              let status: "safe" | "critical" | "warning" = "safe";
              if (pct < 65) status = "critical";
              else if (pct < 75) status = "warning";
              return {
                rollNo: s.roll_no,
                name: s.name,
                division: s.division || "?",
                totalLectures: att.total_lectures,
                attended: att.present,
                percentage: pct,
                status,
              };
            }
          } catch {}
          return {
            rollNo: s.roll_no,
            name: s.name,
            division: s.division || "?",
            totalLectures: 0,
            attended: 0,
            percentage: 0,
            status: "critical" as const,
          };
        })
      );

      rows.sort((a, b) => a.rollNo.localeCompare(b.rollNo));
      const finalRows = reportType === "defaulters" ? rows.filter(r => r.percentage < 75) : rows;

      setReportData(finalRows);
      showToast("Report generated successfully!");
    } catch (err: any) {
      alert(err.message || "Failed to generate report");
    } finally {
      setGenerating(false);
    }
  }

  // Export functions
  function handleDownloadCSV() {
    if (!reportData) return;
    
    // Create CSV content
    const headers = ["Roll No", "Name", "Division", "Total Lectures", "Attended Lectures", "Attendance %", "Status"];
    const rows = reportData.map(r => [
      r.rollNo, r.name, r.division, r.totalLectures, r.attended, `${r.percentage}%`, r.status.toUpperCase()
    ]);
    
    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Report_Sem${selectedSem || "All"}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast("CSV export started!");
  }

  function handleDownloadPDF() {
    if (!reportData) return;
    
    // Simulate premium PDF creation and download
    showToast("Preparing PDF document...");
    setTimeout(() => {
      const summaryText = `
=============================================
         ATTENDAI SYSTEM REPORT
=============================================
Report Type: ${reportType.toUpperCase()}
Semester: ${selectedSem || "All"}
Generated: ${new Date().toLocaleString()}
---------------------------------------------
Total Records: ${reportData.length}
Avg Attendance: ${Math.round(reportData.reduce((acc, r) => acc + r.percentage, 0) / (reportData.length || 1))}%
---------------------------------------------
Detailed Table:
${reportData.map(r => `${r.rollNo.padEnd(8)} ${r.name.padEnd(20)} ${r.percentage}% (${r.status})`).join("\n")}
=============================================
`;
      const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Attendance_Report_Sem${selectedSem || "All"}.txt`);
      link.click();
      showToast("Report PDF/Text download complete!");
    }, 1000);
  }

  const filteredPreview = reportData?.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.rollNo.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const avgAttendance = reportData && reportData.length > 0
    ? Math.round(reportData.reduce((acc, r) => acc + r.percentage, 0) / reportData.length)
    : 0;

  const defaultersCount = reportData
    ? reportData.filter(r => r.percentage < 75).length
    : 0;

  return (
    <div className="page-content fade-up" style={{ paddingBottom: 120 }}>
      <TopBar title="Reports & Analytics" showBack={true} />

      {/* Live Org Summary */}
      {!summaryLoading && orgSummary.length > 0 && (
        <>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Live Org Overview</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
            {orgSummary.map((d, i) => (
              <div key={i} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{d.dept_name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {d.student_count} students · {d.present_count} present / {d.present_count + d.absent_count} records
                  </div>
                </div>
                <span style={{
                  fontSize: 15, fontWeight: 700,
                  color: d.avg_attendance >= 75 ? "var(--success)" : "var(--warning)"
                }}>
                  {d.avg_attendance}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Filter Parameters Form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <Filter size={18} style={{ color: "var(--accent)" }} />
          Report Parameters
        </h3>
        <form onSubmit={handleGenerateReport}>
          <div className="form-group">
            <label className="form-label">Department</label>
            {deptsLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 14 }}>
                <Loader2 size={16} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                Loading departments...
              </div>
            ) : (
              <select
                className="select-input"
                value={selectedDept}
                onChange={e => setSelectedDept(e.target.value)}
                required
              >
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Semester</label>
              <select 
                className="select-input"
                value={selectedSem}
                onChange={e => setSelectedSem(e.target.value)}
              >
                <option value="">All Semesters</option>
                {[1,2,3,4,5,6,7,8].map(sem => (
                  <option key={sem} value={sem.toString()}>Sem {sem}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Report Type</label>
              <select 
                className="select-input"
                value={reportType}
                onChange={e => setReportType(e.target.value)}
              >
                <option value="summary">Summary Report</option>
                <option value="defaulters">Defaulter List (&lt;75%)</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">From Date</label>
              <input type="date" className="input" style={{ fontSize: 13, padding: "10px 12px" }} value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">To Date</label>
              <input type="date" className="input" style={{ fontSize: 13, padding: "10px 12px" }} value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ gap: 8 }} disabled={generating || deptsLoading}>
            {generating ? (
              <>
                <Loader2 size={18} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
                Generating Report...
              </>
            ) : (
              <>
                <FileText size={18} />
                Generate Report
              </>
            )}
          </button>
        </form>
      </div>

      {/* Report Summary Cards */}
      {reportData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div className="stat-card" style={{ borderLeft: "4px solid var(--accent)" }}>
            <span className="stat-label">Average Attendance</span>
            <div className="stat-value" style={{ color: avgAttendance >= 75 ? "var(--success)" : "var(--warning)" }}>
              {avgAttendance}%
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Across {reportData.length} students</p>
          </div>

          <div className="stat-card" style={{ borderLeft: `4px solid ${defaultersCount > 0 ? "var(--danger)" : "var(--success)"}` }}>
            <span className="stat-label">Defaulters (&lt;75%)</span>
            <div className="stat-value" style={{ color: defaultersCount > 0 ? "var(--danger)" : "var(--success)" }}>
              {defaultersCount}
            </div>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Require warning letters</p>
          </div>
        </div>
      )}

      {/* Report Preview Table */}
      {reportData && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ fontSize: 16 }}>Report Preview ({filteredPreview.length})</h3>
            
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-secondary" style={{ padding: "6px 10px", fontSize: 12, borderRadius: 8, gap: 4 }} onClick={handleDownloadCSV}>
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button className="btn btn-primary" style={{ padding: "6px 10px", fontSize: 12, borderRadius: 8, gap: 4, width: "auto" }} onClick={handleDownloadPDF}>
                <Download size={14} /> PDF
              </button>
            </div>
          </div>

          {/* Quick Search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <input 
              type="text" 
              className="input" 
              placeholder="Search by name or roll no..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ paddingLeft: 36, fontSize: 13, padding: "10px 12px 10px 36px" }}
            />
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          </div>

          {/* Table Container */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  <th style={{ textAlign: "left", padding: "8px 4px", fontWeight: 500 }}>Roll No</th>
                  <th style={{ textAlign: "left", padding: "8px 4px", fontWeight: 500 }}>Name</th>
                  <th style={{ textAlign: "center", padding: "8px 4px", fontWeight: 500 }}>Lectures</th>
                  <th style={{ textAlign: "right", padding: "8px 4px", fontWeight: 500 }}>Att. %</th>
                </tr>
              </thead>
              <tbody>
                {filteredPreview.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", padding: "20px 0", color: "var(--text-secondary)" }}>
                      No records match the query.
                    </td>
                  </tr>
                ) : (
                  filteredPreview.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                      <td style={{ padding: "10px 4px", fontWeight: 600 }}>{row.rollNo}</td>
                      <td style={{ padding: "10px 4px", color: "var(--text-primary)" }}>{row.name}</td>
                      <td style={{ padding: "10px 4px", textAlign: "center", color: "var(--text-secondary)" }}>
                        {row.attended}/{row.totalLectures}
                      </td>
                      <td style={{ 
                        padding: "10px 4px", 
                        textAlign: "right", 
                        fontWeight: 700,
                        color: row.status === "safe" ? "var(--success)" : 
                               row.status === "warning" ? "var(--warning)" : "var(--danger)"
                      }}>
                        {row.percentage}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div style={{
          position: "fixed",
          bottom: 100,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--bg-card-2)",
          border: "1px solid var(--border-accent)",
          color: "white",
          padding: "10px 16px",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          zIndex: 2000,
          fontSize: 13,
          display: "flex",
          alignItems: "center",
          gap: 6
        }}>
          <CheckCircle size={16} color="var(--success)" />
          {toastMsg}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
