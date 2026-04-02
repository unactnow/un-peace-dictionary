const multer = require('multer');
const path = require('path');
const sharp = require('sharp');

const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 85;

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) return cb(null, true);
  cb(new Error('Only image files are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

upload.processImage = async (file) => {
  if (!file || !file.buffer) return null;

  try {
    const image = sharp(file.buffer);
    const metadata = await image.metadata();

    let pipeline = image;
    if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
      pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    return await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } catch (err) {
    console.error('Image processing failed:', err.message);
    return file.buffer;
  }
};

module.exports = upload;
