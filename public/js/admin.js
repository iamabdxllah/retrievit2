/**
 * RetrieVIT — Admin Moderation Client Script
 * Powers the Admin Moderation Portal for verified administrators
 */

let allAdminReports = [];
let allAdminLogs = [];
let activeTargetReport = null;

document.addEventListener('DOMContentLoaded', () => {
  // Listen for auth resolution
  document.addEventListener('authStateChanged', (e) => {
    const user = e.detail?.user;
    if (user && user.role === 'admin') {
      loadAdminData();
    } else if (user && user.role !== 'admin') {
      window.location.href = '/find-items.html';
    }
  });

  // Fallback if auth already resolved
  if (LostLink.currentUser) {
    if (LostLink.currentUser.role === 'admin') {
      loadAdminData();
    } else {
      window.location.href = '/find-items.html';
    }
  }
});

/**
 * Load stats, reports, and logs from backend admin endpoints
 */
async function loadAdminData() {
  try {
    await Promise.all([
      fetchAdminStats(),
      fetchAdminReports(),
      fetchAdminLogs()
    ]);
  } catch (err) {
    console.error('[Admin] Error loading dashboard data:', err);
    LostLink.showToast(err.message || 'Failed to load moderation data.', 'error');
  }
}

async function fetchAdminStats() {
  try {
    const res = await LostLink.api('/api/admin/stats');
    if (res.success && res.stats) {
      document.getElementById('statTotalReports').textContent = res.stats.totalReports ?? 0;
      document.getElementById('statLostReports').textContent = res.stats.lostReports ?? 0;
      document.getElementById('statFoundReports').textContent = res.stats.foundReports ?? 0;
      document.getElementById('statModerationCount').textContent = res.stats.moderationActions ?? 0;
    }
  } catch (err) {
    console.warn('[Admin] Could not load stats:', err.message);
  }
}

async function fetchAdminReports() {
  const tbody = document.getElementById('adminReportsTbody');
  tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">Loading reports...</td></tr>`;

  try {
    const res = await LostLink.api('/api/admin/reports');
    allAdminReports = res.reports || [];
    renderAdminReports(allAdminReports);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--danger);">Failed to load reports: ${LostLink.sanitize(err.message)}</td></tr>`;
  }
}

async function fetchAdminLogs() {
  const tbody = document.getElementById('adminLogsTbody');
  tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">Loading logs...</td></tr>`;

  try {
    const res = await LostLink.api('/api/admin/logs');
    allAdminLogs = res.logs || [];
    renderAdminLogs(allAdminLogs);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: var(--space-8); color: var(--danger);">Failed to load audit logs: ${LostLink.sanitize(err.message)}</td></tr>`;
  }
}

function filterAdminReports() {
  const query = (document.getElementById('adminSearchInput').value || '').toLowerCase().trim();
  const typeFilter = document.getElementById('adminTypeFilter').value;
  const statusFilter = document.getElementById('adminStatusFilter').value;

  const filtered = allAdminReports.filter((r) => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (query) {
      const title = (r.title || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const loc = (r.location || '').toLowerCase();
      const author = (r.userName || '').toLowerCase();
      const email = (r.userEmail || '').toLowerCase();
      return title.includes(query) || desc.includes(query) || loc.includes(query) || author.includes(query) || email.includes(query);
    }
    return true;
  });

  renderAdminReports(filtered);
}

