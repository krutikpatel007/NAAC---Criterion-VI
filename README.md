# NAAC Criterion VI - Evidence & Gap Analysis Tracker

An interactive, responsive web application for Higher Education Institutions to track evidence documents, conduct 5-year gap analysis (2021-22 to 2025-26), and prepare for **NAAC SSR (Self Study Report) & DVV (Data Validation and Verification)** review under **Criterion VI: Governance, Leadership and Management (Total Weightage: 100)**.

The web app is **100% client-side** (HTML5, Tailwind CSS, Vanilla JavaScript, Chart.js, SheetJS), works completely offline, and can be **hosted for free on GitHub Pages** in 2 minutes.

---

## 🚀 Live Hosting on GitHub Pages (Step-by-Step)

You can host this entire web application on GitHub Pages without installing any build tools, servers, or dependencies:

### Step 1: Initialize Git and Commit
Open PowerShell or Git Bash in this folder (`NAAC – Criterion VI`):

```bash
git init
git add .
git commit -m "Initial commit of NAAC Criterion VI Evidence Tracker"
```

### Step 2: Create a Repository on GitHub
1. Go to [github.com/new](https://github.com/new).
2. Name the repository (for example: `naac-criterion-6-tracker`).
3. Set visibility to **Public** (or **Private** with GitHub Pro/Edu).
4. Do **not** initialize with a README (this folder already has everything).
5. Click **Create repository**.

### Step 3: Link and Push
In your terminal, run:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/naac-criterion-6-tracker.git
git push -u origin main
```

*(Replace `YOUR_USERNAME` and `naac-criterion-6-tracker` with your GitHub username and repository name).*

### Step 4: Enable GitHub Pages
1. Go to your GitHub repository in your web browser.
2. Click **Settings** (gear tab at the top).
3. In the left navigation menu, click **Pages**.
4. Under **Build and deployment > Branch**:
   - Branch: select `main`
   - Folder: select `/ (root)`
5. Click **Save**.
6. Wait 1–2 minutes. Your live web tracker URL will be displayed at the top:
   ```
   https://YOUR_USERNAME.github.io/naac-criterion-6-tracker/
   ```

---

## 💻 Running Locally (Offline)

You can run this app without an internet server:
- Simply double-click `index.html` to open it directly in Google Chrome, Microsoft Edge, Firefox, or Safari.
- Alternatively, run a lightweight local server:
  ```bash
  python -m http.server 8000
  ```
  and visit `http://localhost:8000`.

---

## 📁 Repository & Physical Folder Mapping

The tracker directly mirrors your local filesystem evidence repository folders created for NAAC Criterion VI:

```
NAAC – Criterion VI/
├── 6.1 Vision & Leadership/
│   ├── 6.1.1 Vision Mission/               [QlM - Weightage: 5]
│   └── 6.1.2 Decentralization/             [QlM - Weightage: 5]
├── 6.2 Strategy & Deployment/
│   ├── 6.2.1 Strategic Plan/               [QlM - Weightage: 5]
│   ├── 6.2.2 Institutional Bodies/         [QlM - Weightage: 5]
│   └── 6.2.3 E-Governance/                 [QnM - Weightage: 5]
├── 6.3 Faculty & Staff Empowerment/
│   ├── 6.3.1 Welfare/                      [QlM - Weightage: 5]
│   ├── 6.3.2 Financial Support/            [QnM - Weightage: 5]
│   ├── 6.3.3 Professional Development/     [QnM - Weightage: 5]
│   ├── 6.3.4 FDP Participation/            [QnM - Weightage: 7]
│   └── 6.3.5 Performance Appraisal/        [QlM - Weightage: 3]
├── 6.4 Financial Management/
│   ├── 6.4.1 Resource Mobilization/        [QlM - Weightage: 8]
│   ├── 6.4.2 Grants/                       [QnM - Weightage: 7]
│   └── 6.4.3 Financial Audit/              [QlM - Weightage: 5]
└── 6.5 IQAC/
    ├── 6.5.1 IQAC Mechanism/               [QlM - Weightage: 10]
    ├── 6.5.2 Quality Initiatives/          [QnM - Weightage: 10]
    └── 6.5.3 Impact Analysis/              [QlM - Weightage: 10]
```

---

## ✨ Features Included

1. **Evidence Repository Navigator**:
   - Interactive tree matching your local folder hierarchy.
   - 1-click **Copy Folder Path** button to paste directly into Windows Explorer (`Win + R` or File Explorer address bar).
   - Recommended standard NAAC file templates with 1-click quick logging.
   - Log evidence files with verification status: *Verified by IQAC*, *Ready for SSR*, *Under Review*, or *Draft*.
   - NAAC DVV (Data Validation and Verification) advice per metric.

2. **Interactive Gap Analysis Matrix (5-Year Cycle)**:
   - Covers 5 assessment years: `2021-22`, `2022-23`, `2023-24`, `2024-25`, and `2025-26`.
   - Click to cycle status: `Available` (Green) ➔ `Partial` (Amber) ➔ `Missing` (Red) ➔ `Pending` (Gray).
   - SSR document requirement checklists with completion percentage.
   - Inline editors for Responsible Department and Corrective Action Plans.
   - Dual view modes: **Card View** and **Compact Spreadsheet Table View**.

3. **Executive Analytics Dashboard**:
   - Key Indicator readiness radar / bar chart (6.1, 6.2, 6.3, 6.4, 6.5).
   - Overall metric implementation doughnut chart.
   - 5-Year compliance trend stacked chart.
   - High-Weightage Metric focus table highlighting key CGPA drivers (6.5.1 [10], 6.5.2 [10], 6.5.3 [10], 6.4.1 [8], 6.3.4 [7], 6.4.2 [7]).

4. **Data Portability & Reports**:
   - **Excel Export**: Generates an updated `.xlsx` spreadsheet with your latest statuses and notes.
   - **JSON Backup / Restore**: Export or import your work anytime.
   - **Print SSR Audit Report**: Clean, printer-friendly summary report for IQAC steering committee meetings.
   - **LocalStorage Auto-Save**: All changes are automatically saved in your browser.

5. **Multi-Criterion Support**:
   - Defaults to **Criterion VI (Governance)**, with full preloaded data for all NAAC Criteria (I to VII).

---

## 🛠️ Tech Stack
- **HTML5 & Vanilla JavaScript**: Zero runtime overhead, fast loading.
- **Tailwind CSS**: Modern institutional design with dark/light mode.
- **Chart.js**: Interactive executive charts.
- **SheetJS (xlsx)**: In-browser Excel workbook generation.
- **FontAwesome 6**: Rich iconography.
