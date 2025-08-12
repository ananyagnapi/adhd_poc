const mongoose = require('mongoose');

const questionnaireSchema = new mongoose.Schema({
  title: { type: String, required: true }
});

const Questionnaire = mongoose.model('Questionnaire', questionnaireSchema);
module.exports = Questionnaire;
