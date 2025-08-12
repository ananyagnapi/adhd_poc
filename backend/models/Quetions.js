const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question_text: { type: String, required: true },
  language: { type: String, default: 'en' },
  question_type: { type: String, required: true },
  is_approved: { type: Boolean, default: false },
  created_at: { type: String },
  updated_at: { type: String },
  created_by: { type: String, default: null },
  updated_by: { type: String, default: null },
  status: { type: String, default: 'pending' },
  qid: { type: String }
});

const Question = mongoose.model('Question', questionSchema);
module.exports = Question;
