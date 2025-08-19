const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  questionnaire_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Questionnaire', required: true },
  question_text: { type: String, required: true },
  language: { type: String, required: true, enum: ['en', 'hi', 'es'] },
  question_type: { type: String, required: true },
  is_approved: { type: Boolean, default: true },
  created_by: { type: String, default: null },
  updated_by: { type: String, default: null },
  status: { type: String, default: 'approved' }
}, {
  timestamps: true
});

const Question = mongoose.model('Question', questionSchema);
module.exports = Question;
