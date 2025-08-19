const mongoose = require('mongoose');

const questionnaireSchema = new mongoose.Schema({
  form_id: { type: String, required: true }
}, {
  timestamps: true
});

const Questionnaire = mongoose.model('Questionnaire', questionnaireSchema);
module.exports = Questionnaire;
