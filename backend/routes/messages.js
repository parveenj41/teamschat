const express = require('express');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Group = require('../models/Group');
const auth = require('../middleware/auth');
const router = express.Router();
const member = (g, id) => g.members.some(x => String(x) === String(id));

router.get('/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (!member(group, req.user.id)) return res.status(403).json({ message: 'You are not a member of this group' });
    // Sort newest-first so `limit` keeps the most RECENT messages (not the
    // oldest), then reverse back to chronological order for display.
    const messages = await Message.find({ group: req.params.groupId })
      .populate('sender', 'name email avatarColor')
      .populate({ path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: 'name' } })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json(messages.reverse());
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error fetching messages' }); }
});

router.put('/:messageId', auth, async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (String(message.sender) !== String(req.user.id)) return res.status(403).json({ message: 'You can edit only your own messages' });
    const group = await Group.findById(message.group);
    if (!group || !member(group, req.user.id)) return res.status(403).json({ message: 'You are not allowed to edit this message' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Message text is required' });
    message.text = text; message.edited = true; message.editedAt = new Date(); await message.save();
    const populated = await message.populate('sender', 'name email avatarColor');
    await populated;
    req.app.get('io')?.to(group._id.toString()).emit('messageEdited', populated);
    res.json(populated);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error editing message' }); }
});

module.exports = router;
