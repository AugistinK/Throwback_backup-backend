// utils/captcha.js - Générateur de CAPTCHA simple
const crypto = require('crypto');

class CaptchaGenerator {
  constructor() {
    this.captchaStore = new Map(); // En production, utilisez Redis
    this.expiryTime = 5 * 60 * 1000; // 5 minutes
  }

  // Générer un CAPTCHA simple (texte + mathématiques)
  generateCaptcha() {
    const captchaId = crypto.randomBytes(16).toString('hex');
    
    // Générer une question mathématique simple
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let num1, num2, answer;
    
    switch (operation) {
      case '+':
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        answer = num1 + num2;
        break;
      case '-':
        num1 = Math.floor(Math.random() * 50) + 25;
        num2 = Math.floor(Math.random() * 25) + 1;
        answer = num1 - num2;
        break;
      case '*':
        num1 = Math.floor(Math.random() * 10) + 1;
        num2 = Math.floor(Math.random() * 10) + 1;
        answer = num1 * num2;
        break;
    }

    const question = `${num1} ${operation} ${num2}`;
    
    // Stocker le CAPTCHA avec expiration
    this.captchaStore.set(captchaId, {
      answer: answer.toString(),
      createdAt: Date.now(),
      expiresAt: Date.now() + this.expiryTime
    });

    // Nettoyer les anciens CAPTCHAs
    this.cleanExpiredCaptchas();

    return {
      captchaId,
      question
    };
  }

  // Générer un CAPTCHA textuel
  generateTextCaptcha() {
    const captchaId = crypto.randomBytes(16).toString('hex');
    
    // Caractères possibles (éviter les ambigus comme 0, O, l, I)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let text = '';
    
    // Générer 6 caractères
    for (let i = 0; i < 6; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Stocker le CAPTCHA
    this.captchaStore.set(captchaId, {
      answer: text,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.expiryTime
    });

    this.cleanExpiredCaptchas();

    return {
      captchaId,
      text
    };
  }

  // Vérifier un CAPTCHA
  verifyCaptcha(captchaId, userAnswer) {
    const captcha = this.captchaStore.get(captchaId);
    
    if (!captcha) {
      return { valid: false, error: 'CAPTCHA not found or expired' };
    }

    if (Date.now() > captcha.expiresAt) {
      this.captchaStore.delete(captchaId);
      return { valid: false, error: 'CAPTCHA expired' };
    }

    // Vérifier la réponse (insensible à la casse pour le texte)
    const isValid = captcha.answer.toLowerCase() === userAnswer.toLowerCase();
    
    // Supprimer le CAPTCHA après utilisation
    this.captchaStore.delete(captchaId);
    
    return { 
      valid: isValid, 
      error: isValid ? null : 'Invalid CAPTCHA' 
    };
  }

  // Nettoyer les CAPTCHAs expirés
  cleanExpiredCaptchas() {
    const now = Date.now();
    for (const [id, captcha] of this.captchaStore.entries()) {
      if (now > captcha.expiresAt) {
        this.captchaStore.delete(id);
      }
    }
  }

  // Obtenir les statistiques
  getStats() {
    return {
      total: this.captchaStore.size,
      expired: Array.from(this.captchaStore.values()).filter(
        c => Date.now() > c.expiresAt
      ).length
    };
  }
}

// Instance globale
const captchaGenerator = new CaptchaGenerator();

module.exports = captchaGenerator;