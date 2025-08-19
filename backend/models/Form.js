const mongoose = require('mongoose');

const formSchema = new mongoose.Schema({
  title: { type: String, required: true }
}, {
  timestamps: true
});

const Form = mongoose.model('Form', formSchema);
module.exports = Form;
