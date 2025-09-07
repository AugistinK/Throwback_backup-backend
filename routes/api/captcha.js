// routes/api/captcha.js - Routes pour les CAPTCHAs
const express = require('express');
const router = express.Router();
const captchaGenerator = require('../../utils/captcha');

/**
 * @route   GET /api/captcha/generate
 * @desc    Générer un nouveau CAPTCHA
 * @access  Public
 */
router.get('/generate', (req, res) => {
  try {
    const type = req.query.type || 'math'; // 'math' ou 'text'
    
    let captcha;
    if (type === 'text') {
      captcha = captchaGenerator.generateTextCaptcha();
    } else {
      captcha = captchaGenerator.generateCaptcha();
    }
    
    res.json({
      success: true,
      data: captcha
    });
  } catch (error) {
    console.error('Erreur génération CAPTCHA:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération du CAPTCHA'
    });
  }
});

/**
 * @route   POST /api/captcha/verify
 * @desc    Vérifier un CAPTCHA
 * @access  Public
 */
router.post('/verify', (req, res) => {
  try {
    const { captchaId, answer } = req.body;
    
    if (!captchaId || !answer) {
      return res.status(400).json({
        success: false,
        message: 'CAPTCHA ID et réponse requis'
      });
    }
    
    const result = captchaGenerator.verifyCaptcha(captchaId, answer);
    
    res.json({
      success: result.valid,
      message: result.error || 'CAPTCHA vérifié avec succès'
    });
  } catch (error) {
    console.error('Erreur vérification CAPTCHA:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du CAPTCHA'
    });
  }
});

/**
 * @route   GET /api/captcha/stats
 * @desc    Obtenir les statistiques des CAPTCHAs
 * @access  Public (en production, protéger cette route)
 */
router.get('/stats', (req, res) => {
  try {
    const stats = captchaGenerator.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Erreur stats CAPTCHA:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
});

module.exports = router;