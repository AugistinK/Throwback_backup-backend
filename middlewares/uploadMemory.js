// middlewares/uploadMemory.js
const multer = require('multer');

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file?.mimetype?.startsWith('image/')) return cb(null, true);
    cb(new Error('Seules les images sont autorisées'), false);
  }
});




module.exports = uploadMemory;
