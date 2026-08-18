const express = require('express');
const PrivateConversation = require('../models/PrivateConversation');
const PrivateMessage = require('../models/PrivateMessage');
const Friend = require('../models/Friend');
const User = require('../models/User');
const auth = require('../middleware/auth');
const router = express.Router();
const fields = 'name email avatarColor';

async function getConversationForUser(id, otherId) {
  return PrivateConversation.findOne({ participants: { $all: [id, otherId] } });
}
async function ensureFriend(a, b) { return !!(await Friend.findOne({ user: a, friend: b })); }
async function getOrCreate(a, b) {
  let c = await getConversationForUser(a, b);
  if (!c) {
    c = await PrivateConversation.create({ participants: [a, b] });
  }
  return c;
}

router.get('/conversations', auth, async (req, res) => {
  try {
    const conversations = await PrivateConversation.find({ participants: req.user.id }).populate('participants', fields).sort({ updatedAt: -1 });
    res.json(conversations);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error fetching conversations' }); }
});

router.post('/conversations', auth, async (req, res) => {
  try {
    const otherId = String(req.body.userId || '');
    if (!otherId || otherId === String(req.user.id)) return res.status(400).json({ message: 'Invalid friend' });
    if (!await User.exists({ _id: otherId })) return res.status(404).json({ message: 'User not found' });
    if (!await ensureFriend(req.user.id, otherId)) return res.status(403).json({ message: 'You can chat privately only with accepted friends' });
    const conversation = await getOrCreate(req.user.id, otherId);
    await conversation.populate('participants', fields);
    res.json(conversation);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error creating conversation' }); }
});

router.get('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const c = await PrivateConversation.findOne({ _id: req.params.id, participants: req.user.id });
    if (!c) return res.status(403).json({ message: 'Conversation not found or access denied' });
    // Sort newest-first so `limit` keeps the most RECENT messages (not the
    // oldest), then reverse back to chronological order for display.
    const messages = await PrivateMessage.find({ conversation: c._id, hiddenFor: { $ne: req.user.id } })
      .populate('sender', fields)
      .populate('recipient', fields)
      .populate({ path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: 'name' } })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    res.json(messages.reverse());
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error fetching private messages' }); }
});


// Clear private chat history only for the logged-in user. The other friend keeps their history.
router.delete('/conversations/:id/messages', auth, async (req, res) => {
  try {
    const c = await PrivateConversation.findOne({ _id: req.params.id, participants: req.user.id });
    if (!c) return res.status(403).json({ message: 'Conversation not found or access denied' });
    await PrivateMessage.updateMany(
      { conversation: c._id },
      { $addToSet: { hiddenFor: req.user.id } }
    );
    res.json({ message: 'Chat history cleared' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error clearing chat history' }); }
});

router.put('/messages/:id', auth, async (req, res) => {
  try {
    const message = await PrivateMessage.findById(req.params.id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (String(message.sender) !== String(req.user.id)) return res.status(403).json({ message: 'You can edit only your own messages' });
    const c = await PrivateConversation.findOne({ _id: message.conversation, participants: req.user.id });
    if (!c) return res.status(403).json({ message: 'Access denied' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Message text is required' });
    message.text = text; message.edited = true; message.editedAt = new Date(); await message.save();
    const populated = await message.populate('sender', fields); await populated.populate('recipient', fields); await populated;
    req.app.get('io')?.to(`conversation:${c._id}`).emit('privateMessageEdited', populated);
    res.json(populated);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error editing private message' }); }
});

module.exports = router;
