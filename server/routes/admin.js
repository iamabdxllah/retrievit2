/**
 * RetrieVIT — Admin Moderation Routes
 * Backend-enforced endpoints for verified administrators (role === 'admin')
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
const firebaseService = require('../services/firebaseService');
const supabaseStorageService = require('../services/supabaseStorageService');

// All routes in this router require authentication and administrator role
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/reports
 * Fetch all reports with author and status details for moderation review
 */
router.get('/reports', async (req, res) => {
  try {
    const { type, status, limit = 100 } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (status) filters.status = status;

    const items = await firebaseService.queryDocs('items', filters, 'createdAt', parseInt(limit, 10));

    // Attach signed photo URLs for moderation review
    const enriched = await Promise.all(items.map(async (item) => {
      let resolvedUrl = item.imageUrl || null;
      if (item.storagePath) {
        try {
          resolvedUrl = await supabaseStorageService.getSignedPhotoUrl(item.storagePath, 900) || resolvedUrl;
        } catch (e) {
          console.warn('[Admin] Failed to generate signed URL for item:', item.id);
        }
      }

      return {
        id: item.id,
        type: item.type,
        title: item.title,
        description: item.description,
        location: item.location,
        locationUnknown: item.locationUnknown || false,
        date: item.date,
        time: item.time,
        color: item.color,
        imageUrl: resolvedUrl,
        storagePath: item.storagePath || null,
        status: item.status,
        currentStatus: item.currentStatus || (item.type === 'found' ? 'with_finder' : undefined),
        securityDetails: item.securityDetails || '',
        userId: item.userId,
        userName: item.userName || 'Student',
        userEmail: item.userEmail || '',
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      };
    }));

    res.json({
      success: true,
      count: enriched.length,
      reports: enriched
    });
  } catch (err) {
    console.error('[Admin] Get reports error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch reports for moderation.' });
  }
});

/**
 * DELETE /api/admin/reports/:id
 * Permanently delete any inappropriate report, remove associated Supabase photo,
 * and create an immutable audit record in moderationLogs.
 */
router.delete('/reports/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const { reason, details } = req.body || {};

    const item = await firebaseService.getDoc('items', reportId);
    if (!item) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    // Clean up Supabase private photo if it exists
    if (item.storagePath) {
      console.log('[Admin] Removing Supabase storage photo for report:', item.storagePath);
      await supabaseStorageService.deleteItemPhoto(item.storagePath).catch((err) => {
        console.warn('[Admin] Supabase photo removal warning:', err.message);
      });
    }

    // Permanently remove report from Firestore
    await firebaseService.deleteDoc('items', reportId);

    // Record moderation log in Firestore
    const validReasons = ['Inappropriate content', 'Spam', 'Duplicate', 'Other'];
    const chosenReason = reason && validReasons.includes(reason) ? reason : (reason || 'Inappropriate content');

    const logEntry = {
      adminUid: req.user.uid,
      targetReportId: reportId,
      reportTitle: item.title || 'Untitled',
      reportType: item.type || 'unknown',
      reportAuthorId: item.userId || null,
      action: 'delete_report',
      reason: chosenReason,
      details: (details && typeof details === 'string' ? details.slice(0, 300).trim() : null),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    try {
      await firebaseService.addDoc('moderationLogs', logEntry);
    } catch (logErr) {
      console.error('[Admin] Warning: Failed to record moderation log:', logErr.message);
    }

    res.json({
      success: true,
      message: 'Report permanently removed by administrator.',
      reportId,
      log: logEntry
    });
  } catch (err) {
    console.error('[Admin] Delete report error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete report.' });
  }
});

/**
 * GET /api/admin/logs
 * Retrieve recent moderation audit logs
 */
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = await firebaseService.queryDocs('moderationLogs', {}, 'timestamp', limit);

    res.json({
      success: true,
      count: logs.length,
      logs
    });
  } catch (err) {
    console.error('[Admin] Get logs error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch moderation logs.' });
  }
});

/**
 * GET /api/admin/stats
 * Aggregate overview counts for admin dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    const allItems = await firebaseService.queryDocs('items', {}, 'createdAt', 200);
    const allLogs = await firebaseService.queryDocs('moderationLogs', {}, 'timestamp', 200);

    const stats = {
      totalReports: allItems.length,
      lostReports: allItems.filter(i => i.type === 'lost').length,
      foundReports: allItems.filter(i => i.type === 'found').length,
      activeReports: allItems.filter(i => i.status === 'active' || i.status === 'searching').length,
      resolvedReports: allItems.filter(i => i.status === 'resolved' || i.status === 'returned_to_owner').length,
      moderationActions: allLogs.length
    };

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('[Admin] Get stats error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch admin stats.' });
  }
});

module.exports = router;
