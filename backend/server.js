require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const messageRoutes = require('./routes/messages');
const friendRoutes = require('./routes/friends');
const privateRoutes = require('./routes/private');
const Message = require('./models/Message');
const Group = require('./models/Group');
const PrivateMessage = require('./models/PrivateMessage');
const PrivateConversation = require('./models/PrivateConversation');
const Friend = require('./models/Friend');
const User = require('./models/User');
const Notification = require('./models/Notification');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/private', privateRoutes);
const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'), err => { if (err) next(); });
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err.message));

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch { next(new Error('Invalid or expired token')); }
});

async function populateGroupMessage(message) {
  // Single populate() call with all paths = one round trip instead of two.
  await message.populate([
    { path: 'sender', select: 'name email avatarColor' },
    { path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: 'name' } }
  ]);
  return message;
}
async function populatePrivateMessage(message) {
  await message.populate([
    { path: 'sender', select: 'name email avatarColor' },
    { path: 'recipient', select: 'name email avatarColor' },
    { path: 'replyTo', select: 'text sender', populate: { path: 'sender', select: 'name' } }
  ]);
  return message;
}

async function createUnreadNotification({ recipient, type, sourceId, messageId = null, groupId = null, conversationId = null, text = '' }) {
  if (!recipient) return;
  const query = { recipient, type, sourceId, read: false };
  await Notification.findOneAndUpdate(
    query,
    { $inc: { count: 1 }, $set: { messageId, groupId, conversationId, text, updatedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

// ---- Online presence tracking ----
// Maps a user id to the set of active socket ids they currently have open
// (a user can have more than one tab/device open at once).
const onlineUsers = new Map();

function markOnline(userId) {
  const id = String(userId);
  if (!onlineUsers.has(id)) onlineUsers.set(id, new Set());
  return onlineUsers.get(id);
}

io.on('connection', socket => {
  const uid = String(socket.user.id);
  socket.join(`user:${uid}`);
  console.log(`Socket connected: ${socket.user.name} (${socket.id})`);

  const wasOffline = !onlineUsers.has(uid) || onlineUsers.get(uid).size === 0;
  markOnline(uid).add(socket.id);

  // Update lastSeen immediately when a user connects instead of waiting
  // for the first 20-second heartbeat.
  User.findByIdAndUpdate(uid, { lastSeen: new Date() }).catch(err =>
    console.error('initial lastSeen update:', err.message)
  );

  // Tell the newly-connected client who's currently online.
  socket.emit('onlineUsers', Array.from(onlineUsers.keys()));

  // If this user just came online (first tab/device), let everyone know.
  if (wasOffline) {
    io.emit('presenceUpdate', { userId: uid, online: true });
  }

  socket.on('joinGroup', async groupId => {
    try {
      const group = await Group.findById(groupId);
      if (group?.members.some(m => String(m) === uid)) socket.join(`group:${groupId}`);
    } catch (e) { console.error('joinGroup:', e.message); }
  });
  socket.on('leaveGroup', groupId => socket.leave(`group:${groupId}`));

  socket.on('joinConversation', async conversationId => {
    try {
      const c = await PrivateConversation.findOne({ _id: conversationId, participants: socket.user.id });
      if (c) socket.join(`conversation:${conversationId}`);
    } catch (e) { console.error('joinConversation:', e.message); }
  });
  socket.on('leaveConversation', conversationId => socket.leave(`conversation:${conversationId}`));

  socket.on('sendMessage', async ({ groupId, text, replyTo }) => {
    try {
      const clean = String(text || '').trim();
      if (!clean) return;
      const group = await Group.findById(groupId);
      if (!group || !group.members.some(m => String(m) === uid)) return;

      let replyToId = null;
      if (replyTo) {
        const original = await Message.findOne({ _id: replyTo, group: groupId });
        if (original) replyToId = original._id;
      }

      const message = await Message.create({ group: groupId, sender: uid, text: clean, replyTo: replyToId });
      // Keep recently active groups at the top of the chat list.
      await Group.findByIdAndUpdate(groupId, { updatedAt: new Date() });
      await populateGroupMessage(message);
      io.to(`group:${groupId}`).emit('newMessage', message);

      // Persist an unread notification for every other group member.
      // Run the writes concurrently instead of awaiting one member at a time -
      // otherwise a large group serially delays every other member's notification.
      const otherMembers = group.members.map(String).filter(memberUid => memberUid !== uid);
      await Promise.all(otherMembers.map(memberUid =>
        createUnreadNotification({
          recipient: memberUid,
          type: 'group',
          sourceId: String(groupId),
          messageId: message._id,
          groupId: groupId,
          text: clean
        })
      ));
      for (const memberUid of otherMembers) {
        io.to(`user:${memberUid}`).emit('notification', {
          type: 'group',
          sourceId: String(groupId),
          messageId: String(message._id),
          text: clean,
          count: 1
        });
      }
    } catch (e) { console.error('sendMessage:', e.message); }
  });

  socket.on('sendPrivateMessage', async ({ conversationId, text, replyTo }) => {
    try {
      const clean = String(text || '').trim();
      if (!clean) return;
      const c = await PrivateConversation.findOne({ _id: conversationId, participants: uid });
      if (!c) return;
      const recipient = c.participants.find(p => String(p) !== uid);
      if (!recipient || !(await Friend.exists({ user: uid, friend: recipient }))) return;

      let replyToId = null;
      if (replyTo) {
        const original = await PrivateMessage.findOne({ _id: replyTo, conversation: c._id });
        if (original) replyToId = original._id;
      }

      const message = await PrivateMessage.create({ conversation: c._id, sender: uid, recipient, text: clean, replyTo: replyToId });
      // Keep recently active private chats at the top for both participants.
      c.updatedAt = new Date();
      await c.save();
      await populatePrivateMessage(message);
      io.to(`conversation:${conversationId}`).emit('newPrivateMessage', message);

      const recipientId = String(recipient);
      await createUnreadNotification({
        recipient: recipientId,
        type: 'private',
        sourceId: String(uid),
        messageId: message._id,
        conversationId: conversationId,
        text: clean
      });
      io.to(`user:${recipientId}`).emit('notification', {
        type: 'private',
        sourceId: String(uid),
        conversationId: String(conversationId),
        messageId: String(message._id),
        text: clean,
        count: 1
      });
    } catch (e) { console.error('sendPrivateMessage:', e.message); }
  });

  socket.on('typing', ({ groupId }) => socket.to(`group:${groupId}`).emit('userTyping', { name: socket.user.name }));
  socket.on('privateTyping', ({ conversationId }) => socket.to(`conversation:${conversationId}`).emit('privateTyping', { name: socket.user.name }));
  socket.on('presenceHeartbeat', async () => {
    try {
      if (onlineUsers.has(uid)) await User.findByIdAndUpdate(uid, { lastSeen: new Date() });
    } catch (e) { console.error('presenceHeartbeat:', e.message); }
  });

  socket.on('disconnect', async () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const set = onlineUsers.get(uid);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(uid);
        const lastSeen = new Date();
        try { await User.findByIdAndUpdate(uid, { lastSeen }); } catch (e) { console.error('lastSeen update:', e.message); }
        io.emit('presenceUpdate', { userId: uid, online: false, lastSeen });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
