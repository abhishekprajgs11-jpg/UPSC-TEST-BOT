const mongoose = require('mongoose');

const adminStateSchema = new mongoose.Schema({
  adminId: {
    type: String,
    required: true,
    unique: true
  },
  step: {
    type: String, // 'CHOOSE_TYPE', 'WAITING_TEST_PDF', 'WAITING_SOL_PDF', 'CHOOSE_COACHING', 'WAITING_CUSTOM_COACHING', 'CHOOSE_YEAR', 'WAITING_TEST_CODE'
    required: true,
  },
  type: {
    type: String, // 'TEST_ONLY', 'TEST_AND_SOL'
    default: null
  },
  questionPdfId: {
    type: String,
    default: null
  },
  solutionPdfId: {
    type: String,
    default: null
  },
  coaching: {
    type: String,
    default: null
  },
  year: {
    type: String,
    default: null
  },
  testCode: {
    type: String,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('AdminState', adminStateSchema);
