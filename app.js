// NAAC Criterion VI - Evidence & Gap Analysis Tracker Application Logic

(function () {
  'use strict';

  const STORAGE_KEY = 'naac_tracker_data_v1';
  const THEME_KEY = 'naac_tracker_theme';

  // --- STATE ---
  let appData = {};
  let currentCriterionKey = 'Criterion VI';
  let activeMetricId = '6.1.1';
  let activeTab = 'folders'; // 'folders' | 'matrix' | 'analytics'
  let matrixViewMode = 'cards'; // 'cards' | 'table'
  let searchQuery = '';
  let filterIndicator = 'ALL';
  let filterStatus = 'ALL';
  let filterType = 'ALL';

  // Chart instances
  let chartIndicator = null;
  let chartStatus = null;
  let chartFiveYear = null;

  // --- INITIALIZATION ---
  function init() {
    initTheme();
    loadData();
    setupEventListeners();
    renderAll();
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
    // Refresh charts on theme switch
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

    // Fallback if Criterion VI not present
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

      // Status count
      if (m.status === 'Completed') completedCount++;
      else if (m.status === 'In Progress' || m.status === 'Under Review') inProgressCount++;

      // Files count
      const filesCount = (m.evidenceFiles || []).length;
      totalFiles += filesCount;

      // 5-Year status assessment calculation
      const years = m.years || {};
      const yearVals = Object.values(years);
      const availableYears = yearVals.filter(v => v === 'Available').length;
      const missingYears = yearVals.filter(v => v === 'Missing').length;

      if (missingYears > 0 || m.status === 'Not Started') {
        gapsCount++;
      }

      // Metric completion fraction
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

    // Update DOM
    document.getElementById('stat-weightage').textContent = totalWeightage || 100;
    document.getElementById('stat-readiness-percent').textContent = `${overallReadinessPercent}%`;
    document.getElementById('stat-readiness-bar').style.width = `${overallReadinessPercent}%`;
    
    document.getElementById('stat-completed-count').textContent = completedCount;
    document.getElementById('stat-inprogress-count').textContent = inProgressCount;
    document.getElementById('stat-total-count').textContent = totalMetrics;
    
    document.getElementById('stat-files-count').textContent = `${totalFiles} Files`;
    document.getElementById('stat-gaps-count').textContent = `${gapsCount} Items`;

    const treeCountElem = document.getElementById('tree-folders-count');
    if (treeCountElem) {
      treeCountElem.textContent = `${totalMetrics} Folders`;
    }
  }

  // --- RENDER DISPATCHER ---
  function renderAll() {
    updateExecutiveKPIs();
    if (activeTab === 'folders') {
      renderFolderTree();
      renderFolderWorkspace();
    } else if (activeTab === 'matrix') {
      renderGapMatrix();
    } else if (activeTab === 'analytics') {
      renderAnalytics();
    }
  }

  // --- VIEW 1: EVIDENCE REPOSITORY (TREE & WORKSPACE) ---
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
      // Shorten Key Indicator title for tree header
      const shortKi = ki.replace(/Key Indicator\s*/i, '').trim();

      html += `
        <div class="mb-3">
          <div class="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 flex items-center justify-between">
            <span class="truncate" title="${escapeHtml(shortKi)}">${escapeHtml(shortKi)}</span>
            <span class="text-[10px] font-mono font-normal">(${items.length})</span>
          </div>
          <div class="space-y-1 mt-1 pl-1">
      `;

      items.forEach(item => {
        const isActive = item.id === activeMetricId;
        const fileCount = (item.evidenceFiles || []).length;
        const weight = item.weightage || '-';
        
        let statusDotColor = 'bg-slate-300 dark:bg-slate-600';
        if (item.status === 'Completed') statusDotColor = 'bg-emerald-500';
        else if (item.status === 'In Progress') statusDotColor = 'bg-amber-500';
        else if (item.status === 'Under Review') statusDotColor = 'bg-blue-500';

        // Extract clean subfolder name
        const folderDisplayName = item.folder 
          ? item.folder.split('/').pop() 
          : `${item.metricNo} Evidence`;

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
              <span class="text-[10px] px-1.5 py-0.2 rounded font-mono ${
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

    // Attach tree click handlers
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
      container.innerHTML = `<div class="p-8 text-center text-slate-400">Select a folder to view details</div>`;
      return;
    }

    const folderRelative = metric.folder || `${metric.metricNo} Evidence`;
    const folderWindowsPath = `NAAC – Criterion VI\\${folderRelative.replace(/\//g, '\\')}`;
    const files = metric.evidenceFiles || [];
    const checklist = metric.checklist || [];
    const suggestedFiles = metric.suggestedFiles || [];
    const isQualitative = (metric.metricType || 'QlM') === 'QlM';

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
            <label class="text-xs font-medium text-slate-500">Status:</label>
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

        <!-- Windows Explorer Path Banner -->
        <div class="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-xl text-xs font-mono text-slate-600 dark:text-slate-300 overflow-hidden">
          <div class="flex items-center space-x-2 truncate mr-2">
            <i class="fa-brands fa-windows text-indigo-500"></i>
            <span class="truncate">${escapeHtml(folderWindowsPath)}</span>
          </div>
          <button id="btn-copy-folder-path" data-path="${escapeHtml(folderWindowsPath)}" class="px-2.5 py-1 bg-white dark:bg-slate-700 hover:bg-indigo-50 dark:hover:bg-slate-600 text-indigo-600 dark:text-indigo-300 rounded-lg text-xs font-sans font-semibold shadow-xs transition flex items-center space-x-1 flex-shrink-0">
            <i class="fa-regular fa-copy"></i>
            <span>Copy Path</span>
          </button>
        </div>
      </div>

      <!-- 5-Year Status Quick Buttons -->
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">5-Year Assessment Compliance</span>
          <span class="text-[11px] text-slate-400">Click any year to cycle status</span>
        </div>
        <div class="grid grid-cols-5 gap-2" id="years-pill-group">
          ${renderYearPills(metric)}
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

        <!-- DVV Tip if available -->
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
              const alreadyLogged = files.some(f => f.name === file);
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

      <!-- Logged Evidence Files Manager -->
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-folder-closed text-indigo-600"></i>
            <h3 class="font-bold text-sm text-slate-900 dark:text-white">Logged Evidence in Folder (${files.length})</h3>
          </div>
          <button id="btn-open-file-modal" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center space-x-1.5">
            <i class="fa-solid fa-plus"></i>
            <span>Log Document</span>
          </button>
        </div>

        <!-- Files List -->
        <div class="space-y-2">
          ${files.length > 0 ? files.map((file, idx) => `
            <div class="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition">
              <div class="flex items-center space-x-3 truncate mr-3">
                <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm flex-shrink-0">
                  <i class="fa-solid fa-file-lines"></i>
                </div>
                <div class="truncate">
                  <div class="font-medium text-xs text-slate-900 dark:text-white truncate font-mono">${escapeHtml(file.name)}</div>
                  <div class="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                    <span>${escapeHtml(file.year || 'Consolidated')}</span>
                    <span>&bull;</span>
                    <span>${escapeHtml(file.notes || 'Verified evidence')}</span>
                  </div>
                </div>
              </div>

              <div class="flex items-center space-x-2 flex-shrink-0">
                <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${
                  file.status === 'Verified by IQAC' || file.status === 'Ready for SSR'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }">
                  ${escapeHtml(file.status || 'Draft')}
                </span>
                <button data-delete-file-idx="${idx}" class="btn-delete-file p-1.5 text-slate-400 hover:text-rose-600 transition" title="Remove File Entry">
                  <i class="fa-regular fa-trash-can text-xs"></i>
                </button>
              </div>
            </div>
          `).join('') : `
            <div class="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-6 text-center text-slate-400">
              <i class="fa-solid fa-cloud-arrow-up text-3xl mb-2 text-slate-300 dark:text-slate-600"></i>
              <p class="text-xs font-medium text-slate-600 dark:text-slate-300">No evidence documents logged yet in this folder</p>
              <p class="text-[11px] text-slate-400 mt-1">Copy files into your local directory: <code class="font-mono">${escapeHtml(folderWindowsPath)}</code>, then log them above.</p>
            </div>
          `}
        </div>

      </div>
    `;

    // Event listeners inside workspace
    // Status change
    const statusSelect = document.getElementById('select-active-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        metric.status = e.target.value;
        saveData();
        renderFolderTree();
        showToast(`Metric ${metric.metricNo} status updated to ${metric.status}`);
      });
    }

    // Copy folder path
    const btnCopyPath = document.getElementById('btn-copy-folder-path');
    if (btnCopyPath) {
      btnCopyPath.addEventListener('click', () => {
        const path = btnCopyPath.getAttribute('data-path');
        copyToClipboard(path, 'Folder path copied to clipboard! Paste into Windows Explorer.');
      });
    }

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
          year: 'Consolidated (5 Years)',
          status: 'Ready for SSR',
          notes: 'Standard NAAC documentary proof'
        });
        saveData();
        renderFolderWorkspace();
        renderFolderTree();
        showToast(`Logged ${fileName} to ${metric.metricNo}`);
      });
    });

    // Delete logged file
    container.querySelectorAll('.btn-delete-file').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-delete-file-idx'), 10);
        if (metric.evidenceFiles && metric.evidenceFiles[idx]) {
          metric.evidenceFiles.splice(idx, 1);
          saveData();
          renderFolderWorkspace();
          renderFolderTree();
          showToast('Evidence document removed from log');
        }
      });
    });

    // Year pill clicks in workspace
    container.querySelectorAll('.year-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const yr = btn.getAttribute('data-year');
        cycleYearStatus(metric, yr);
        saveData();
        renderFolderWorkspace();
        renderFolderTree();
      });
    });

    // Open add file modal
    const btnOpenFileModal = document.getElementById('btn-open-file-modal');
    if (btnOpenFileModal) {
      btnOpenFileModal.addEventListener('click', () => {
        openAddFileModal();
      });
    }
  }

  function renderYearPills(metric) {
    const years = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
    const metricYears = metric.years || {};

    return years.map(yr => {
      const val = metricYears[yr] || 'Pending';
      let bg = 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700';
      let icon = 'fa-regular fa-circle';

      if (val === 'Available') {
        bg = 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
        icon = 'fa-solid fa-circle-check text-emerald-600';
      } else if (val === 'Partial') {
        bg = 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border-amber-300 dark:border-amber-800';
        icon = 'fa-solid fa-circle-half-stroke text-amber-500';
      } else if (val === 'Missing') {
        bg = 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border-rose-300 dark:border-rose-800';
        icon = 'fa-solid fa-circle-xmark text-rose-500';
      }

      return `
        <button data-year="${yr}" class="year-pill year-pill-btn p-2 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1 ${bg}">
          <span class="text-[10px] font-mono font-bold">${yr}</span>
          <i class="${icon} text-xs"></i>
          <span class="text-[9px] font-semibold uppercase">${val}</span>
        </button>
      `;
    }).join('');
  }

  function cycleYearStatus(metric, year) {
    if (!metric.years) metric.years = {};
    const current = metric.years[year] || 'Pending';
    // Cycle: Pending -> Available -> Partial -> Missing -> Pending
    let next = 'Available';
    if (current === 'Pending') next = 'Available';
    else if (current === 'Available') next = 'Partial';
    else if (current === 'Partial') next = 'Missing';
    else if (current === 'Missing') next = 'Pending';
    
    metric.years[year] = next;
  }

  // --- VIEW 2: GAP ANALYSIS & 5-YEAR MATRIX ---
  function renderGapMatrix() {
    const container = document.getElementById('matrix-items-container');
    if (!container) return;

    let metrics = getActiveMetrics();

    // Filters
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
        <div class="bg-white dark:bg-slate-850 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400">
          <i class="fa-solid fa-filter-circle-xmark text-4xl mb-3 text-slate-300 dark:text-slate-600"></i>
          <p class="text-sm font-semibold text-slate-700 dark:text-slate-300">No metrics match the current filters</p>
          <p class="text-xs text-slate-400 mt-1">Try clearing search terms or resetting filters.</p>
        </div>
      `;
      return;
    }

    if (matrixViewMode === 'cards') {
      container.innerHTML = renderMatrixCards(metrics);
    } else {
      container.innerHTML = renderMatrixTable(metrics);
    }

    attachMatrixEventListeners(container);
  }

  function renderMatrixCards(metrics) {
    return metrics.map(m => {
      const years = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
      const isQual = (m.metricType || 'QlM') === 'QlM';

      return `
        <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
          
          <div class="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div class="flex items-center space-x-3">
              <span class="px-3 py-1 rounded-xl text-xs font-bold font-mono bg-indigo-50 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                ${escapeHtml(m.metricNo)}
              </span>
              <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                isQual ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              }">
                ${m.metricType || 'QlM'}
              </span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                Weight: ${escapeHtml(m.weightage || '-')}
              </span>
            </div>

            <div class="flex items-center space-x-2">
              <button data-switch-folder="${m.id}" class="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium flex items-center space-x-1">
                <i class="fa-solid fa-folder-tree"></i>
                <span>Open Folder</span>
              </button>
              <select data-metric-status-id="${m.id}" class="matrix-status-select text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                <option value="Not Started" ${m.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
                <option value="In Progress" ${m.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                <option value="Under Review" ${m.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
                <option value="Completed" ${m.status === 'Completed' ? 'selected' : ''}>Completed</option>
              </select>
            </div>
          </div>

          <p class="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
            ${escapeHtml(m.indicator || '')}
          </p>

          <!-- 5-Year Assessment Row -->
          <div>
            <div class="text-[11px] font-bold uppercase text-slate-400 mb-1.5 flex items-center justify-between">
              <span>5-Year Status Matrix (Click to toggle)</span>
              <span class="font-normal text-slate-400">${(m.evidenceFiles || []).length} Logged Files</span>
            </div>
            <div class="grid grid-cols-5 gap-2">
              ${years.map(yr => {
                const val = (m.years || {})[yr] || 'Pending';
                let bg = 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400';
                if (val === 'Available') bg = 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300';
                else if (val === 'Partial') bg = 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300';
                else if (val === 'Missing') bg = 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300';

                return `
                  <button data-m-id="${m.id}" data-year="${yr}" class="matrix-year-btn year-pill py-1.5 px-2 rounded-lg border text-center transition ${bg}">
                    <div class="text-[10px] font-mono font-bold">${yr}</div>
                    <div class="text-[9px] uppercase font-semibold">${val}</div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Responsible Dept & Action Plan Row -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Responsible Dept. / Office</label>
              <input type="text" data-field="responsible" data-m-id="${m.id}" value="${escapeHtml(m.responsible || '')}" placeholder="e.g. IQAC, Registrar, HR" class="matrix-inline-input w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>

            <div>
              <label class="block text-[11px] font-semibold text-slate-500 mb-1">Gap / Corrective Action Plan</label>
              <input type="text" data-field="actionPlan" data-m-id="${m.id}" value="${escapeHtml(m.actionPlan || '')}" placeholder="Action steps and deadlines..." class="matrix-inline-input w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>

        </div>
      `;
    }).join('');
  }

  function renderMatrixTable(metrics) {
    const years = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];

    return `
      <div class="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs text-slate-600 dark:text-slate-300">
            <thead class="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th class="py-3 px-3">Metric</th>
                <th class="py-3 px-2">Weight</th>
                <th class="py-3 px-3 min-w-[280px]">Indicator & Folder</th>
                ${years.map(yr => `<th class="py-3 px-2 text-center">${yr}</th>`).join('')}
                <th class="py-3 px-3 min-w-[140px]">Responsible</th>
                <th class="py-3 px-3 min-w-[160px]">Action Plan</th>
                <th class="py-3 px-3">Status</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
              ${metrics.map(m => `
                <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition">
                  <td class="py-2.5 px-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    <button data-switch-folder="${m.id}" class="hover:underline flex items-center space-x-1">
                      <span>${escapeHtml(m.metricNo)}</span>
                      <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i>
                    </button>
                  </td>
                  <td class="py-2.5 px-2 font-semibold text-slate-800 dark:text-slate-100">${escapeHtml(m.weightage || '-')}</td>
                  <td class="py-2.5 px-3">
                    <div class="font-medium text-slate-800 dark:text-slate-200 leading-snug line-clamp-2" title="${escapeHtml(m.indicator || '')}">
                      ${escapeHtml(m.indicator || '')}
                    </div>
                    <div class="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[260px]">
                      ${escapeHtml(m.folder || '')}
                    </div>
                  </td>
                  ${years.map(yr => {
                    const val = (m.years || {})[yr] || 'Pending';
                    let color = 'text-slate-400';
                    if (val === 'Available') color = 'text-emerald-600 font-bold';
                    else if (val === 'Partial') color = 'text-amber-500 font-semibold';
                    else if (val === 'Missing') color = 'text-rose-600 font-bold';

                    return `
                      <td class="py-2.5 px-1 text-center">
                        <button data-m-id="${m.id}" data-year="${yr}" class="matrix-year-btn px-1.5 py-0.5 rounded text-[10px] uppercase font-mono hover:bg-slate-100 dark:hover:bg-slate-700 ${color}">
                          ${val.slice(0, 4)}
                        </button>
                      </td>
                    `;
                  }).join('')}
                  <td class="py-2.5 px-3">
                    <input type="text" data-field="responsible" data-m-id="${m.id}" value="${escapeHtml(m.responsible || '')}" class="matrix-inline-input w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100" />
                  </td>
                  <td class="py-2.5 px-3">
                    <input type="text" data-field="actionPlan" data-m-id="${m.id}" value="${escapeHtml(m.actionPlan || '')}" class="matrix-inline-input w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-slate-800 dark:text-slate-100" />
                  </td>
                  <td class="py-2.5 px-3">
                    <select data-metric-status-id="${m.id}" class="matrix-status-select text-[11px] font-semibold px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                      <option value="Not Started" ${m.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
                      <option value="In Progress" ${m.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                      <option value="Under Review" ${m.status === 'Under Review' ? 'selected' : ''}>Under Review</option>
                      <option value="Completed" ${m.status === 'Completed' ? 'selected' : ''}>Completed</option>
                    </select>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function attachMatrixEventListeners(container) {
    // Switch to folder view for specific metric
    container.querySelectorAll('[data-switch-folder]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-switch-folder');
        activeMetricId = id;
        switchTab('folders');
      });
    });

    // Year buttons
    container.querySelectorAll('.matrix-year-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-m-id');
        const yr = btn.getAttribute('data-year');
        const metrics = getActiveMetrics();
        const m = metrics.find(item => item.id === id);
        if (m) {
          cycleYearStatus(m, yr);
          saveData();
          renderGapMatrix();
        }
      });
    });

    // Inline inputs (responsible, action plan)
    container.querySelectorAll('.matrix-inline-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-m-id');
        const field = e.target.getAttribute('data-field');
        const metrics = getActiveMetrics();
        const m = metrics.find(item => item.id === id);
        if (m && field) {
          m[field] = e.target.value;
          saveData();
          showToast(`Updated ${field} for ${m.metricNo}`);
        }
      });
    });

    // Status selects
    container.querySelectorAll('.matrix-status-select').forEach(select => {
      select.addEventListener('change', (e) => {
        const id = e.target.getAttribute('data-metric-status-id');
        const metrics = getActiveMetrics();
        const m = metrics.find(item => item.id === id);
        if (m) {
          m.status = e.target.value;
          saveData();
          renderGapMatrix();
          showToast(`Status updated for ${m.metricNo}`);
        }
      });
    });
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
    // Filter metrics with weightage >= 7
    const highWeight = metrics
      .filter(m => (parseFloat(m.weightage) || 0) >= 7)
      .sort((a, b) => (parseFloat(b.weightage) || 0) - (parseFloat(a.weightage) || 0));

    if (highWeight.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-400">No metrics with weightage >= 7 found in active criterion.</td></tr>`;
      return;
    }

    tbody.innerHTML = highWeight.map(m => {
      let statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Not Started</span>';
      if (m.status === 'Completed') statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">Completed</span>';
      else if (m.status === 'In Progress') statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">In Progress</span>';
      else if (m.status === 'Under Review') statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">Under Review</span>';

      return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td class="py-2.5 px-3 font-mono font-bold text-indigo-600">${escapeHtml(m.metricNo)}</td>
          <td class="py-2.5 px-3">
            <span class="px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              ${escapeHtml(m.weightage)} Marks
            </span>
          </td>
          <td class="py-2.5 px-3 text-slate-500">${escapeHtml(m.keyIndicator || '')}</td>
          <td class="py-2.5 px-3 font-medium text-slate-800 dark:text-slate-200">${escapeHtml(m.indicator || '')}</td>
          <td class="py-2.5 px-3">${statusBadge}</td>
          <td class="py-2.5 px-3 font-medium text-slate-600 dark:text-slate-300">${escapeHtml(m.actionPlan || 'Audit required')}</td>
        </tr>
      `;
    }).join('');
  }

  function renderAnalyticsCharts() {
    if (typeof Chart === 'undefined') return;

    const isDark = document.documentElement.classList.contains('dark');
    const textColor = isDark ? '#94a3b8' : '#475569';
    const gridColor = isDark ? '#334155' : '#e2e8f0';

    const metrics = getActiveMetrics();

    // 1. Key Indicator Readiness
    const kiStats = {};
    metrics.forEach(m => {
      // Group by prefix (e.g. 6.1, 6.2, etc.)
      const prefixMatch = m.metricNo.match(/^(\d+\.\d+)/);
      const prefix = prefixMatch ? prefixMatch[1] : (m.keyIndicator || 'Other');
      if (!kiStats[prefix]) {
        kiStats[prefix] = { total: 0, completed: 0, weight: 0 };
      }
      kiStats[prefix].total++;
      kiStats[prefix].weight += (parseFloat(m.weightage) || 0);
      if (m.status === 'Completed') kiStats[prefix].completed += 1;
      else if (m.status === 'In Progress' || m.status === 'Under Review') kiStats[prefix].completed += 0.5;
    });

    const kiLabels = Object.keys(kiStats);
    const kiPercentages = kiLabels.map(k => Math.round((kiStats[k].completed / kiStats[k].total) * 100));

    const ctxKi = document.getElementById('chart-indicator-readiness');
    if (ctxKi) {
      if (chartIndicator) chartIndicator.destroy();
      chartIndicator = new Chart(ctxKi, {
        type: 'bar',
        data: {
          labels: kiLabels.map(k => `Indicator ${k}`),
          datasets: [{
            label: 'Readiness %',
            data: kiPercentages,
            backgroundColor: 'rgba(99, 102, 241, 0.75)',
            borderColor: '#6366f1',
            borderWidth: 1.5,
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { color: textColor },
              grid: { color: gridColor }
            },
            x: {
              ticks: { color: textColor },
              grid: { display: false }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });
    }

    // 2. Status Distribution Pie
    const statusCounts = {
      'Completed': 0,
      'In Progress': 0,
      'Under Review': 0,
      'Not Started': 0
    };
    metrics.forEach(m => {
      statusCounts[m.status || 'Not Started'] = (statusCounts[m.status || 'Not Started'] || 0) + 1;
    });

    const ctxPie = document.getElementById('chart-status-pie');
    if (ctxPie) {
      if (chartStatus) chartStatus.destroy();
      chartStatus = new Chart(ctxPie, {
        type: 'doughnut',
        data: {
          labels: ['Completed', 'In Progress', 'Under Review', 'Not Started'],
          datasets: [{
            data: [
              statusCounts['Completed'],
              statusCounts['In Progress'],
              statusCounts['Under Review'],
              statusCounts['Not Started']
            ],
            backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#94a3b8']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: textColor, boxWidth: 12 }
            }
          }
        }
      });
    }

    // 3. 5-Year Compliance Trend
    const years = ['2021-22', '2022-23', '2023-24', '2024-25', '2025-26'];
    const availCounts = [0, 0, 0, 0, 0];
    const partCounts = [0, 0, 0, 0, 0];
    const missCounts = [0, 0, 0, 0, 0];

    metrics.forEach(m => {
      const my = m.years || {};
      years.forEach((yr, idx) => {
        const val = my[yr] || 'Pending';
        if (val === 'Available') availCounts[idx]++;
        else if (val === 'Partial') partCounts[idx]++;
        else if (val === 'Missing') missCounts[idx]++;
      });
    });

    const ctxFive = document.getElementById('chart-five-year');
    if (ctxFive) {
      if (chartFiveYear) chartFiveYear.destroy();
      chartFiveYear = new Chart(ctxFive, {
        type: 'bar',
        data: {
          labels: years,
          datasets: [
            {
              label: 'Available Evidence',
              data: availCounts,
              backgroundColor: '#10b981',
              borderRadius: 6
            },
            {
              label: 'Partial / In Progress',
              data: partCounts,
              backgroundColor: '#f59e0b',
              borderRadius: 6
            },
            {
              label: 'Missing Evidence (Gaps)',
              data: missCounts,
              backgroundColor: '#ef4444',
              borderRadius: 6
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { stacked: true, ticks: { color: textColor }, grid: { display: false } },
            y: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: textColor, boxWidth: 12 }
            }
          }
        }
      });
    }
  }

  // --- TAB NAVIGATION ---
  function switchTab(tab) {
    activeTab = tab;

    // Button states
    document.querySelectorAll('.view-tab-btn').forEach(btn => {
      btn.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800';
    });

    const activeBtn = document.getElementById(`tab-btn-${tab}`);
    if (activeBtn) {
      activeBtn.className = 'view-tab-btn flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold transition bg-indigo-600 text-white shadow-sm';
    }

    // Sections
    document.getElementById('view-folders').classList.add('hidden');
    document.getElementById('view-matrix').classList.add('hidden');
    document.getElementById('view-analytics').classList.add('hidden');

    document.getElementById(`view-${tab}`).classList.remove('hidden');

    renderAll();
  }

  // --- MODALS & FORMS ---
  function openAddFileModal() {
    const modal = document.getElementById('modal-add-file');
    if (!modal) return;
    document.getElementById('form-add-file').reset();
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
    const year = document.getElementById('input-file-year').value;
    const status = document.getElementById('input-file-status').value;
    const notes = document.getElementById('input-file-notes').value.trim();

    if (!name) return;

    if (!metric.evidenceFiles) metric.evidenceFiles = [];
    metric.evidenceFiles.push({ name, year, status, notes });

    saveData();
    closeAddFileModal();
    renderFolderWorkspace();
    renderFolderTree();
    showToast(`Logged "${name}" to Metric ${metric.metricNo}`);
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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appData, null, 2));
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
          appData = imported;
          saveData();
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
    if (confirm('Are you sure you want to reset all data back to institutional default templates? Any unexported edits will be cleared.')) {
      appData = JSON.parse(JSON.stringify(window.DEFAULT_NAAC_DATA || {}));
      saveData();
      renderAll();
      closeBackupModal();
      showToast('Reset to default templates completed.');
    }
  }

  function exportExcel() {
    if (typeof XLSX === 'undefined') {
      showToast('SheetJS library is loading, please try again in a moment.', 'warning');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Export active criterion sheet
    const metrics = getActiveMetrics();
    const rows = [
      ['Metric No.', 'Weightage', 'Metric / Indicator Description', 'Required Documents (SSR Manual)', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', 'Responsible Dept', 'Action Plan', 'Status', 'Logged Evidence Count']
    ];

    metrics.forEach(m => {
      const my = m.years || {};
      rows.push([
        m.metricNo,
        m.weightage,
        m.indicator,
        m.docsRequiredRaw,
        my['2021-22'] || 'Pending',
        my['2022-23'] || 'Pending',
        my['2023-24'] || 'Pending',
        my['2024-25'] || 'Pending',
        my['2025-26'] || 'Pending',
        m.responsible || '',
        m.actionPlan || '',
        m.status || 'Not Started',
        (m.evidenceFiles || []).length
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, currentCriterionKey.slice(0, 31));

    XLSX.writeFile(wb, `NAAC_${currentCriterionKey.replace(/\s+/g, '_')}_Updated_Gap_Analysis.xlsx`);
    showToast('Updated Excel spreadsheet exported!');
  }

  function printReport() {
    const printDate = document.getElementById('print-date');
    if (printDate) printDate.textContent = new Date().toLocaleDateString('en-IN', { dateStyle: 'full' });

    // Populate print table
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
            <td class="p-1.5 border text-center">${my['2021-22'] || '-'}</td>
            <td class="p-1.5 border text-center">${my['2022-23'] || '-'}</td>
            <td class="p-1.5 border text-center">${my['2023-24'] || '-'}</td>
            <td class="p-1.5 border text-center">${my['2024-25'] || '-'}</td>
            <td class="p-1.5 border text-center">${my['2025-26'] || '-'}</td>
            <td class="p-1.5 border">
              <div>Dept: ${escapeHtml(m.responsible || 'IQAC')}</div>
              <div>Plan: ${escapeHtml(m.actionPlan || '-')}</div>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Stats for print
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
    // Theme toggle
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Criteria select
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
    const tabMatrix = document.getElementById('tab-btn-matrix');
    const tabAnalytics = document.getElementById('tab-btn-analytics');

    if (tabFolders) tabFolders.addEventListener('click', () => switchTab('folders'));
    if (tabMatrix) tabMatrix.addEventListener('click', () => switchTab('matrix'));
    if (tabAnalytics) tabAnalytics.addEventListener('click', () => switchTab('analytics'));

    // Copy Root Path
    const btnCopyRoot = document.getElementById('btn-copy-root-path');
    if (btnCopyRoot) {
      btnCopyRoot.addEventListener('click', () => {
        copyToClipboard('NAAC – Criterion VI', 'Copied root folder name!');
      });
    }

    // Search and filters in Matrix
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

    // View mode in Matrix (Cards vs Table)
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

    // Modals
    const btnGithub = document.getElementById('btn-github-guide');
    if (btnGithub) btnGithub.addEventListener('click', openGithubModal);
    const btnCloseGithub = document.getElementById('btn-close-github-modal');
    if (btnCloseGithub) btnCloseGithub.addEventListener('click', closeGithubModal);
    const btnDismissGithub = document.getElementById('btn-dismiss-github-modal');
    if (btnDismissGithub) btnDismissGithub.addEventListener('click', closeGithubModal);

    const btnBackup = document.getElementById('btn-backup-restore');
    if (btnBackup) btnBackup.addEventListener('click', openBackupModal);
    const btnCloseBackup = document.getElementById('btn-close-backup-modal');
    if (btnCloseBackup) btnCloseBackup.addEventListener('click', closeBackupModal);

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

    // Git commands copy
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

    // Trigger animation
    setTimeout(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    // Remove after 3.5s
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

  // Auto-boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
