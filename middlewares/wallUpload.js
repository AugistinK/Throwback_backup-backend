// middlewares/wallUpload.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/wall');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `wall-${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ok = ['image/png','image/jpeg','image/webp','image/gif','video/mp4','video/webm','video/quicktime'];
  if (ok.includes(file.mimetype)) return cb(null, true);
  const err = new Error('Type de fichier non supporté (jpg, png, webp, gif, mp4, webm, mov)');
  err.code = 'INVALID_FILE_TYPE';
  cb(err, false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 150*1024*1024, files: 4 } });

module.exports = {
  wallUpload: upload.array('media', 4)
};
