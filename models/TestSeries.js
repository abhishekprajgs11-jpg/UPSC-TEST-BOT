const mongoose = require('mongoose');

const testSeriesSchema = new mongoose.Schema({
  year: {
    type: String,
    required: true,
  },
  coaching: {
    type: String,
    required: true,
  },
  testCode: {
    type: String,
    required: true,
  },
  questionPdfId: {
    type: String,
    required: false,
  },
  solutionPdfId: {
    type: String,
    required: false, // In case solution is added later
  }
}, { timestamps: true });

module.exports = mongoose.model('TestSeries', testSeriesSchema);
