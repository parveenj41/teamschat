const express = require('express');
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');

const router = express.Router();

// Return all unread notification buckets for the logged-in user.
router.get('/', auth, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipient: req.user.id,
      read: false
    }).sort({ updatedAt: -1 });

    res.json(notifications.map(n => ({
      _id: n._id,
      type: n.type,
      sourceId: n.sourceId,
      messageId: n.messageId,
      groupId: n.groupId,
      conversationId: n.conversationId,
      text: n.text,
      count: n.count,
      read: n.read,
      updatedAt: n.updatedAt
    })));
  } catch (err) {
    console.error('GET /notifications:', err);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

// Mark one notification bucket/source as read.
router.post('/read', auth, async (req, res) => {
  try {
    const type = String(req.body.type || '').trim();
    const sourceId = String(req.body.sourceId || '').trim();

    if (!type || !sourceId) {
      return res.status(400).json({ message: 'type and sourceId are required' });
    }

    const result = await Notification.updateMany(
      { recipient: req.user.id, type, sourceId, read: false },
      { $set: { read: true, count: 0 } }
    );

    res.json({
      message: 'Notification marked as read',
      modifiedCount: result.modifiedCount || 0
    });
  } catch (err) {
    console.error('POST /notifications/read:', err);
    res.status(500).json({ message: 'Server error marking notification as read' });
  }
});

module.exports = router;