function renderAdminReports(reports) {
  const tbody = document.getElementById('adminReportsTbody');

  if (!reports || reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">No reports match current filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = reports.map((r) => {
    const typeBadge = r.type === 'lost' 
      ? '<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: var(--accent); border: 1px solid rgba(245, 158, 11, 0.25);">Lost</span>'
      : '<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.25);">Found</span>';

    const statusBadge = r.status === 'resolved'
      ? '<span class="badge" style="background: rgba(16, 185, 129, 0.12); color: var(--success);">Resolved</span>'
      : '<span class="badge" style="background: rgba(59, 130, 246, 0.12); color: #3b82f6;">Active</span>';

    const thumbHtml = r.imageUrl 
      ? `<img src="${LostLink.sanitize(r.imageUrl)}" alt="Item thumbnail" class="report-thumb" loading="lazy">`
      : `<div class="thumb-placeholder">${r.type === 'lost' ? 'LOST' : 'FOUND'}</div>`;

    const formattedDate = r.date ? LostLink.formatDate(r.date) : 'N/A';

    return `
      <tr id="admin-row-${r.id}">
        <td>${thumbHtml}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 2px;">
            ${LostLink.sanitize(r.title || 'Untitled')}
          </div>
          <div style="color: var(--text-secondary); font-size: var(--text-xs); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${LostLink.sanitize(r.description || '')}
          </div>
        </td>
        <td>${typeBadge}</td>
        <td>
          <div style="color: var(--text-primary); font-size: var(--text-xs); font-weight: 500;">
            ${LostLink.sanitize(r.location || 'Campus')}
          </div>
          <div style="color: var(--text-secondary); font-size: 11px;">
            ${formattedDate}
          </div>
        </td>
        <td>
          <div style="font-weight: 500; color: var(--text-primary); font-size: var(--text-xs);">
            ${LostLink.sanitize(r.userName || 'Student')}
          </div>
          <div style="color: var(--text-secondary); font-size: 11px;">
            ${LostLink.sanitize(r.userEmail || '')}
          </div>
        </td>
        <td>${statusBadge}</td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: var(--space-2); align-items: center;">
            <a href="item-details.html?id=${encodeURIComponent(r.id)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm" style="font-size: var(--text-xs); padding: 4px 8px;">
              View
            </a>
            <button type="button" class="btn-delete-report" onclick="openDeleteModal('${r.id}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAdminLogs(logs) {
  const tbody = document.getElementById('adminLogsTbody');

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">No moderation actions recorded yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map((l) => {
    const formattedTime = l.timestamp ? new Date(l.timestamp).toLocaleString() : 'N/A';
    return `
      <tr>
        <td style="white-space: nowrap; font-size: var(--text-xs); color: var(--text-secondary);">${formattedTime}</td>
        <td>
          <div style="font-weight: 600; color: var(--text-primary);">${LostLink.sanitize(l.reportTitle || 'Unknown')}</div>
          <div style="font-size: 11px; color: var(--text-secondary); font-family: monospace;">ID: ${LostLink.sanitize(l.targetReportId || '')}</div>
        </td>
        <td><span class="badge badge-danger">${LostLink.sanitize(l.action || 'delete')}</span></td>
        <td><span style="font-weight: 500; color: var(--text-primary); font-size: var(--text-xs);">${LostLink.sanitize(l.reason || '')}</span></td>
        <td style="font-size: 11px; font-family: monospace; color: var(--text-secondary);">${LostLink.sanitize(l.adminUid || '')}</td>
        <td style="font-size: var(--text-xs); color: var(--text-secondary); max-width: 200px;">${LostLink.sanitize(l.details || '—')}</td>
      </tr>
    `;
  }).join('');
}

function switchAdminTab(tab) {
  const reportsSection = document.getElementById('reportsTabSection');
  const logsSection = document.getElementById('logsTabSection');
  const tabReportsBtn = document.getElementById('tabReportsBtn');
  const tabLogsBtn = document.getElementById('tabLogsBtn');

  if (tab === 'reports') {
    reportsSection.classList.remove('hidden');
    logsSection.classList.add('hidden');
    tabReportsBtn.classList.add('active');
    tabLogsBtn.classList.remove('active');
  } else {
    reportsSection.classList.add('hidden');
    logsSection.classList.remove('hidden');
    tabReportsBtn.classList.remove('active');
    tabLogsBtn.classList.add('active');
  }
}

function openDeleteModal(reportId) {
  const report = allAdminReports.find(r => r.id === reportId);
  if (!report) return;

  activeTargetReport = report;
  document.getElementById('modalReportTitle').textContent = report.title || 'Untitled Report';
  document.getElementById('modalReportMeta').textContent = `Type: ${report.type.toUpperCase()} • Author: ${report.userName} • Location: ${report.location}`;
  document.getElementById('deleteReasonSelect').value = 'Inappropriate content';
  document.getElementById('deleteReasonDetails').value = '';
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  activeTargetReport = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

async function executeReportDeletion() {
  if (!activeTargetReport) return;

  const btn = document.getElementById('confirmDeleteBtn');
  const reason = document.getElementById('deleteReasonSelect').value;
  const details = document.getElementById('deleteReasonDetails').value;
  const targetId = activeTargetReport.id;

  btn.disabled = true;
  btn.textContent = 'Deleting...';

  try {
    const res = await LostLink.api(`/api/admin/reports/${targetId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason, details })
    });

    LostLink.showToast(res.message || 'Report permanently deleted.', 'success');
    closeDeleteModal();

    // Remove row from table smoothly
    const row = document.getElementById(`admin-row-${targetId}`);
    if (row) {
      row.style.transition = 'opacity 0.3s ease';
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 300);
    }

    allAdminReports = allAdminReports.filter(r => r.id !== targetId);

    // Refresh stats and logs
    fetchAdminStats();
    fetchAdminLogs();
  } catch (err) {
    console.error('[Admin] Delete report failed:', err);
    LostLink.showToast(err.message || 'Failed to delete report.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Permanently Delete';
  }
}

// Global functions for inline HTML handlers
window.switchAdminTab = switchAdminTab;
window.filterAdminReports = filterAdminReports;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.executeReportDeletion = executeReportDeletion;
window.loadAdminData = loadAdminData;
