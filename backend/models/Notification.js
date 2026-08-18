const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['private', 'group', 'friendRequest'], required: true },
    sourceId: { type: String, required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'PrivateMessage', default: null },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'PrivateConversation', default: null },
    text: { type: String, default: '' },
    count: { type: Number, default: 1 },
    read: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, type: 1, sourceId: 1, read: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
