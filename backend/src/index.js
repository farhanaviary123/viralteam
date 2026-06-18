require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/angles', require('./routes/angles'));
app.use('/api/formats', require('./routes/formats'));
app.use('/api', require('./routes/formatExamples')); // mounts /api/formats/:id/examples and /api/format-examples/:id
app.use('/api/copy-lines', require('./routes/copyLines'));
app.use('/api/concepts', require('./routes/concepts'));
app.use('/api/preset-concepts', require('./routes/presetConcepts'));
app.use('/api/clips', require('./routes/clips'));
app.use('/api', require('./routes/clipExamples')); // mounts /api/clips/:id/examples and /api/clip-examples/:id
app.use('/api', require('./routes/clipStructures').router); // mounts /formats/:id/clip-structures + /clip-structures/:id
app.use('/api/songs', require('./routes/songs'));
app.use('/api/vibes', require('./routes/vibes'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/users', require('./routes/users'));
app.use('/api/performance', require('./routes/performance'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/products', require('./routes/products'));
app.use('/api/guide-content', require('./routes/guideContent'));
app.use('/api', require('./routes/conceptUploads')); // /concepts/:id/uploads, /uploads/:id/download, /concept-uploads/summary

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Scalemax API running on port ${PORT}`));
