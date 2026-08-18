const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }]
}, { timestamps: true });

schema.index({ participants: 1 });
module.exports = mongoose.model('PrivateConversation', schema);
