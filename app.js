// NAAC Criterion VI - Evidence & Gap Analysis Tracker Application Logic

(function () {
  'use strict';

  const STORAGE_KEY = 'naac_tracker_data_v2';
  const SUBMISSION_STORAGE_KEY = 'naac_submission_docs_v2';
  const THEME_KEY = 'naac_tracker_theme';

  // 6 Academic Assessment Years (2020/21 to 2025-26)
  const ACADEMIC_YEARS = ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];

  // --- STATE ---
  let appData = {};
  let submissionDocs = [];
  let currentCriterionKey = 'Criterion VI';
  let activeMetricId = '6.1.1';
  let activeTab = 'folders'; // 'folders' | 'submission' | 'matrix' | 'analytics'
  let matrixViewMode = 'cards'; // 'cards' | 'table'
  let searchQuery = '';
  let filterIndicator = 'ALL';
  let filterStatus = 'ALL';
  let filterType = 'ALL';

  // Evidence Link Filter in Folder Workspace
  let evidenceLinkFilter = 'ALL'; // 'ALL' | 'WITH_LINK' | 'NO_LINK'
  let ssrDebounceTimer = null;

  // Submission filters
  let subFilterStatus = 'ALL'; // 'ALL' | 'DONT_HAVE' | 'HAVE'
  let subFilterDept = 'ALL';
  let subSearchQuery = '';

  // Chart instances
  let chartIndicator = null;
  let chartStatus = null;
  let chartFiveYear = null;

  // --- INITIALIZATION ---
  function init() {
    initTheme();
    loadData();
    loadSubmissionDocs();
    setupEventListeners();
    switchTab('folders'); // Default to folders view and render properly
  }

  // --- THEME MANAGEMENT ---
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    if (activeTab === 'analytics') {
      renderAnalytics();
    }
  }

  // --- DATA LOADING & PERSISTENCE ---
  function loadData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        appData = JSON.parse(stored);
      } catch (e) {
        console.error('Failed to parse saved data, loading defaults.', e);
        appData = JSON.parse(JSON.stringify(window.DEFAULT_NAAC_DATA || {}));
      }
    } else {
      appData = JSON.parse(JSON.stringify(window.DEFAULT_NAAC_DATA || {}));
    }

    const starterTemplates = window.NAAC_QLM_STARTER_TEMPLATES || {};

    // Ensure all metrics have 2020-21 through 2025-26, and initialize QlM drafts
    for (const cKey in appData) {
      if (appData[cKey] && appData[cKey].metrics) {
        appData[cKey].metrics.forEach(m => {
          if (!m.years) m.years = {};
          ACADEMIC_YEARS.forEach(yr => {
            if (!m.years[yr]) m.years[yr] = 'Pending';
          });

          // Ensure ssrTemplate and ssrDraft for QlM metrics
          if (starterTemplates[m.id]) {
            if (!m.ssrTemplate) m.ssrTemplate = starterTemplates[m.id];
            if (!m.ssrDraft) m.ssrDraft = starterTemplates[m.id];
          }
        });
      }
    }

    if (!appData[currentCriterionKey]) {
      const keys = Object.keys(appData);
      if (keys.length > 0) currentCriterionKey = keys[0];
    }

    const currentMetrics = getActiveMetrics();
    if (currentMetrics.length > 0 && !currentMetrics.find(m => m.id === activeMetricId)) {
      activeMetricId = currentMetrics[0].id;
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
      showToast('Local storage limit exceeded or blocked.', 'error');
    }
    updateExecutiveKPIs();
  }

  function loadSubmissionDocs() {
    const stored = localStorage.getItem(SUBMISSION_STORAGE_KEY);
    if (stored) {
      try {
        submissionDocs = JSON.parse(stored);
      } catch (e) {
        submissionDocs = JSON.parse(JSON.stringify(window.CRITERION_VI_SPECIFIC_DOCS || []));
      }
    } else {
      submissionDocs = JSON.parse(JSON.stringify(window.CRITERION_VI_SPECIFIC_DOCS || []));
    }

    // Ensure link and faculty fields exist
    submissionDocs.forEach(d => {
      if (typeof d.driveUrl === 'undefined') d.driveUrl = '';
      if (typeof d.assignedFaculty === 'undefined') d.assignedFaculty = '';
    });
  }

  function saveSubmissionDocs() {
    try {
      localStorage.setItem(SUBMISSION_STORAGE_KEY, JSON.stringify(submissionDocs));
    } catch (e) {
      console.error('Failed to save submission docs:', e);
    }
    updateSubmissionCounters();
  }

  function getActiveCriterion() {
    return appData[currentCriterionKey] || { title: currentCriterionKey, metrics: [] };
  }

  function getActiveMetrics() {
    return getActiveCriterion().metrics || [];
  }

  function getActiveMetric() {
    const metrics = getActiveMetrics();
    return metrics.find(m => m.id === activeMetricId) || metrics[0] || null;
  }

  // --- EXECUTIVE KPIS & CALCULATIONS ---
  function updateExecutiveKPIs() {
    const metrics = getActiveMetrics();
    const totalMetrics = metrics.length;
    let totalWeightage = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let totalFiles = 0;
    let gapsCount = 0;
    let readinessWeightedScore = 0;

    metrics.forEach(m => {
      const weight = parseFloat(m.weightage) || 0;
      totalWeightage += weight;

      if (m.status === 'Completed') completedCount++;
      else if (m.status === 'In Progress' || m.status === 'Under Review') inProgressCount++;

      const filesCount = (m.evidenceFiles || []).length;
      totalFiles += filesCount;

      const years = m.years || {};
      const yearVals = ACADEMIC_YEARS.map(yr => years[yr] || 'Pending');
      const availableYears = yearVals.filter(v => v === 'Available').length;
      const missingYears = yearVals.filter(v => v === 'Missing').length;

      if (missingYears > 0 || m.status === 'Not Started') {
        gapsCount++;
      }

      const checklist = m.checklist || [];
      const checkedCount = checklist.filter(c => c.status === 'Available').length;
      const checklistRatio = checklist.length > 0 ? (checkedCount / checklist.length) : 0.5;
      const yearsRatio = yearVals.length > 0 ? (availableYears / yearVals.length) : 0.5;
      const filesBonus = filesCount > 0 ? 0.2 : 0;

      let metricReadiness = (checklistRatio * 0.4) + (yearsRatio * 0.4) + filesBonus;
      if (m.status === 'Completed') metricReadiness = 1.0;
      if (metricReadiness > 1.0) metricReadiness = 1.0;

      readinessWeightedScore += (metricReadiness * weight);
    });

    const overallReadinessPercent = totalWeightage > 0 
      ? Math.round((readinessWeightedScore / totalWeightage) * 100) 
      : 0;

    const elWeightage = document.getElementById('stat-weightage');
    const elReadinessPct = document.getElementById('stat-readiness-percent');
    const elReadinessBar = document.getElementById('stat-readiness-bar');
    const elCompleted = document.getElementById('stat-completed-count');
    const elInProgress = document.getElementById('stat-inprogress-count');
    const elTotalCount = document.getElementById('stat-total-count');
    const elFiles = document.getElementById('stat-files-count');
    const elGaps = document.getElementById('stat-gaps-count');
    const elTreeCount = document.getElementById('tree-folders-count');

    if (elWeightage) elWeightage.textContent = totalWeightage || 100;
    if (elReadinessPct) elReadinessPct.textContent = `${overallReadinessPercent}%`;
    if (elReadinessBar) elReadinessBar.style.width = `${overallReadinessPercent}%`;
    if (elCompleted) elCompleted.textContent = completedCount;
    if (elInProgress) elInProgress.textContent = inProgressCount;
    if (elTotalCount) elTotalCount.textContent = totalMetrics;
    if (elFiles) elFiles.textContent = `${totalFiles} Files`;
    if (elGaps) elGaps.textContent = `${gapsCount} Items`;
    if (elTreeCount) elTreeCount.textContent = `${totalMetrics} Folders`;

    updateSubmissionCounters();
  }

  function updateSubmissionCounters() {
    const total = submissionDocs.length;
    const haveCount = submissionDocs.filter(d => d.status === 'HAVE').length;
    const dontHaveCount = total - haveCount;
    const readiness = total > 0 ? Math.round((haveCount / total) * 100) : 0;

    const elTotal = document.getElementById('sub-total-count');
    const elHave = document.getElementById('sub-have-count');
    const elDontHave = document.getElementById('sub-dont-have-count');
    const elPercent = document.getElementById('sub-readiness-percent');

    if (elTotal) elTotal.textContent = total;
    if (elHave) elHave.textContent = haveCount;
    if (elDontHave) elDontHave.textContent = dontHaveCount;
    if (elPercent) elPercent.textContent = `${readiness}%`;
  }

  // --- RENDER DISPATCHER ---
  function renderAll() {
    updateExecutiveKPIs();
    if (activeTab === 'folders') {
      renderFolderTree();
      renderFolderWorkspace();
    } else if (activeTab === 'submission') {
      renderSubmissionAudit();
    } else if (activeTab === 'matrix') {
      renderGapMatrix();
    } else if (activeTab === 'analytics') {
      renderAnalytics();
    }
  }

  // --- VIEW 1: EVIDENCE REPOSITORY (FOLDER TREE & WORKSPACE) ---
  function renderFolderTree() {
    const container = document.getElementById('folder-tree-container');
    if (!container) return;

    const metrics = getActiveMetrics();

    // Group metrics by Key Indicator
    const groups = {};
    metrics.forEach(m => {
      const ki = m.keyIndicator || 'General';
      if (!groups[ki]) groups[ki] = [];
      groups[ki].push(m);
    });

    let html = '';
    for (const [ki, items] of Object.entries(groups)) {
      const shortKi = ki.replace(/Key Indicator\s*/i, '').trim();

      html += `
        <div class="mb-3">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 flex items-center justify-between">
            <span class="truncate" title="${escapeHtml(shortKi)}">${escapeHtml(shortKi)}</span>
            <span class="text-[10px] font-mono font-normal">(${items.length} Folders)</span>
          </div>
          <div class="space-y-1 mt-1 pl-1">
      `;

      items.forEach(item => {
        const isActive = item.id === activeMetricId;
        const fileCount = (item.evidenceFiles || []).length;
        
        let statusDotColor = 'bg-slate-300 dark:bg-slate-600';
        if (item.status === 'Completed') statusDotColor = 'bg-emerald-500';
        else if (item.status === 'In Progress') statusDotColor = 'bg-amber-500';
        else if (item.status === 'Under Review') statusDotColor = 'bg-blue-500';

        const folderDisplayName = item.folder 
          ? item.folder.split('/').pop() 
          : `${item.metricNo} Evidence`;

        // Check how many years are marked available
        const my = item.years || {};
        const haveYearsCount = ACADEMIC_YEARS.filter(yr => my[yr] === 'Available').length;

        html += `
          <button data-metric-id="${item.id}" class="folder-tree-item w-full text-left px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition group ${
            isActive
              ? 'bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-500/20'
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
          }">
            <div class="flex items-center space-x-2 truncate">
              <span class="w-2 h-2 rounded-full ${statusDotColor} flex-shrink-0"></span>
              <i class="fa-solid fa-folder text-xs ${isActive ? 'text-indigo-200' : 'text-amber-500'} flex-shrink-0"></i>
              <span class="truncate">${escapeHtml(folderDisplayName)}</span>
            </div>
            <div class="flex items-center space-x-1.5 flex-shrink-0 ml-1">
              <span class="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                haveYearsCount === ACADEMIC_YEARS.length
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  : haveYearsCount > 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
              }">${haveYearsCount}/6 Yrs</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded font-mono ${
                isActive ? 'bg-indigo-700/80 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }">${fileCount}</span>
            </div>
          </button>
        `;
      });

      html += `
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    container.querySelectorAll('.folder-tree-item').forEach(btn => {
      btn.addEventListener('click', () => {
        activeMetricId = btn.getAttribute('data-metric-id');
        renderFolderTree();
        renderFolderWorkspace();
      });
    });
  }

  function renderFolderWorkspace() {
    const container = document.getElementById('folder-workspace-container');
    if (!container) return;

    const metric = getActiveMetric();
    if (!metric) {
      container.innerHTML = `<div class="p-8 text-center text-slate-400">Select a folder from the hierarchy to view details</div>`;
      return;
    }

    const folderRelative = metric.folder || `${metric.metricNo} Evidence`;
    const folderWindowsPath = `NAAC – Criterion VI\\${folderRelative.replace(/\//g, '\\')}`;
    const allFiles = metric.evidenceFiles || [];
    const checklist = metric.checklist || [];
    const suggestedFiles = metric.suggestedFiles || [];
    const isQualitative = (metric.metricType || 'QlM') === 'QlM';
    const my = metric.years || {};

    // Cloud link calculations
    const withLinkCount = allFiles.filter(f => f.driveUrl && f.driveUrl.trim()).length;
    const noLinkCount = allFiles.length - withLinkCount;

    // Filter files based on evidenceLinkFilter
    let displayedFiles = allFiles;
    if (evidenceLinkFilter === 'WITH_LINK') {
      displayedFiles = allFiles.filter(f => f.driveUrl && f.driveUrl.trim());
    } else if (evidenceLinkFilter === 'NO_LINK') {
      displayedFiles = allFiles.filter(f => !f.driveUrl || !f.driveUrl.trim());
    }

    // SSR Draft word count info
    const wordInfo = getWordCountInfo(metric.ssrDraft || '');

    container.innerHTML = `
      <!-- Folder Header Card -->
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-center space-x-3">
            <div class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-2xl shadow-sm">
              <i class="fa-solid fa-folder-open"></i>
            </div>
            <div>
              <div class="flex items-center space-x-2">
                <h2 class="text-lg font-bold text-slate-900 dark:text-white leading-tight">Metric ${escapeHtml(metric.metricNo)}</h2>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isQualitative 
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' 
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                }">
                  ${metric.metricType || 'QlM'} (${isQualitative ? 'Qualitative' : 'Quantitative'})
                </span>
                <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  Weightage: ${escapeHtml(metric.weightage || '-')}
                </span>
              </div>
              <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                ${escapeHtml(metric.keyIndicator || '')}
              </div>
            </div>
          </div>

          <!-- Status Selector -->
          <div class="flex items-center space-x-2">
            <label class="text-xs font-medium text-slate-500">Overall Status:</label>
            <select id="select-active-status" class="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500">
              <option value="Not Started" ${metric.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
              <option value="In Progress" ${metric.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Under Review" ${metric.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
              <option value="Completed" ${metric.status === 'Completed' ? 'selected' : ''}>Completed / Ready</option>
            </select>
          </div>
        </div>

        <!-- Metric Description -->
        <p class="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
          ${escapeHtml(metric.indicator || '')}
        </p>

        <!-- SCSA Department Evidence Collection Mandate -->
        ${metric.scsaCollect ? `
          <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800/90 dark:to-indigo-950/50 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/70 p-4 shadow-sm space-y-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center space-x-2">
                <span class="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide bg-indigo-600 text-white shadow-xs">
                  SCSA Department Mandate
                </span>
                <span class="text-xs font-bold text-indigo-950 dark:text-indigo-200">Evidence Required from SCSA</span>
              </div>
              <span class="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center space-x-1">
                <i class="fa-solid fa-user-tie text-[10px]"></i>
                <span>Primary Source: ${escapeHtml(metric.scsaSource || 'SCSA')}</span>
              </span>
            </div>
            <div class="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed bg-white/90 dark:bg-slate-900/80 p-3 rounded-xl border border-indigo-100 dark:border-slate-800">
              <div class="text-[11px] uppercase tracking-wider text-indigo-600 dark:text-indigo-400 font-bold mb-1">What SCSA should collect:</div>
              <div>${escapeHtml(metric.scsaCollect)}</div>
            </div>
          </div>
        ` : ''}

        <!-- Windows Explorer Main Folder Path -->
        <div class="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-300 overflow-hidden">
          <div class="flex items-center space-x-2 truncate mr-2">
            <i class="fa-brands fa-windows text-indigo-500"></i>
            <span class="truncate">${escapeHtml(folderWindowsPath)}</span>
          </div>
          <button id="btn-copy-folder-path" data-path="${escapeHtml(folderWindowsPath)}" class="px-2.5 py-1 bg-white dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-600 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-sans font-semibold shadow-xs transition flex items-center space-x-1 flex-shrink-0">
            <i class="fa-regular fa-copy"></i>
            <span>Copy Main Path</span>
          </button>
        </div>
      </div>

      <!-- FEATURE 1: QUALITATIVE METRIC (QlM) 500-WORD SSR DRAFT EDITOR -->
      ${isQualitative ? `
        <div class="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 dark:from-slate-850 dark:via-purple-950/30 dark:to-slate-850 rounded-2xl border-2 border-purple-200 dark:border-purple-800/60 p-5 shadow-sm space-y-3.5">
          
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center space-x-2.5">
              <div class="w-9 h-9 rounded-xl bg-purple-600 text-white flex items-center justify-center text-base shadow-sm shadow-purple-500/30">
                <i class="fa-solid fa-file-pen"></i>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-white">Qualitative SSR Draft Response (500 Words Limit)</h3>
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-200 text-purple-900 dark:bg-purple-900/60 dark:text-purple-200">
                    NAAC SSR Portal
                  </span>
                </div>
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Strict portal constraint: 500 words maximum. Real-time counter monitors compliance.</p>
              </div>
            </div>

            <!-- Live Word Count Badge -->
            <div class="flex items-center space-x-2">
              <span id="ssr-word-badge" class="px-3 py-1.5 rounded-xl text-xs font-mono font-bold shadow-xs transition-all ${wordInfo.badgeClass}">
                ${wordInfo.badgeLabel}
              </span>
              <span id="ssr-char-badge" class="text-[11px] font-mono text-slate-500 dark:text-slate-400 hidden sm:inline">
                ${wordInfo.chars} chars • ${wordInfo.readingTime}
              </span>
            </div>
          </div>

          <!-- Action Bar for SSR Editor -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-purple-200/60 dark:border-purple-900/40">
            <div class="flex flex-wrap items-center gap-2">
              <button id="btn-insert-ssr-template" class="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5">
                <i class="fa-solid fa-wand-magic-sparkles text-amber-300"></i>
                <span>Insert SCSA Starter Template</span>
              </button>
              <button id="btn-copy-ssr-draft" class="px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-purple-50 dark:hover:bg-slate-600 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5">
                <i class="fa-regular fa-copy"></i>
                <span>Copy for SSR Portal</span>
              </button>
              <button id="btn-save-ssr-draft" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5">
                <i class="fa-solid fa-floppy-disk"></i>
                <span>Save Draft</span>
              </button>
            </div>

            <div class="flex items-center space-x-1.5">
              <button id="btn-download-ssr-draft" class="px-2.5 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 transition flex items-center space-x-1" title="Download draft as .txt">
                <i class="fa-solid fa-download"></i>
                <span class="hidden sm:inline">Export</span>
              </button>
              <button id="btn-clear-ssr-draft" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg text-xs transition" title="Clear Draft">
                <i class="fa-regular fa-trash-can text-sm"></i>
              </button>
            </div>
          </div>

          <!-- Draft Textarea -->
          <div class="relative">
            <textarea id="ssr-draft-textarea" rows="11" placeholder="Type your 500-word qualitative SSR draft response here, or click 'Insert SCSA Starter Template' above for pre-crafted, high-scoring narrative..." class="w-full p-3.5 rounded-xl font-sans text-xs sm:text-sm leading-relaxed bg-white dark:bg-slate-900 border border-purple-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-inner">${escapeHtml(metric.ssrDraft || '')}</textarea>
          </div>

          <!-- Bottom Status Bar -->
          <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <div class="flex items-center space-x-1.5" id="ssr-save-status">
              <i class="fa-solid fa-cloud-arrow-up text-emerald-500"></i>
              <span>Auto-saved locally in browser storage</span>
            </div>
            <div class="text-[11px] italic text-slate-400">
              Optimal target: 320 to 460 words for maximum peer review impact.
            </div>
          </div>

        </div>
      ` : ''}

      <!-- YEAR-WISE MARKING MATRIX (2020/21 TO 2025-26) -->
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 class="font-bold text-sm text-slate-900 dark:text-white flex items-center space-x-2">
              <i class="fa-solid fa-calendar-check text-indigo-600"></i>
              <span>Year-Wise Evidence Audit (2020/21 to 2025-26)</span>
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Click the button for each academic year to toggle between <strong>WE HAVE</strong> and <strong>WE DON'T HAVE</strong>.
            </p>
          </div>
          <span class="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
            ${ACADEMIC_YEARS.filter(yr => my[yr] === 'Available').length} / 6 Years Complete
          </span>
        </div>

        <!-- 6-Year Interactive Table -->
        <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th class="py-2.5 px-3">Academic Year</th>
                <th class="py-2.5 px-3">Status</th>
                <th class="py-2.5 px-3">Physical Local Folder on Machine</th>
                <th class="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${ACADEMIC_YEARS.map(yr => {
                const status = my[yr] || 'Pending';
                const isHave = status === 'Available';
                const yrPath = `${folderWindowsPath}\\${yr}`;

                return `
                  <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td class="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                      <span class="w-2.5 h-2.5 rounded-full ${isHave ? 'bg-emerald-500' : 'bg-rose-500'}"></span>
                      <span>${yr}</span>
                    </td>
                    <td class="py-2.5 px-3">
                      <button data-yr-toggle="${yr}" class="btn-toggle-year-status px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs ${
                        isHave
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 hover:bg-emerald-200'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300 hover:bg-rose-200'
                      }">
                        <i class="fa-solid ${isHave ? 'fa-circle-check text-emerald-600' : 'fa-circle-xmark text-rose-600'}"></i>
                        <span>${isHave ? 'WE HAVE (AVAILABLE)' : 'WE DON\'T HAVE (GAP)'}</span>
                      </button>
                    </td>
                    <td class="py-2.5 px-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[280px]" title="${escapeHtml(yrPath)}">
                      ${escapeHtml(yrPath)}
                    </td>
                    <td class="py-2.5 px-3 text-right">
                      <button data-copy-yr-path="${escapeHtml(yrPath)}" class="btn-copy-yr-path px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 dark:text-slate-300 text-[11px] font-medium transition" title="Copy Year Subfolder Path">
                        <i class="fa-regular fa-copy mr-1"></i> Copy Path
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Official Documents Required (Checklist) -->
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-clipboard-check text-indigo-600"></i>
            <h3 class="font-bold text-sm text-slate-900 dark:text-white">Required Evidence Documents (SSR Manual)</h3>
          </div>
          <span class="text-xs text-slate-400 font-mono">
            ${checklist.filter(c => c.status === 'Available').length}/${checklist.length} Verified
          </span>
        </div>

        <div class="space-y-2">
          ${checklist.length > 0 ? checklist.map((item, idx) => `
            <label class="flex items-start space-x-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition">
              <input type="checkbox" data-check-idx="${idx}" ${item.status === 'Available' ? 'checked' : ''} class="checklist-toggle mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4 border-slate-300 dark:border-slate-700" />
              <div class="text-xs text-slate-700 dark:text-slate-200 flex-1 leading-relaxed">
                ${escapeHtml(item.name)}
              </div>
            </label>
          `).join('') : `
            <div class="text-xs text-slate-400 italic">No explicit checklist provided in SSR manual for this metric. Refer to institutional SOP.</div>
          `}
        </div>

        ${metric.dvvTip ? `
          <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
            <i class="fa-solid fa-lightbulb text-amber-600 text-sm mt-0.5"></i>
            <div>
              <strong>NAAC DVV Advisory:</strong> ${escapeHtml(metric.dvvTip)}
            </div>
          </div>
        ` : ''}
      </div>

      <!-- Suggested NAAC Files (1-Click Quick Add) -->
      ${suggestedFiles.length > 0 ? `
        <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <i class="fa-solid fa-wand-magic-sparkles text-amber-500"></i>
              <h3 class="font-bold text-sm text-slate-900 dark:text-white">Recommended Standard Files</h3>
            </div>
            <span class="text-xs text-slate-400">1-click log to repository</span>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${suggestedFiles.map(file => {
              const alreadyLogged = allFiles.some(f => f.name === file);
              return `
                <div class="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs">
                  <div class="flex items-center space-x-2 truncate mr-2">
                    <i class="fa-solid fa-file-pdf text-rose-500"></i>
                    <span class="truncate font-mono text-[11px] text-slate-800 dark:text-slate-200">${escapeHtml(file)}</span>
                  </div>
                  ${alreadyLogged ? `
                    <span class="text-[10px] text-emerald-600 font-semibold flex items-center space-x-1 flex-shrink-0">
                      <i class="fa-solid fa-check"></i>
                      <span>Logged</span>
                    </span>
                  ` : `
                    <button data-quick-file="${escapeHtml(file)}" class="btn-quick-log px-2 py-1 bg-white dark:bg-slate-700 hover:bg-indigo-50 text-indigo-600 dark:text-indigo-300 font-semibold rounded text-[11px] shadow-xs transition flex-shrink-0">
                      + Log
                    </button>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- FEATURE 4: LOGGED EVIDENCE FILES & CLOUD DRIVE LINK MANAGER -->
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="flex items-center space-x-2">
              <i class="fa-solid fa-folder-closed text-indigo-600"></i>
              <h3 class="font-bold text-sm text-slate-900 dark:text-white">Logged Evidence in Folder (${allFiles.length})</h3>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cloud Drive coverage: <strong>${withLinkCount} of ${allFiles.length} files linked</strong> (${allFiles.length > 0 ? Math.round((withLinkCount / allFiles.length) * 100) : 0}%)
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- Filter chips for cloud links -->
            <div class="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs">
              <button data-link-filter="ALL" class="btn-link-filter px-2.5 py-1 rounded-lg font-semibold transition ${
                evidenceLinkFilter === 'ALL'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }">
                All (${allFiles.length})
              </button>
              <button data-link-filter="WITH_LINK" class="btn-link-filter px-2.5 py-1 rounded-lg font-semibold transition ${
                evidenceLinkFilter === 'WITH_LINK'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }">
                ☁️ Linked (${withLinkCount})
              </button>
              <button data-link-filter="NO_LINK" class="btn-link-filter px-2.5 py-1 rounded-lg font-semibold transition ${
                evidenceLinkFilter === 'NO_LINK'
                  ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }">
                ⚠️ Missing (${noLinkCount})
              </button>
            </div>

            <button id="btn-open-file-modal" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5">
              <i class="fa-solid fa-plus"></i>
              <span>Log Document</span>
            </button>
          </div>
        </div>

        <!-- Progress bar for Cloud Link coverage -->
        <div class="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
          <div class="bg-blue-500 h-full rounded-full transition-all duration-300" style="width: ${allFiles.length > 0 ? (withLinkCount / allFiles.length) * 100 : 0}%"></div>
        </div>

        <!-- Files list -->
        <div class="space-y-2.5">
          ${displayedFiles.length > 0 ? displayedFiles.map(file => {
            const originalIdx = allFiles.indexOf(file);
            const hasDrive = Boolean(file.driveUrl && file.driveUrl.trim());

            return `
              <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition gap-2.5 bg-white dark:bg-slate-850">
                
                <div class="flex items-start space-x-3 truncate">
                  <div class="w-9 h-9 rounded-xl ${hasDrive ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'} flex items-center justify-center text-sm flex-shrink-0 mt-0.5">
                    <i class="${hasDrive ? 'fa-brands fa-google-drive text-base text-amber-500' : 'fa-solid fa-file-lines'}"></i>
                  </div>
                  
                  <div class="truncate">
                    <div class="flex items-center space-x-2 truncate">
                      <span class="font-medium text-xs text-slate-900 dark:text-white truncate font-mono">${escapeHtml(file.name)}</span>
                      ${file.docCategory ? `
                        <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex-shrink-0">
                          ${escapeHtml(file.docCategory)}
                        </span>
                      ` : ''}
                    </div>

                    <div class="text-[11px] text-slate-400 flex flex-wrap items-center gap-1.5 mt-1">
                      <span class="font-semibold text-indigo-600 dark:text-indigo-400">${escapeHtml(file.year || '2020-21')}</span>
                      <span>&bull;</span>
                      ${file.assignedFaculty ? `
                        <span class="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold text-[10px] flex items-center space-x-1 border border-indigo-100 dark:border-indigo-800">
                          <i class="fa-solid fa-user-tie text-[9px]"></i>
                          <span>${escapeHtml(file.assignedFaculty)}</span>
                        </span>
                        <span>&bull;</span>
                      ` : ''}
                      <span class="truncate max-w-[240px] text-slate-500 dark:text-slate-400">${escapeHtml(file.notes || 'Evidence proof')}</span>
                    </div>
                  </div>
                </div>

                <div class="flex items-center space-x-2 flex-shrink-0 self-end sm:self-auto">
                  ${hasDrive ? `
                    <a href="${escapeHtml(file.driveUrl)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 dark:hover:bg-blue-900/60 rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition" title="Open Cloud Document">
                      <i class="fa-brands fa-google-drive text-amber-500"></i>
                      <span>Open Evidence</span>
                      <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                    </a>
                    <button data-copy-link="${escapeHtml(file.driveUrl)}" class="btn-copy-file-link p-1.5 text-slate-400 hover:text-blue-600 transition" title="Copy Cloud Drive URL">
                      <i class="fa-regular fa-copy text-xs"></i>
                    </button>
                  ` : `
                    <button data-edit-file-idx="${originalIdx}" class="btn-edit-file px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 rounded-lg text-xs font-semibold flex items-center space-x-1 transition shadow-xs" title="Attach Google Drive Link">
                      <i class="fa-solid fa-link text-amber-500"></i>
                      <span>+ Attach Link</span>
                    </button>
                  `}

                  <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${
                    file.status === 'Verified by IQAC' || file.status === 'Ready for SSR'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                  }">
                    ${escapeHtml(file.status || 'Draft')}
                  </span>

                  <button data-edit-file-idx="${originalIdx}" class="btn-edit-file p-1.5 text-slate-400 hover:text-indigo-600 transition" title="Edit Evidence & Link">
                    <i class="fa-regular fa-pen-to-square text-xs"></i>
                  </button>
                  <button data-delete-file-idx="${originalIdx}" class="btn-delete-file p-1.5 text-slate-400 hover:text-rose-600 transition" title="Remove File Entry">
                    <i class="fa-regular fa-trash-can text-xs"></i>
                  </button>
                </div>

              </div>
            `;
          }).join('') : `
            <div class="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center text-slate-400">
              <i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 text-slate-300 dark:text-slate-600"></i>
              <p class="text-xs font-medium text-slate-600 dark:text-slate-300">
                ${allFiles.length > 0 ? 'No documents match the current link filter' : 'No individual documents logged yet in this folder'}
              </p>
              <p class="text-[11px] text-slate-400 mt-1">Copy files into your local directory: <code class="font-mono">${escapeHtml(folderWindowsPath)}</code>, then log or paste drive links above.</p>
            </div>
          `}
        </div>

      </div>
    `;

    // Event listeners inside workspace
    const statusSelect = document.getElementById('select-active-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        metric.status = e.target.value;
        saveData();
        renderFolderTree();
        showToast(`Metric ${metric.metricNo} status updated to ${metric.status}`);
      });
    }

    const btnCopyPath = document.getElementById('btn-copy-folder-path');
    if (btnCopyPath) {
      btnCopyPath.addEventListener('click', () => {
        const path = btnCopyPath.getAttribute('data-path');
        copyToClipboard(path, 'Folder path copied to clipboard! Paste into Windows Explorer.');
      });
    }

    // Toggle year status directly
    container.querySelectorAll('.btn-toggle-year-status').forEach(btn => {
      btn.addEventListener('click', () => {
        const yr = btn.getAttribute('data-yr-toggle');
        if (!metric.years) metric.years = {};
        const current = metric.years[yr];
        metric.years[yr] = (current === 'Available') ? 'Missing' : 'Available';
        saveData();
        renderFolderWorkspace();
        renderFolderTree();
        showToast(`Year ${yr} marked as ${metric.years[yr] === 'Available' ? 'WE HAVE' : 'WE DON\'T HAVE'}`);
      });
    });

    // Copy year subfolder path
    container.querySelectorAll('.btn-copy-yr-path').forEach(btn => {
      btn.addEventListener('click', () => {
        const path = btn.getAttribute('data-copy-yr-path');
        copyToClipboard(path, 'Year subfolder path copied to clipboard!');
      });
    });

    // Checklist toggles
    container.querySelectorAll('.checklist-toggle').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const idx = parseInt(e.target.getAttribute('data-check-idx'), 10);
        if (metric.checklist && metric.checklist[idx]) {
          metric.checklist[idx].status = e.target.checked ? 'Available' : 'Pending';
          saveData();
          renderFolderWorkspace();
        }
      });
    });

    // Quick log suggested files
    container.querySelectorAll('.btn-quick-log').forEach(btn => {
      btn.addEventListener('click', () => {
        const fileName = btn.getAttribute('data-quick-file');
        if (!metric.evidenceFiles) metric.evidenceFiles = [];
        metric.evidenceFiles.push({
          name: fileName,
          year: '2020-21',
          status: 'Ready for SSR',
          notes: 'Standard NAAC documentary proof',
          docCategory: 'Policy & SOP'
        });
        saveData();
        renderFolderWorkspace();
        renderFolderTree();
        showToast(`Logged ${fileName} to ${metric.metricNo}`);
      });
    });

    // Link filter buttons
    container.querySelectorAll('.btn-link-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        evidenceLinkFilter = btn.getAttribute('data-link-filter');
        renderFolderWorkspace();
      });
    });

    // Edit file / Attach Link
    container.querySelectorAll('.btn-edit-file').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-edit-file-idx'), 10);
        openAddFileModal(idx);
      });
    });

    // Copy cloud link
    container.querySelectorAll('.btn-copy-file-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const link = btn.getAttribute('data-copy-link');
        copyToClipboard(link, 'Cloud Drive URL copied to clipboard!');
      });
    });

    // Delete logged file
    container.querySelectorAll('.btn-delete-file').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-delete-file-idx'), 10);
        if (metric.evidenceFiles && metric.evidenceFiles[idx]) {
          const removedName = metric.evidenceFiles[idx].name;
          if (confirm(`Remove "${removedName}" from logged evidence?`)) {
            metric.evidenceFiles.splice(idx, 1);
            saveData();
            renderFolderWorkspace();
            renderFolderTree();
            showToast('Evidence document removed from log');
          }
        }
      });
    });

    const btnOpenFileModal = document.getElementById('btn-open-file-modal');
    if (btnOpenFileModal) {
      btnOpenFileModal.addEventListener('click', () => {
        openAddFileModal();
      });
    }

    // SSR Draft Editor Event Listeners
    if (isQualitative) {
      const ta = document.getElementById('ssr-draft-textarea');
      const wordBadge = document.getElementById('ssr-word-badge');
      const charBadge = document.getElementById('ssr-char-badge');
      const saveStatus = document.getElementById('ssr-save-status');

      if (ta) {
        ta.addEventListener('input', () => {
          const text = ta.value;
          const info = getWordCountInfo(text);

          if (wordBadge) {
            wordBadge.className = `px-3 py-1.5 rounded-xl text-xs font-mono font-bold shadow-xs transition-all ${info.badgeClass}`;
            wordBadge.textContent = info.badgeLabel;
          }

          if (charBadge) {
            charBadge.textContent = `${info.chars} chars • ${info.readingTime}`;
          }

          if (saveStatus) {
            saveStatus.innerHTML = `<i class="fa-solid fa-pen-nib text-amber-500"></i><span>Typing...</span>`;
          }

          // Debounced auto-save (400ms)
          clearTimeout(ssrDebounceTimer);
          ssrDebounceTimer = setTimeout(() => {
            metric.ssrDraft = text;
            saveData();
            if (saveStatus) {
              saveStatus.innerHTML = `<i class="fa-solid fa-cloud-arrow-up text-emerald-500"></i><span>Auto-saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
            }
          }, 400);
        });
      }

      // Insert SCSA Starter Template
      const btnInsertTemplate = document.getElementById('btn-insert-ssr-template');
      if (btnInsertTemplate) {
        btnInsertTemplate.addEventListener('click', () => {
          const starterTemplates = window.NAAC_QLM_STARTER_TEMPLATES || {};
          const template = starterTemplates[metric.id] || metric.ssrTemplate || '';
          if (!template) {
            showToast('No specific template found for this metric.', 'warning');
            return;
          }

          if (ta && ta.value.trim() && ta.value.trim() !== template.trim()) {
            if (!confirm('Replace your current draft with the official SCSA starter template?')) {
              return;
            }
          }

          metric.ssrDraft = template;
          if (ta) ta.value = template;
          saveData();
          renderFolderWorkspace();
          showToast(`SCSA Starter Template inserted for Metric ${metric.metricNo}!`);
        });
      }

      // Copy for SSR Portal
      const btnCopySsr = document.getElementById('btn-copy-ssr-draft');
      if (btnCopySsr) {
        btnCopySsr.addEventListener('click', () => {
          const text = (ta ? ta.value : (metric.ssrDraft || '')).trim();
          if (!text) {
            showToast('SSR Draft is currently empty.', 'warning');
            return;
          }
          const info = getWordCountInfo(text);
          copyToClipboard(text, `Copied ${info.words} words! Ready to paste into NAAC SSR Portal.`);
        });
      }

      // Save Draft explicitly
      const btnSaveSsr = document.getElementById('btn-save-ssr-draft');
      if (btnSaveSsr) {
        btnSaveSsr.addEventListener('click', () => {
          if (ta) metric.ssrDraft = ta.value;
          saveData();
          const info = getWordCountInfo(metric.ssrDraft);
          showToast(`Draft saved (${info.words} words)`);
        });
      }

      // Download single metric SSR draft
      const btnDownloadSsr = document.getElementById('btn-download-ssr-draft');
      if (btnDownloadSsr) {
        btnDownloadSsr.addEventListener('click', () => {
          const text = (ta ? ta.value : (metric.ssrDraft || '')).trim();
          const info = getWordCountInfo(text);
          const fullDoc = `========================================================================
NAAC CRITERION VI - QUALITATIVE METRIC RESPONSE (QlM)
Metric: ${metric.metricNo} (${metric.weightage || ''} Marks)
Indicator: ${metric.indicator || ''}
Word Count: ${info.words} / 500 Words
========================================================================

${text}

========================================================================
Exported from NAAC Criterion VI & SCSA Evidence Tracker
Date: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}
========================================================================`;
          downloadTextFile(`NAAC_Metric_${metric.metricNo}_SSR_Draft.txt`, fullDoc);
          showToast(`Downloaded Metric ${metric.metricNo} SSR draft`);
        });
      }

      // Clear draft
      const btnClearSsr = document.getElementById('btn-clear-ssr-draft');
      if (btnClearSsr) {
        btnClearSsr.addEventListener('click', () => {
          if (confirm(`Clear draft write-up for Metric ${metric.metricNo}?`)) {
            metric.ssrDraft = '';
            if (ta) ta.value = '';
            saveData();
            renderFolderWorkspace();
            showToast('Draft cleared');
          }
        });
      }
    }
  }

  // --- VIEW 2: GAP ANALYSIS & 6-YEAR MATRIX ---
  function renderGapMatrix() {
    const container = document.getElementById('matrix-items-container');
    if (!container) return;

    let metrics = getActiveMetrics();

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      metrics = metrics.filter(m => 
        m.metricNo.toLowerCase().includes(q) ||
        (m.indicator || '').toLowerCase().includes(q) ||
        (m.responsible || '').toLowerCase().includes(q) ||
        (m.gapRemarks || '').toLowerCase().includes(q) ||
        (m.docsRequiredRaw || '').toLowerCase().includes(q)
      );
    }

    if (filterIndicator !== 'ALL') {
      metrics = metrics.filter(m => m.metricNo.startsWith(filterIndicator));
    }

    if (filterStatus !== 'ALL') {
      metrics = metrics.filter(m => m.status === filterStatus);
    }

    if (filterType !== 'ALL') {
      metrics = metrics.filter(m => (m.metricType || 'QlM') === filterType);
    }

    if (metrics.length === 0) {
      container.innerHTML = `
        <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          <i class="fa-solid fa-filter-circle-xmark text-4xl mb-3 text-slate-300 dark:text-slate-600"></i>
          <p class="font-medium text-slate-600 dark:text-slate-300">No metrics match the selected filter criteria</p>
          <button id="btn-reset-filters" class="mt-3 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg text-xs font-semibold">
            Reset Filters
          </button>
        </div>
      `;
      const btnReset = document.getElementById('btn-reset-filters');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          searchQuery = '';
          filterIndicator = 'ALL';
          filterStatus = 'ALL';
          filterType = 'ALL';
          document.getElementById('matrix-search').value = '';
          document.getElementById('filter-indicator').value = 'ALL';
          document.getElementById('filter-status').value = 'ALL';
          document.getElementById('filter-type').value = 'ALL';
          renderGapMatrix();
        });
      }
      return;
    }

    if (matrixViewMode === 'cards') {
      renderMatrixCards(metrics);
    } else {
      renderMatrixTable(metrics);
    }
  }

  function renderMatrixCards(metrics) {
    const container = document.getElementById('matrix-items-container');
    container.innerHTML = metrics.map(m => {
      const isQualitative = (m.metricType || 'QlM') === 'QlM';
      const my = m.years || {};
      const files = m.evidenceFiles || [];
      const withLinkCount = files.filter(f => f.driveUrl && f.driveUrl.trim()).length;
      const wordInfo = getWordCountInfo(m.ssrDraft || '');

      return `
        <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 transition hover:border-slate-300 dark:hover:border-slate-700">
          
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex items-start space-x-3">
              <span class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center text-sm flex-shrink-0">
                ${escapeHtml(m.metricNo)}
              </span>
              <div>
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-bold text-slate-900 dark:text-white">${escapeHtml(m.keyIndicator || '')}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    isQualitative 
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300' 
                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                  }">
                    ${m.metricType || 'QlM'}
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                    Weight: ${m.weightage || '-'}
                  </span>
                </div>
                <p class="text-xs text-slate-700 dark:text-slate-300 mt-1 leading-relaxed max-w-3xl">
                  ${escapeHtml(m.indicator)}
                </p>
              </div>
            </div>

            <!-- Status Badge & Jump to Folder -->
            <div class="flex items-center space-x-2">
              <span class="px-2.5 py-1 rounded-xl text-xs font-semibold ${
                m.status === 'Completed'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  : m.status === 'In Progress'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }">
                ${escapeHtml(m.status || 'Not Started')}
              </span>
              <button data-jump-folder="${m.id}" class="btn-jump-folder px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-xl text-xs font-semibold transition" title="Open Folder Workspace">
                <i class="fa-solid fa-folder-open mr-1"></i> Workspace
              </button>
            </div>
          </div>

          <!-- 6-Year Interactive Pills Row -->
          <div class="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div class="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center justify-between">
              <span>6-Year Evidence Availability (Click pill to cycle status):</span>
              <span class="font-mono text-indigo-600 dark:text-indigo-400">
                ${ACADEMIC_YEARS.filter(yr => my[yr] === 'Available').length} / 6 Years Complete
              </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              ${ACADEMIC_YEARS.map(yr => {
                const yrStatus = my[yr] || 'Pending';
                let pillBg = 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
                if (yrStatus === 'Available') pillBg = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300';
                else if (yrStatus === 'Partial') pillBg = 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300';
                else if (yrStatus === 'Missing') pillBg = 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300';

                return `
                  <button data-cycle-metric="${m.id}" data-cycle-year="${yr}" class="btn-cycle-year p-2 rounded-lg text-center transition hover:shadow-xs border border-transparent hover:border-indigo-400 ${pillBg}">
                    <div class="text-[10px] uppercase font-bold tracking-wider opacity-80">${yr}</div>
                    <div class="text-xs font-extrabold mt-0.5">${yrStatus}</div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Bottom Row: Evidence Stats, SSR Draft status, Dept -->
          <div class="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 pt-1">
            <div class="flex items-center space-x-3">
              <span class="flex items-center space-x-1">
                <i class="fa-solid fa-folder-closed text-slate-400"></i>
                <span>${files.length} Documents Logged</span>
              </span>
              <span>&bull;</span>
              <span class="flex items-center space-x-1 ${withLinkCount > 0 ? 'text-blue-600 dark:text-blue-400 font-semibold' : ''}">
                <i class="fa-brands fa-google-drive text-amber-500"></i>
                <span>${withLinkCount} Drive Links</span>
              </span>
              ${isQualitative ? `
                <span>&bull;</span>
                <span class="flex items-center space-x-1 ${wordInfo.words > 0 ? 'text-purple-600 dark:text-purple-400 font-semibold' : ''}">
                  <i class="fa-solid fa-file-pen text-purple-500"></i>
                  <span>SSR Draft: ${wordInfo.words}/500 Words</span>
                </span>
              ` : ''}
            </div>

            <div class="flex items-center space-x-2">
              <span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono">
                Primary: ${escapeHtml(m.scsaSource || m.responsible || 'IQAC')}
              </span>
            </div>
          </div>

        </div>
      `;
    }).join('');

    attachMatrixEventListeners(container);
  }

  function renderMatrixTable(metrics) {
    const container = document.getElementById('matrix-items-container');
    container.innerHTML = `
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-x-auto shadow-sm">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th class="py-3 px-3">Metric</th>
              <th class="py-3 px-3">Weight</th>
              <th class="py-3 px-3">Description</th>
              ${ACADEMIC_YEARS.map(yr => `<th class="py-3 px-2 text-center font-mono">${yr}</th>`).join('')}
              <th class="py-3 px-3 text-center">Cloud Links</th>
              <th class="py-3 px-3">Status</th>
              <th class="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            ${metrics.map(m => {
              const my = m.years || {};
              const files = m.evidenceFiles || [];
              const withLink = files.filter(f => f.driveUrl && f.driveUrl.trim()).length;

              return `
                <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                  <td class="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">${escapeHtml(m.metricNo)}</td>
                  <td class="py-2.5 px-3 font-bold text-center">${escapeHtml(m.weightage || '-')}</td>
                  <td class="py-2.5 px-3 max-w-xs truncate" title="${escapeHtml(m.indicator)}">${escapeHtml(m.indicator)}</td>
                  ${ACADEMIC_YEARS.map(yr => {
                    const st = my[yr] || 'Pending';
                    let color = 'text-slate-400';
                    if (st === 'Available') color = 'text-emerald-600 font-bold';
                    else if (st === 'Partial') color = 'text-amber-500 font-bold';
                    else if (st === 'Missing') color = 'text-rose-600 font-bold';
                    return `
                      <td class="py-2.5 px-2 text-center">
                        <button data-cycle-metric="${m.id}" data-cycle-year="${yr}" class="btn-cycle-year px-1.5 py-0.5 rounded text-[11px] ${color} hover:bg-slate-100 dark:hover:bg-slate-800">
                          ${st === 'Available' ? '✓' : st === 'Missing' ? '✗' : '~'}
                        </button>
                      </td>
                    `;
                  }).join('')}
                  <td class="py-2.5 px-3 text-center font-mono ${withLink > 0 ? 'text-blue-600 font-bold' : 'text-slate-400'}">
                    ${withLink}/${files.length}
                  </td>
                  <td class="py-2.5 px-3 font-semibold">${escapeHtml(m.status || 'Not Started')}</td>
                  <td class="py-2.5 px-3 text-right">
                    <button data-jump-folder="${m.id}" class="btn-jump-folder px-2 py-1 rounded bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 text-[11px]">
                      Workspace
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    attachMatrixEventListeners(container);
  }

  function attachMatrixEventListeners(container) {
    // Jump to folder
    container.querySelectorAll('.btn-jump-folder').forEach(btn => {
      btn.addEventListener('click', () => {
        activeMetricId = btn.getAttribute('data-jump-folder');
        switchTab('folders');
      });
    });

    // Cycle year status
    container.querySelectorAll('.btn-cycle-year').forEach(btn => {
      btn.addEventListener('click', () => {
        const metricId = btn.getAttribute('data-cycle-metric');
        const year = btn.getAttribute('data-cycle-year');
        const metrics = getActiveMetrics();
        const metric = metrics.find(m => m.id === metricId);
        if (metric) {
          cycleYearStatus(metric, year);
          saveData();
          renderGapMatrix();
        }
      });
    });
  }

  function cycleYearStatus(metric, year) {
    if (!metric.years) metric.years = {};
    const current = metric.years[year] || 'Pending';
    // 3-state cycle: Pending -> Available -> Missing -> Pending
    if (current === 'Pending') metric.years[year] = 'Available';
    else if (current === 'Available') metric.years[year] = 'Missing';
    else metric.years[year] = 'Pending';

    showToast(`Metric ${metric.metricNo} (${year}) set to ${metric.years[year]}`);
  }

  // --- VIEW 3: EXECUTIVE ANALYTICS ---
  function renderAnalytics() {
    renderHighWeightageTable();
    renderAnalyticsCharts();
  }

  function renderHighWeightageTable() {
    const tbody = document.getElementById('high-weightage-tbody');
    if (!tbody) return;

    const metrics = getActiveMetrics();
    const highWeightMetrics = metrics
      .filter(m => (parseFloat(m.weightage) || 0) >= 7)
      .sort((a, b) => (parseFloat(b.weightage) || 0) - (parseFloat(a.weightage) || 0));

    tbody.innerHTML = highWeightMetrics.map(m => {
      const isQualitative = (m.metricType || 'QlM') === 'QlM';
      return `
        <tr class="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
          <td class="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white">${escapeHtml(m.metricNo)}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded font-extrabold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300">
              ${escapeHtml(m.weightage)} Marks
            </span>
          </td>
          <td class="py-2.5 px-3 font-medium">${escapeHtml(m.keyIndicator || '')}</td>
          <td class="py-2.5 px-3 max-w-sm truncate" title="${escapeHtml(m.indicator)}">${escapeHtml(m.indicator)}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${
              m.status === 'Completed'
                ? 'bg-emerald-100 text-emerald-800'
                : m.status === 'In Progress'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-700'
            }">
              ${escapeHtml(m.status || 'Not Started')}
            </span>
          </td>
          <td class="py-2.5 px-3">
            <button data-jump-folder="${m.id}" class="btn-jump-folder px-2 py-1 rounded bg-indigo-50 text-indigo-600 font-semibold hover:bg-indigo-100 text-[11px]">
              Open Workspace
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-jump-folder').forEach(btn => {
      btn.addEventListener('click', () => {
        activeMetricId = btn.getAttribute('data-jump-folder');
        switchTab('folders');
      });
    });
  }

  function renderAnalyticsCharts() {
    if (typeof Chart === 'undefined') return;

    const metrics = getActiveMetrics();

    // Chart 1: Key Indicator Readiness
    const kiGroups = {};
    metrics.forEach(m => {
      const ki = m.keyIndicator || 'General';
      if (!kiGroups[ki]) kiGroups[ki] = { total: 0, completed: 0 };
      kiGroups[ki].total++;
      if (m.status === 'Completed') kiGroups[ki].completed++;
    });

    const kiLabels = Object.keys(kiGroups).map(k => k.replace(/Key Indicator\s*/i, 'KI '));
    const kiData = Object.values(kiGroups).map(g => g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0);

    const canvasKI = document.getElementById('chart-indicator-readiness');
    if (canvasKI) {
      if (chartIndicator) chartIndicator.destroy();
      chartIndicator = new Chart(canvasKI, {
        type: 'bar',
        data: {
          labels: kiLabels,
          datasets: [{
            label: '% Completion',
            data: kiData,
            backgroundColor: '#6366f1',
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, max: 100, ticks: { callback: v => `${v}%` } }
          }
        }
      });
    }

    // Chart 2: Status Distribution
    let comp = 0, inProg = 0, review = 0, notStart = 0;
    metrics.forEach(m => {
      if (m.status === 'Completed') comp++;
      else if (m.status === 'In Progress') inProg++;
      else if (m.status === 'Under Review') review++;
      else notStart++;
    });

    const canvasStatus = document.getElementById('chart-status-pie');
    if (canvasStatus) {
      if (chartStatus) chartStatus.destroy();
      chartStatus = new Chart(canvasStatus, {
        type: 'doughnut',
        data: {
          labels: ['Completed', 'In Progress', 'Under Review', 'Not Started'],
          datasets: [{
            data: [comp, inProg, review, notStart],
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#94a3b8']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' }
          }
        }
      });
    }

    // Chart 3: 6-Year Trend
    const availByYear = [];
    const missingByYear = [];
    const pendingByYear = [];

    ACADEMIC_YEARS.forEach(yr => {
      let av = 0, mi = 0, pe = 0;
      metrics.forEach(m => {
        const s = (m.years && m.years[yr]) || 'Pending';
        if (s === 'Available') av++;
        else if (s === 'Missing') mi++;
        else pe++;
      });
      availByYear.push(av);
      missingByYear.push(mi);
      pendingByYear.push(pe);
    });

    const canvasFiveYear = document.getElementById('chart-five-year');
    if (canvasFiveYear) {
      if (chartFiveYear) chartFiveYear.destroy();
      chartFiveYear = new Chart(canvasFiveYear, {
        type: 'bar',
        data: {
          labels: ACADEMIC_YEARS,
          datasets: [
            { label: 'Available (We Have)', data: availByYear, backgroundColor: '#10b981', borderRadius: 6 },
            { label: 'Missing (Gap)', data: missingByYear, backgroundColor: '#f43f5e', borderRadius: 6 },
            { label: 'Pending Assessment', data: pendingByYear, backgroundColor: '#cbd5e1', borderRadius: 6 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true }
          }
        }
      });
    }
  }

  // --- VIEW 4: URGENT SUBMISSION AUDIT: HAVE VS DON'T HAVE ---
  function renderSubmissionAudit() {
    const container = document.getElementById('submission-items-container');
    if (!container) return;

    updateSubmissionCounters();

    let docs = submissionDocs;

    // Filter status
    if (subFilterStatus === 'HAVE') {
      docs = docs.filter(d => d.status === 'HAVE');
    } else if (subFilterStatus === 'DONT_HAVE') {
      docs = docs.filter(d => d.status !== 'HAVE');
    }

    // Filter dept
    if (subFilterDept !== 'ALL') {
      docs = docs.filter(d => (d.dept || '').includes(subFilterDept));
    }

    // Search query
    if (subSearchQuery) {
      const q = subSearchQuery.toLowerCase();
      docs = docs.filter(d => 
        d.title.toLowerCase().includes(q) ||
        d.metric.toLowerCase().includes(q) ||
        (d.dept || '').toLowerCase().includes(q) ||
        (d.action || '').toLowerCase().includes(q)
      );
    }

    if (docs.length === 0) {
      container.innerHTML = `
        <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-400">
          <i class="fa-solid fa-list-check text-4xl mb-3 text-slate-300 dark:text-slate-600"></i>
          <p class="font-medium text-slate-600 dark:text-slate-300">No documents match the current filter selection</p>
        </div>
      `;
      return;
    }

    container.innerHTML = docs.map(doc => {
      const isHave = doc.status === 'HAVE';
      const hasLink = Boolean(doc.driveUrl && doc.driveUrl.trim());

      return `
        <div class="bg-white dark:bg-slate-850 rounded-2xl border ${
          isHave ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/10' : 'border-rose-200 dark:border-rose-900/40 bg-rose-50/10'
        } p-4 shadow-sm space-y-3 transition">
          
          <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div class="flex items-start space-x-3">
              <span class="w-8 h-8 rounded-xl ${isHave ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'} flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                <i class="fa-solid ${isHave ? 'fa-check' : 'fa-xmark'}"></i>
              </span>
              <div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1">
                  <span class="font-mono font-bold text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    Metric ${escapeHtml(doc.metric)}
                  </span>
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                    Weight: ${escapeHtml(doc.weight)}
                  </span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
                    ${escapeHtml(doc.type)}
                  </span>
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Dept: ${escapeHtml(doc.dept)}
                  </span>
                </div>

                <h4 class="font-bold text-sm text-slate-900 dark:text-white leading-snug">
                  ${escapeHtml(doc.title)}
                </h4>

                <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
                  <span>Folder: <code class="font-mono text-indigo-600 dark:text-indigo-400">${escapeHtml(doc.folder)}</code></span>
                  
                  ${doc.assignedFaculty ? `
                    <span>&bull;</span>
                    <span class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-semibold text-[10px] flex items-center space-x-1 border border-indigo-100 dark:border-indigo-800">
                      <i class="fa-solid fa-user-tie text-[9px]"></i>
                      <span>In-Charge: ${escapeHtml(doc.assignedFaculty)}</span>
                    </span>
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Action Buttons: Status Toggle + Cloud Link -->
            <div class="flex flex-wrap items-center gap-2 self-end sm:self-auto flex-shrink-0">
              ${hasLink ? `
                <a href="${escapeHtml(doc.driveUrl)}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 flex items-center space-x-1.5 transition shadow-xs" title="Open Cloud File">
                  <i class="fa-brands fa-google-drive text-amber-500"></i>
                  <span>Drive File</span>
                  <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
                </a>
              ` : ''}

              <button data-sub-link-doc-id="${doc.id}" class="btn-open-sub-link px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition flex items-center space-x-1" title="Attach Google Drive URL or Assign Faculty">
                <i class="fa-solid fa-link text-indigo-500"></i>
                <span>${hasLink ? 'Edit Link' : '+ Attach Link'}</span>
              </button>

              <button data-doc-toggle-id="${doc.id}" class="btn-toggle-sub-doc px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs ${
                isHave
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
              }">
                <i class="fa-solid ${isHave ? 'fa-check-circle' : 'fa-triangle-exclamation'}"></i>
                <span>${isHave ? 'WE HAVE' : 'WE DON\'T HAVE'}</span>
              </button>
            </div>
          </div>

          <!-- Immediate Action Plan for Tomorrow -->
          <div class="text-xs p-2.5 rounded-xl ${isHave ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200'}">
            <strong>${isHave ? 'Verification Status:' : 'Action Required for Tomorrow:'}</strong>
            <span>${isHave ? 'Document collected and confirmed available in institutional archive.' : escapeHtml(doc.action)}</span>
          </div>

        </div>
      `;
    }).join('');

    // Wire up event listeners
    container.querySelectorAll('.btn-toggle-sub-doc').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-doc-toggle-id');
        const doc = submissionDocs.find(d => String(d.id) === String(id));
        if (doc) {
          doc.status = doc.status === 'HAVE' ? 'DONT_HAVE' : 'HAVE';
          saveSubmissionDocs();
          renderSubmissionAudit();
          showToast(`Marked "${doc.title}" as ${doc.status === 'HAVE' ? 'WE HAVE' : 'WE DON\'T HAVE'}`);
        }
      });
    });

    container.querySelectorAll('.btn-open-sub-link').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-sub-link-doc-id');
        openSubLinkModal(id);
      });
    });
  }

  // --- TAB NAVIGATION ---
  function switchTab(tab) {
    activeTab = tab;

    // Reset button states
    const btnFolders = document.getElementById('tab-btn-folders');
    const btnSubmission = document.getElementById('tab-btn-submission');
    const btnMatrix = document.getElementById('tab-btn-matrix');
    const btnAnalytics = document.getElementById('tab-btn-analytics');

    const defaultBtnClass = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
    if (btnFolders) btnFolders.className = defaultBtnClass;
    if (btnSubmission) btnSubmission.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60';
    if (btnMatrix) btnMatrix.className = defaultBtnClass;
    if (btnAnalytics) btnAnalytics.className = defaultBtnClass;

    // Active button highlight
    if (tab === 'folders' && btnFolders) {
      btnFolders.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-indigo-600 text-white shadow-sm';
    } else if (tab === 'submission' && btnSubmission) {
      btnSubmission.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-2 ring-rose-400';
    } else if (tab === 'matrix' && btnMatrix) {
      btnMatrix.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-indigo-600 text-white shadow-sm';
    } else if (tab === 'analytics' && btnAnalytics) {
      btnAnalytics.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-indigo-600 text-white shadow-sm';
    }

    // Hide all view sections
    const secFolders = document.getElementById('view-folders');
    const secSubmission = document.getElementById('view-submission');
    const secMatrix = document.getElementById('view-matrix');
    const secAnalytics = document.getElementById('view-analytics');

    if (secFolders) secFolders.classList.add('hidden');
    if (secSubmission) secSubmission.classList.add('hidden');
    if (secMatrix) secMatrix.classList.add('hidden');
    if (secAnalytics) secAnalytics.classList.add('hidden');

    // Show active section
    const activeSec = document.getElementById(`view-${tab}`);
    if (activeSec) {
      activeSec.classList.remove('hidden');
    }

    renderAll();
  }

  // --- MODALS & FORMS ---
  function openAddFileModal(editIndex) {
    const modal = document.getElementById('modal-add-file');
    if (!modal) return;

    const metric = getActiveMetric();
    const isEdit = typeof editIndex === 'number' && metric && metric.evidenceFiles && metric.evidenceFiles[editIndex];

    const inputName = document.getElementById('input-file-name');
    const inputUrl = document.getElementById('input-file-url');
    const inputYear = document.getElementById('input-file-year');
    const inputStatus = document.getElementById('input-file-status');
    const inputFaculty = document.getElementById('input-file-faculty');
    const inputCategory = document.getElementById('input-file-category');
    const inputNotes = document.getElementById('input-file-notes');
    const inputEditIdx = document.getElementById('input-file-edit-index');
    const modalTitle = document.getElementById('modal-file-title');
    const submitText = document.getElementById('btn-file-submit-text');

    if (isEdit) {
      const file = metric.evidenceFiles[editIndex];
      if (modalTitle) modalTitle.textContent = 'Edit Evidence & Cloud Link';
      if (submitText) submitText.textContent = 'Update Evidence';
      if (inputEditIdx) inputEditIdx.value = String(editIndex);

      if (inputName) inputName.value = file.name || '';
      if (inputUrl) inputUrl.value = file.driveUrl || '';
      if (inputYear) inputYear.value = file.year || '2020-21';
      if (inputStatus) inputStatus.value = file.status || 'Verified by IQAC';
      if (inputFaculty) inputFaculty.value = file.assignedFaculty || '';
      if (inputCategory) inputCategory.value = file.docCategory || 'Policy & SOP';
      if (inputNotes) inputNotes.value = file.notes || '';
    } else {
      if (modalTitle) modalTitle.textContent = 'Log Evidence & Cloud Document';
      if (submitText) submitText.textContent = 'Save Evidence';
      if (inputEditIdx) inputEditIdx.value = '';

      document.getElementById('form-add-file').reset();
    }

    modal.classList.remove('hidden');
  }

  function closeAddFileModal() {
    const modal = document.getElementById('modal-add-file');
    if (modal) modal.classList.add('hidden');
  }

  function handleAddFileSubmit(e) {
    e.preventDefault();
    const metric = getActiveMetric();
    if (!metric) return;

    const name = document.getElementById('input-file-name').value.trim();
    const driveUrl = (document.getElementById('input-file-url')?.value || '').trim();
    const year = document.getElementById('input-file-year').value;
    const status = document.getElementById('input-file-status').value;
    const assignedFaculty = (document.getElementById('input-file-faculty')?.value || '').trim();
    const docCategory = document.getElementById('input-file-category')?.value || 'Policy & SOP';
    const notes = document.getElementById('input-file-notes').value.trim();
    const editIdxStr = document.getElementById('input-file-edit-index')?.value || '';

    if (!name) return;

    if (!metric.evidenceFiles) metric.evidenceFiles = [];

    if (editIdxStr !== '') {
      // Update existing
      const editIdx = parseInt(editIdxStr, 10);
      if (metric.evidenceFiles[editIdx]) {
        metric.evidenceFiles[editIdx] = {
          ...metric.evidenceFiles[editIdx],
          name,
          driveUrl,
          year,
          status,
          assignedFaculty,
          docCategory,
          notes
        };
        showToast(`Updated "${name}"`);
      }
    } else {
      // Create new
      metric.evidenceFiles.push({
        name,
        driveUrl,
        year,
        status,
        assignedFaculty,
        docCategory,
        notes,
        dateAdded: new Date().toISOString()
      });
      showToast(`Logged "${name}" to Metric ${metric.metricNo} (${year})`);
    }

    // Mark this academic year as Available
    if (year && metric.years && metric.years[year] !== undefined) {
      metric.years[year] = 'Available';
    }

    saveData();
    closeAddFileModal();
    renderFolderWorkspace();
    renderFolderTree();
  }

  // --- SUBMISSION AUDIT LINK MODAL ---
  function openSubLinkModal(docId) {
    const modal = document.getElementById('modal-sub-link');
    if (!modal) return;

    const doc = submissionDocs.find(d => String(d.id) === String(docId));
    if (!doc) return;

    document.getElementById('sub-link-doc-id').value = String(doc.id);
    document.getElementById('sub-link-doc-name-display').textContent = `[${doc.metric}] ${doc.title}`;
    document.getElementById('sub-link-url').value = doc.driveUrl || '';
    document.getElementById('sub-link-faculty').value = doc.assignedFaculty || '';

    modal.classList.remove('hidden');
  }

  function closeSubLinkModal() {
    const modal = document.getElementById('modal-sub-link');
    if (modal) modal.classList.add('hidden');
  }

  function handleSubLinkSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sub-link-doc-id').value;
    const driveUrl = document.getElementById('sub-link-url').value.trim();
    const assignedFaculty = document.getElementById('sub-link-faculty').value.trim();

    const doc = submissionDocs.find(d => String(d.id) === String(id));
    if (doc) {
      doc.driveUrl = driveUrl;
      doc.assignedFaculty = assignedFaculty;

      // Smart auto-marking: if URL is provided, automatically mark status as HAVE!
      if (driveUrl && doc.status !== 'HAVE') {
        doc.status = 'HAVE';
        showToast(`Link attached! Automatically marked as WE HAVE`);
      } else {
        showToast(`Updated link & faculty for "${doc.title}"`);
      }

      saveSubmissionDocs();
      closeSubLinkModal();
      renderSubmissionAudit();
    }
  }

  // --- ALL SSR DRAFTS MODAL (10 QlM METRICS) ---
  function openAllSsrModal() {
    const modal = document.getElementById('modal-all-ssr-drafts');
    const container = document.getElementById('ssr-drafts-list-container');
    if (!modal || !container) return;

    const metrics = getActiveMetrics();
    const qlmMetrics = metrics.filter(m => (m.metricType || 'QlM') === 'QlM');

    let totalWordsAll = 0;

    container.innerHTML = qlmMetrics.map(m => {
      const text = (m.ssrDraft || '').trim();
      const info = getWordCountInfo(text);
      totalWordsAll += info.words;

      return `
        <div class="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 p-4 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center space-x-2">
              <span class="w-7 h-7 rounded-lg bg-purple-600 text-white font-bold flex items-center justify-center text-xs">
                ${escapeHtml(m.metricNo)}
              </span>
              <div>
                <h4 class="font-bold text-xs text-slate-900 dark:text-white">${escapeHtml(m.indicator)}</h4>
                <div class="text-[10px] text-slate-400">Weightage: ${escapeHtml(m.weightage)} Marks &bull; ${escapeHtml(m.keyIndicator || '')}</div>
              </div>
            </div>

            <div class="flex items-center space-x-2">
              <span class="px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${info.badgeClass}">
                ${info.words} / 500 Words
              </span>
              <button data-copy-modal-metric="${m.id}" class="btn-copy-modal-draft px-2.5 py-1 bg-white dark:bg-slate-700 text-purple-700 dark:text-purple-300 font-semibold rounded text-xs border border-purple-200 dark:border-purple-800 transition flex items-center space-x-1">
                <i class="fa-regular fa-copy"></i>
                <span>Copy</span>
              </button>
            </div>
          </div>

          <div class="p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-sans text-xs text-slate-700 dark:text-slate-200 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
            ${escapeHtml(text || 'No draft narrative entered yet.')}
          </div>
        </div>
      `;
    }).join('');

    // Wire up individual copy buttons inside modal
    container.querySelectorAll('.btn-copy-modal-draft').forEach(btn => {
      btn.addEventListener('click', () => {
        const mid = btn.getAttribute('data-copy-modal-metric');
        const metric = qlmMetrics.find(m => m.id === mid);
        if (metric && metric.ssrDraft) {
          const info = getWordCountInfo(metric.ssrDraft);
          copyToClipboard(metric.ssrDraft, `Copied Metric ${metric.metricNo} draft (${info.words} words)!`);
        }
      });
    });

    modal.classList.remove('hidden');
  }

  function closeAllSsrModal() {
    const modal = document.getElementById('modal-all-ssr-drafts');
    if (modal) modal.classList.add('hidden');
  }

  function compileAllSsrText() {
    const metrics = getActiveMetrics();
    const qlmMetrics = metrics.filter(m => (m.metricType || 'QlM') === 'QlM');

    let fullDoc = `========================================================================
NAAC CRITERION VI: GOVERNANCE, LEADERSHIP AND MANAGEMENT
QUALITATIVE METRIC (QlM) 500-WORD SSR DRAFT NARRATIVES
========================================================================
Total Qualitative Metrics: ${qlmMetrics.length} Metrics
Total Weightage: 61 Marks (Out of 100 Marks Criterion VI)
Strict NAAC Manual Ceiling: 500 Words Maximum per Metric
Generated: ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}
========================================================================\n\n`;

    qlmMetrics.forEach((m, idx) => {
      const text = (m.ssrDraft || '').trim();
      const info = getWordCountInfo(text);

      fullDoc += `------------------------------------------------------------------------
[${idx + 1}/10] METRIC ${m.metricNo} (Weightage: ${m.weightage} Marks)
Indicator: ${m.indicator}
Key Indicator: ${m.keyIndicator || ''}
Word Count: ${info.words} / 500 Words (${info.words <= 500 ? 'COMPLIANT' : 'EXCEEDS LIMIT'})
------------------------------------------------------------------------

${text || '[Draft text pending]'}

\n\n`;
    });

    fullDoc += `========================================================================
END OF NAAC CRITERION VI QUALITATIVE SSR DRAFTS
========================================================================`;
    return fullDoc;
  }

  function downloadAllSsrTxt() {
    const doc = compileAllSsrText();
    downloadTextFile(`NAAC_Criterion_VI_SSR_All_QlM_Drafts_${new Date().toISOString().slice(0, 10)}.txt`, doc);
    showToast('Downloaded all 10 QlM SSR drafts document');
  }

  function copyAllSsr() {
    const doc = compileAllSsrText();
    copyToClipboard(doc, 'Copied all 10 QlM drafts to clipboard!');
  }

  function openGithubModal() {
    const modal = document.getElementById('modal-github');
    if (modal) modal.classList.remove('hidden');
  }

  function closeGithubModal() {
    const modal = document.getElementById('modal-github');
    if (modal) modal.classList.add('hidden');
  }

  function openBackupModal() {
    const modal = document.getElementById('modal-backup');
    if (modal) modal.classList.remove('hidden');
  }

  function closeBackupModal() {
    const modal = document.getElementById('modal-backup');
    if (modal) modal.classList.add('hidden');
  }

  // --- EXPORT & RESTORE ---
  function exportJson() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      criteria: appData,
      submissionDocs: submissionDocs
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `NAAC_SSR_Tracker_Backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Backup JSON exported successfully');
  }

  function restoreJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const imported = JSON.parse(e.target.result);
        if (typeof imported === 'object' && imported !== null) {
          if (imported.criteria) {
            appData = imported.criteria;
            if (imported.submissionDocs) submissionDocs = imported.submissionDocs;
          } else {
            appData = imported;
          }
          saveData();
          saveSubmissionDocs();
          renderAll();
          closeBackupModal();
          showToast('Data restored successfully!');
        } else {
          showToast('Invalid backup file format.', 'error');
        }
      } catch (err) {
        showToast('Error reading JSON file.', 'error');
      }
    };
    reader.readAsText(file);
  }

  function resetDefaultData() {
    if (confirm('Reset all data back to institutional default templates? Any unexported edits will be cleared.')) {
      appData = JSON.parse(JSON.stringify(window.DEFAULT_NAAC_DATA || {}));
      submissionDocs = JSON.parse(JSON.stringify(window.CRITERION_VI_SPECIFIC_DOCS || []));
      saveData();
      saveSubmissionDocs();
      renderAll();
      closeBackupModal();
      showToast('Reset to default templates completed.');
    }
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('SheetJS library is loading...', 'warning');
      return;
    }

    const wb = XLSX.utils.book_new();
    const metrics = getActiveMetrics();
    const rows = [
      ['Metric No.', 'Weightage', 'Type', 'Metric / Indicator Description', 'SSR Draft (500 Words)', 'Draft Word Count', 'Cloud / Drive Links Count', ...ACADEMIC_YEARS, 'SCSA Mandate', 'Primary Source', 'Status', 'Logged Evidence Count']
    ];

    metrics.forEach(m => {
      const my = m.years || {};
      const yrStatuses = ACADEMIC_YEARS.map(yr => my[yr] || 'Pending');
      const files = m.evidenceFiles || [];
      const driveLinksCount = files.filter(f => f.driveUrl && f.driveUrl.trim()).length;
      const wordInfo = getWordCountInfo(m.ssrDraft || '');

      rows.push([
        m.metricNo,
        m.weightage,
        m.metricType || 'QlM',
        m.indicator,
        m.ssrDraft || '',
        wordInfo.words,
        driveLinksCount,
        ...yrStatuses,
        m.scsaCollect || '',
        m.scsaSource || m.responsible || '',
        m.status || 'Not Started',
        files.length
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, currentCriterionKey.slice(0, 31));

    XLSX.writeFile(wb, `NAAC_${currentCriterionKey.replace(/\s+/g, '_')}_Updated_Gap_Analysis.xlsx`);
    showToast('Updated Excel spreadsheet exported with SSR drafts and Cloud links!');
  }

  function exportSubmissionExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('SheetJS is loading...', 'warning');
      return;
    }

    const wb = XLSX.utils.book_new();

    const dontHaveList = submissionDocs.filter(d => d.status !== 'HAVE');
    const dontHaveRows = [
      ['Metric', 'Weightage', 'Type', 'Specific Document Title', 'Responsible Dept', 'Assigned Faculty', 'Cloud / Drive URL', 'Target Folder', 'Immediate Action Required for Tomorrow']
    ];
    dontHaveList.forEach(d => {
      dontHaveRows.push([
        d.metric,
        d.weight,
        d.type,
        d.title,
        d.dept,
        d.assignedFaculty || '',
        d.driveUrl || '',
        d.folder,
        d.action
      ]);
    });
    const wsGaps = XLSX.utils.aoa_to_sheet(dontHaveRows);
    XLSX.utils.book_append_sheet(wb, wsGaps, 'DOCUMENTS_DONT_HAVE_GAPS');

    const haveList = submissionDocs.filter(d => d.status === 'HAVE');
    const haveRows = [
      ['Metric', 'Weightage', 'Type', 'Specific Document Title', 'Responsible Dept', 'Assigned Faculty', 'Cloud / Drive URL', 'Target Folder', 'Status']
    ];
    haveList.forEach(d => {
      haveRows.push([
        d.metric,
        d.weight,
        d.type,
        d.title,
        d.dept,
        d.assignedFaculty || '',
        d.driveUrl || '',
        d.folder,
        'VERIFIED / AVAILABLE'
      ]);
    });
    const wsHave = XLSX.utils.aoa_to_sheet(haveRows);
    XLSX.utils.book_append_sheet(wb, wsHave, 'DOCUMENTS_WE_HAVE');

    XLSX.writeFile(wb, `NAAC_Criterion_VI_Submission_Audit_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('Exported Submission Audit Spreadsheet with Have & Don\'t Have sheets!');
  }

  function printReport() {
    const printDate = document.getElementById('print-date');
    if (printDate) printDate.textContent = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });

    const metrics = getActiveMetrics();
    const printTbody = document.getElementById('print-tbody');
    if (printTbody) {
      printTbody.innerHTML = metrics.map(m => {
        const my = m.years || {};
        return `
          <tr>
            <td class="p-1.5 border font-mono font-bold">${escapeHtml(m.metricNo)}</td>
            <td class="p-1.5 border font-bold text-center">${escapeHtml(m.weightage || '-')}</td>
            <td class="p-1.5 border">
              <strong>${escapeHtml(m.indicator)}</strong>
              <div class="text-[10px] text-slate-500 font-mono">${escapeHtml(m.folder || '')}</div>
            </td>
            ${ACADEMIC_YEARS.map(yr => `<td class="p-1.5 border text-center font-mono">${my[yr] || '-'}</td>`).join('')}
            <td class="p-1.5 border">
              <div>Dept: ${escapeHtml(m.responsible || 'IQAC')}</div>
              <div>Plan: ${escapeHtml(m.actionPlan || '-')}</div>
            </td>
          </tr>
        `;
      }).join('');
    }

    const statReadiness = document.getElementById('stat-readiness-percent').textContent;
    const statCompleted = document.getElementById('stat-completed-count').textContent;
    const statInprogress = document.getElementById('stat-inprogress-count').textContent;
    const statGaps = document.getElementById('stat-gaps-count').textContent;

    if (document.getElementById('print-readiness')) document.getElementById('print-readiness').textContent = statReadiness;
    if (document.getElementById('print-completed')) document.getElementById('print-completed').textContent = statCompleted;
    if (document.getElementById('print-inprogress')) document.getElementById('print-inprogress').textContent = statInprogress;
    if (document.getElementById('print-gaps')) document.getElementById('print-gaps').textContent = statGaps;

    window.print();
  }

  // --- EVENT LISTENERS SETUP ---
  function setupEventListeners() {
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const critSelect = document.getElementById('criteria-select');
    if (critSelect) {
      critSelect.addEventListener('change', (e) => {
        currentCriterionKey = e.target.value;
        const currentMetrics = getActiveMetrics();
        if (currentMetrics.length > 0) {
          activeMetricId = currentMetrics[0].id;
        }
        renderAll();
        showToast(`Switched view to ${currentCriterionKey}`);
      });
    }

    // Tabs
    const tabFolders = document.getElementById('tab-btn-folders');
    const tabSubmission = document.getElementById('tab-btn-submission');
    const tabMatrix = document.getElementById('tab-btn-matrix');
    const tabAnalytics = document.getElementById('tab-btn-analytics');

    if (tabFolders) tabFolders.addEventListener('click', () => switchTab('folders'));
    if (tabSubmission) tabSubmission.addEventListener('click', () => switchTab('submission'));
    if (tabMatrix) tabMatrix.addEventListener('click', () => switchTab('matrix'));
    if (tabAnalytics) tabAnalytics.addEventListener('click', () => switchTab('analytics'));

    // Copy Root Path
    const btnCopyRoot = document.getElementById('btn-copy-root-path');
    if (btnCopyRoot) {
      btnCopyRoot.addEventListener('click', () => {
        copyToClipboard('NAAC – Criterion VI', 'Copied root folder name!');
      });
    }

    // Matrix search and filters
    const searchInput = document.getElementById('matrix-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderGapMatrix();
      });
    }

    const filterInd = document.getElementById('filter-indicator');
    if (filterInd) {
      filterInd.addEventListener('change', (e) => {
        filterIndicator = e.target.value;
        renderGapMatrix();
      });
    }

    const filterSt = document.getElementById('filter-status');
    if (filterSt) {
      filterSt.addEventListener('change', (e) => {
        filterStatus = e.target.value;
        renderGapMatrix();
      });
    }

    const filterTy = document.getElementById('filter-type');
    if (filterTy) {
      filterTy.addEventListener('change', (e) => {
        filterType = e.target.value;
        renderGapMatrix();
      });
    }

    // View mode in Matrix
    const btnViewCards = document.getElementById('btn-view-cards');
    const btnViewTable = document.getElementById('btn-view-table');

    if (btnViewCards && btnViewTable) {
      btnViewCards.addEventListener('click', () => {
        matrixViewMode = 'cards';
        btnViewCards.className = 'px-2.5 py-1 text-xs rounded-lg font-medium transition bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm';
        btnViewTable.className = 'px-2.5 py-1 text-xs rounded-lg font-medium transition text-slate-600 dark:text-slate-400 hover:text-slate-900';
        renderGapMatrix();
      });

      btnViewTable.addEventListener('click', () => {
        matrixViewMode = 'table';
        btnViewTable.className = 'px-2.5 py-1 text-xs rounded-lg font-medium transition bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm';
        btnViewCards.className = 'px-2.5 py-1 text-xs rounded-lg font-medium transition text-slate-600 dark:text-slate-400 hover:text-slate-900';
        renderGapMatrix();
      });
    }

    // Submission view listeners
    const btnExportSub = document.getElementById('btn-export-submission-excel');
    if (btnExportSub) btnExportSub.addEventListener('click', exportSubmissionExcel);

    const btnPrintSub = document.getElementById('btn-print-submission');
    if (btnPrintSub) btnPrintSub.addEventListener('click', exportSubmissionExcel);

    const subSearch = document.getElementById('sub-search');
    if (subSearch) {
      subSearch.addEventListener('input', (e) => {
        subSearchQuery = e.target.value;
        renderSubmissionAudit();
      });
    }

    const subFilterD = document.getElementById('sub-filter-dept');
    if (subFilterD) {
      subFilterD.addEventListener('change', (e) => {
        subFilterDept = e.target.value;
        renderSubmissionAudit();
      });
    }

    const btnFilterAll = document.getElementById('btn-sub-filter-all');
    const btnFilterDontHave = document.getElementById('btn-sub-filter-dont-have');
    const btnFilterHave = document.getElementById('btn-sub-filter-have');

    if (btnFilterAll && btnFilterDontHave && btnFilterHave) {
      btnFilterAll.addEventListener('click', () => {
        subFilterStatus = 'ALL';
        btnFilterAll.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs';
        btnFilterDontHave.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-rose-600 dark:text-rose-400 hover:text-rose-800';
        btnFilterHave.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-emerald-600 dark:text-emerald-400 hover:text-emerald-800';
        renderSubmissionAudit();
      });

      btnFilterDontHave.addEventListener('click', () => {
        subFilterStatus = 'DONT_HAVE';
        btnFilterDontHave.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-rose-600 text-white shadow-xs';
        btnFilterAll.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-600 dark:text-slate-400 hover:text-slate-800';
        btnFilterHave.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-emerald-600 dark:text-emerald-400 hover:text-emerald-800';
        renderSubmissionAudit();
      });

      btnFilterHave.addEventListener('click', () => {
        subFilterStatus = 'HAVE';
        btnFilterHave.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white shadow-xs';
        btnFilterAll.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-slate-600 dark:text-slate-400 hover:text-slate-800';
        btnFilterDontHave.className = 'sub-filter-btn px-3 py-1.5 rounded-lg text-xs font-semibold transition text-rose-600 dark:text-rose-400 hover:text-rose-800';
        renderSubmissionAudit();
      });
    }

    const btnMarkAll = document.getElementById('btn-sub-mark-all-have');
    if (btnMarkAll) {
      btnMarkAll.addEventListener('click', () => {
        if (confirm('Mark currently filtered documents as WE HAVE?')) {
          submissionDocs.forEach(d => {
            if (subFilterDept === 'ALL' || (d.dept || '').includes(subFilterDept)) {
              d.status = 'HAVE';
            }
          });
          saveSubmissionDocs();
          renderSubmissionAudit();
          showToast('Updated status of filtered documents to WE HAVE');
        }
      });
    }

    // SSR Drafts Modal triggers
    const btnExportSsr = document.getElementById('btn-export-ssr-drafts');
    if (btnExportSsr) btnExportSsr.addEventListener('click', openAllSsrModal);
    const btnCloseSsr = document.getElementById('btn-close-ssr-modal');
    if (btnCloseSsr) btnCloseSsr.addEventListener('click', closeAllSsrModal);
    const btnDownloadAllSsr = document.getElementById('btn-download-all-ssr-txt');
    if (btnDownloadAllSsr) btnDownloadAllSsr.addEventListener('click', downloadAllSsrTxt);
    const btnCopyAllSsr = document.getElementById('btn-copy-all-ssr');
    if (btnCopyAllSsr) btnCopyAllSsr.addEventListener('click', copyAllSsr);

    // Submission Link modal triggers
    const btnCloseSubLink = document.getElementById('btn-close-sub-link-modal');
    if (btnCloseSubLink) btnCloseSubLink.addEventListener('click', closeSubLinkModal);
    const btnCancelSubLink = document.getElementById('btn-cancel-sub-link');
    if (btnCancelSubLink) btnCancelSubLink.addEventListener('click', closeSubLinkModal);
    const formSubLink = document.getElementById('form-sub-link');
    if (formSubLink) formSubLink.addEventListener('submit', handleSubLinkSubmit);

    // GitHub Modal
    const btnGithub = document.getElementById('btn-github-guide');
    if (btnGithub) btnGithub.addEventListener('click', openGithubModal);
    const btnCloseGithub = document.getElementById('btn-close-github-modal');
    if (btnCloseGithub) btnCloseGithub.addEventListener('click', closeGithubModal);
    const btnDismissGithub = document.getElementById('btn-dismiss-github-modal');
    if (btnDismissGithub) btnDismissGithub.addEventListener('click', closeGithubModal);

    // Backup Modal
    const btnBackup = document.getElementById('btn-backup-restore');
    if (btnBackup) btnBackup.addEventListener('click', openBackupModal);
    const btnCloseBackup = document.getElementById('btn-close-backup-modal');
    if (btnCloseBackup) btnCloseBackup.addEventListener('click', closeBackupModal);

    // Evidence File Modal
    const btnCloseFile = document.getElementById('btn-close-file-modal');
    if (btnCloseFile) btnCloseFile.addEventListener('click', closeAddFileModal);
    const btnCancelFile = document.getElementById('btn-cancel-file-modal');
    if (btnCancelFile) btnCancelFile.addEventListener('click', closeAddFileModal);

    const formAddFile = document.getElementById('form-add-file');
    if (formAddFile) formAddFile.addEventListener('submit', handleAddFileSubmit);

    // Export & Backup
    const btnDownloadJson = document.getElementById('btn-download-json');
    if (btnDownloadJson) btnDownloadJson.addEventListener('click', exportJson);

    const inputRestore = document.getElementById('input-restore-file');
    if (inputRestore) {
      inputRestore.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          restoreJson(e.target.files[0]);
        }
      });
    }

    const btnResetData = document.getElementById('btn-reset-data');
    if (btnResetData) btnResetData.addEventListener('click', resetDefaultData);

    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) btnExportExcel.addEventListener('click', exportExcel);

    const btnPrintReport = document.getElementById('btn-print-report');
    if (btnPrintReport) btnPrintReport.addEventListener('click', printReport);

    const btnCopyGit = document.getElementById('btn-copy-git-cmd');
    if (btnCopyGit) {
      btnCopyGit.addEventListener('click', () => {
        const cmdBlock = document.getElementById('git-commands-block');
        if (cmdBlock) {
          copyToClipboard(cmdBlock.textContent.trim(), 'Git commands copied!');
        }
      });
    }
  }

  // --- HELPERS ---
  function getWordCountInfo(text) {
    if (!text || !text.trim()) {
      return {
        words: 0,
        chars: 0,
        readingTime: '0 min read',
        badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        badgeLabel: '0 / 500 Words (Empty)'
      };
    }
    const clean = text.trim();
    const words = clean.split(/\s+/).filter(Boolean).length;
    const chars = clean.length;
    const readingTime = Math.max(1, Math.round(words / 180)) + ' min read';

    let badgeClass = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300';
    let badgeLabel = `${words} / 500 Words (Optimal)`;

    if (words > 500) {
      badgeClass = 'bg-rose-600 text-white font-extrabold animate-pulse';
      badgeLabel = `${words} / 500 Words (⚠️ EXCEEDS NAAC 500 LIMIT BY ${words - 500}!)`;
    } else if (words > 450) {
      badgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 font-bold';
      badgeLabel = `${words} / 500 Words (Near 500 Ceiling)`;
    }

    return { words, chars, readingTime, badgeClass, badgeLabel };
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyToClipboard(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast(msg || 'Copied to clipboard!');
      }).catch(() => {
        fallbackCopy(text, msg);
      });
    } else {
      fallbackCopy(text, msg);
    }
  }

  function fallbackCopy(text, msg) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(msg || 'Copied to clipboard!');
    } catch (e) {
      showToast('Could not copy automatically.', 'error');
    }
    ta.remove();
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    let bg = 'bg-slate-900 text-white';
    let icon = 'fa-solid fa-circle-check text-emerald-400';

    if (type === 'error') {
      bg = 'bg-rose-900 text-white';
      icon = 'fa-solid fa-circle-exclamation text-rose-300';
    } else if (type === 'warning') {
      bg = 'bg-amber-900 text-white';
      icon = 'fa-solid fa-triangle-exclamation text-amber-300';
    }

    toast.className = `flex items-center space-x-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-medium pointer-events-auto transition-all transform duration-300 translate-y-2 opacity-0 ${bg}`;
    toast.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
