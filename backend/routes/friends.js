const express = require('express');
const User = require('../models/User');
const Friend = require('../models/Friend');
const FriendRequest = require('../models/FriendRequest');
const PrivateConversation = require('../models/PrivateConversation');
const auth = require('../middleware/auth');
const Notification = require('../models/Notification');
const router = express.Router();

const userFields = 'name email avatarColor';

// Escapes regex special characters so search input is treated as a literal
// substring match, not a regex pattern (avoids server errors / unexpected
// matches when a user types things like "(", "*", "+", "." in the search box).
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get('/', auth, async (req, res) => {
  try {
    const docs = await Friend.find({ user: req.user.id }).populate('friend', userFields + ' lastSeen');
    const conversations = await PrivateConversation.find({ participants: req.user.id }).select('participants updatedAt');
    const activity = new Map();
    conversations.forEach(c => {
      const otherId = c.participants.map(String).find(id => id !== String(req.user.id));
      if (otherId) activity.set(otherId, new Date(c.updatedAt || c.createdAt).getTime());
    });
    const result = docs
      .filter(d => d.friend)
      .map(d => ({
        ...d.friend.toObject(),
        nickname: d.nickname || null,
        displayName: d.nickname || d.friend.name,
        lastChatAt: activity.get(String(d.friend._id)) || new Date(d.createdAt).getTime()
      }))
      .sort((a, b) => b.lastChatAt - a.lastChatAt);
    res.json(result);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error fetching friends' }); }
});

// @route PUT /api/friends/:friendUserId/nickname - rename how a friend appears to you only
router.put('/:friendUserId/nickname', auth, async (req, res) => {
  try {
    const nickname = String(req.body.nickname || '').trim();
    const doc = await Friend.findOneAndUpdate(
      { user: req.user.id, friend: req.params.friendUserId },
      { nickname: nickname || null },
      { new: true }
    ).populate('friend', userFields + ' lastSeen');
    if (!doc) return res.status(404).json({ message: 'Friend not found' });
    res.json({ ...doc.friend.toObject(), nickname: doc.nickname || null, displayName: doc.nickname || doc.friend.name });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error updating nickname' }); }
});

router.get('/requests', auth, async (req, res) => {
  try {
    const incoming = await FriendRequest.find({ recipient: req.user.id, status: 'pending' }).populate('sender', userFields).sort({ createdAt: -1 });
    const outgoing = await FriendRequest.find({ sender: req.user.id, status: 'pending' }).populate('recipient', userFields).sort({ createdAt: -1 });
    res.json({ incoming, outgoing });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error fetching friend requests' }); }
});

router.get('/search', auth, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const users = await User.find({ _id: { $ne: req.user.id }, $or: [{ name: { $regex: escapeRegex(q), $options: 'i' } }, { email: { $regex: escapeRegex(q), $options: 'i' } }] }).select(userFields).limit(20);
    const friendDocs = await Friend.find({ user: req.user.id }).select('friend');
    const friendIds = new Set(friendDocs.map(f => String(f.friend)));
    res.json(users.map(u => ({ ...u.toObject(), isFriend: friendIds.has(String(u._id)) })));
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error searching users' }); }
});

router.post('/request', auth, async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const target = await User.findOne({ email });
    if (!target) return res.status(404).json({ message: 'No registered user found with that email' });
    if (String(target._id) === String(req.user.id)) return res.status(400).json({ message: 'You cannot add yourself' });
    const existingFriend = await Friend.findOne({ user: req.user.id, friend: target._id });
    if (existingFriend) return res.status(400).json({ message: 'You are already friends' });
    const reverse = await FriendRequest.findOne({ sender: target._id, recipient: req.user.id, status: 'pending' });
    if (reverse) return res.status(400).json({ message: 'This user has already sent you a friend request. Accept it from Friend Requests.' });
    const existing = await FriendRequest.findOne({ sender: req.user.id, recipient: target._id });
    if (existing?.status === 'pending') return res.status(400).json({ message: 'Friend request already sent' });
    const request = await FriendRequest.findOneAndUpdate({ sender: req.user.id, recipient: target._id }, { status: 'pending' }, { upsert: true, new: true, setDefaultsOnInsert: true }).populate('recipient', userFields).populate('sender', userFields);
    await Notification.findOneAndUpdate(
      { recipient: target._id, type: 'friendRequest', sourceId: String(request._id), read: false },
      { $inc: { count: 1 }, $set: { text: `${req.user.name} sent you a friend request`, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    req.app.get('io')?.to(`user:${target._id}`).emit('friendRequest', request);
    req.app.get('io')?.to(`user:${target._id}`).emit('notification', {
      type: 'friendRequest',
      sourceId: String(request._id),
      count: 1
    });
    res.status(201).json(request);
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error sending friend request' }); }
});

router.post('/requests/:id/accept', auth, async (req, res) => {
  try {
    const request = await FriendRequest.findOne({ _id: req.params.id, recipient: req.user.id, status: 'pending' });
    if (!request) return res.status(404).json({ message: 'Friend request not found' });
    request.status = 'accepted'; await request.save();
    await Friend.create([{ user: request.sender, friend: request.recipient }, { user: request.recipient, friend: request.sender }]).catch(err => { if (err.code !== 11000) throw err; });
    const friend = await User.findById(request.sender).select(userFields);
    await Notification.deleteMany({ recipient: req.user.id, type: 'friendRequest', sourceId: String(request._id) });
    req.app.get('io')?.to(`user:${request.sender}`).emit('friendAccepted', friend);
    req.app.get('io')?.to(`user:${request.recipient}`).emit('friendRequestUpdated', { requestId: request._id, status: 'accepted' });
    res.json({ message: 'Friend request accepted', friend });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error accepting request' }); }
});

router.post('/requests/:id/reject', auth, async (req, res) => {
  try {
    const request = await FriendRequest.findOneAndUpdate({ _id: req.params.id, recipient: req.user.id, status: 'pending' }, { status: 'rejected' }, { new: true });
    if (!request) return res.status(404).json({ message: 'Friend request not found' });
    await Notification.deleteMany({ recipient: req.user.id, type: 'friendRequest', sourceId: String(request._id) });
    req.app.get('io')?.to(`user:${request.sender}`).emit('friendRequestUpdated', { requestId: request._id, status: 'rejected' });
    req.app.get('io')?.to(`user:${request.recipient}`).emit('friendRequestUpdated', { requestId: request._id, status: 'rejected' });
    res.json({ message: 'Friend request rejected' });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Server error rejecting request' }); }
});

module.exports = router;
