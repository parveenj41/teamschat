const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  friend: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Nickname is set by `user` for `friend`, and only visible to `user` - the other
  // side has their own separate Friend document with their own independent nickname.
  nickname: { type: String, default: null, trim: true }
}, { timestamps: true });

schema.index({ user: 1, friend: 1 }, { unique: true });
module.exports = mongoose.model('Friend', schema);
