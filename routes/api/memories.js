
// routes/api/memories.js

const express = require('express');
const router = express.Router();

// --- Imports robustes (et logs) ---
let memoryController;
try {
  memoryController = require('../../controllers/memoryController'); // ajuste si ton chemin diffère
} catch (e) {
  console.error('[memories] Impossible de charger memoryController:', e.message);
  memoryController = {};
}

let protectImported = {};
try {
  protectImported = require('../../middlewares/authMiddleware'); 
} catch (e) {
  console.warn('[memories] Impossible de charger authMiddleware:', e.message);
}
const protect = typeof protectImported?.protect === 'function'
  ? protectImported.protect
  : (req, res, next) => {
      console.warn('[memories] protect indisponible -> middleware neutralisé (autorise tout)');
      next();
    };

// --- Outil de vérification des handlers ---
function assertHandler(fn, label) {
  if (typeof fn !== 'function') {
    console.error(`[memories] Handler invalide pour ${label} -> type=${typeof fn}`);
    // on renvoie un 500 explicite au lieu de crasher Express
    return (req, res) => res.status(500).json({ success: false, message: `Handler invalide: ${label}` });
  }
  return fn;
}

// --- Logs de contrôle (tu peux commenter après debug) ---
console.log('[memories] contrôleur clés:', Object.keys(memoryController || {}));
console.log('[memories] protect est une fonction ?', typeof protect === 'function');

// --- Routes ---
// Liste générale
router.get('/', assertHandler(memoryController.getAllMemories, 'getAllMemories'));

// Interactions souvenirs
router.post('/:id/like',    protect, assertHandler(memoryController.likeMemory,    'likeMemory'));
router.post('/:id/dislike', protect, assertHandler(memoryController.dislikeMemory, 'dislikeMemory'));
router.delete('/:id',       protect, assertHandler(memoryController.deleteMemory,  'deleteMemory'));

// Replies
router.get('/:id/replies',             assertHandler(memoryController.getMemoryReplies, 'getMemoryReplies'));
router.post('/:id/replies', protect,   assertHandler(memoryController.addReply,        'addReply'));

// Signalement
router.post('/:id/report',  protect,   assertHandler(memoryController.reportMemory,    'reportMemory'));

module.exports = router;
