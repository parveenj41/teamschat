const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// GET /api/groups filters by members on every dashboard load - without this
// index that query becomes a full collection scan as the groups collection grows.
groupSchema.index({ members: 1 });

groupSchema.pre('validate', function(next) {
  const members = [...new Set((this.members || []).map(String))];
  const admins = [...new Set((this.admins || []).map(String))].filter(id => members.includes(id));
  this.members = members;
  this.admins = admins;
  next();
});

module.exports = mongoose.model('Group', groupSchema);
