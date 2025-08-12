const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  question_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  option_text: { type: String, required: true },
  sort_order: { type: Number, default: 0 },
  created_at: { type: String }
});

const Option = mongoose.model('Option', optionSchema);
module.exports = Option;
