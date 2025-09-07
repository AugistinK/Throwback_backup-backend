// utils/authValidation.js
const Joi = require('joi');

// Validation pour l'inscription
const registerValidation = (data) => {
  const schema = Joi.object({
    nom: Joi.string().min(2).max(100).required()
      .messages({
        'string.min': 'Le nom doit contenir au moins 2 caractères',
        'string.max': 'Le nom ne peut pas dépasser 100 caractères',
        'any.required': 'Le nom est requis'
      }),
    prenom: Joi.string().min(2).max(100).required()
      .messages({
        'string.min': 'Le prénom doit contenir au moins 2 caractères',
        'string.max': 'Le prénom ne peut pas dépasser 100 caractères',
        'any.required': 'Le prénom est requis'
      }),
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Veuillez fournir une adresse email valide',
        'any.required': 'L\'email est requis'
      }),
    password: Joi.string().min(8).required()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d]{8,}$'))
      .messages({
        'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
        'string.pattern.base': 'Le mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule et un chiffre',
        'any.required': 'Le mot de passe est requis'
      }),
    confirmPassword: Joi.ref('password'),
    date_naissance: Joi.date().max('now').messages({
      'date.max': 'La date de naissance ne peut pas être dans le futur'
    }),
    genre: Joi.string().valid('HOMME', 'FEMME', 'AUTRE'),
    pays: Joi.string().max(100),
    ville: Joi.string().max(100),
    acceptTerms: Joi.boolean().valid(true).required()
      .messages({
        'any.only': 'Vous devez accepter les conditions d\'utilisation',
        'any.required': 'Vous devez accepter les conditions d\'utilisation'
      })
  }).with('password', 'confirmPassword');

  return schema.validate(data);
};

// Validation pour la connexion
const loginValidation = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Veuillez fournir une adresse email valide',
        'any.required': 'L\'email est requis'
      }),
    password: Joi.string().required()
      .messages({
        'any.required': 'Le mot de passe est requis'
      }),
    remember: Joi.boolean()
  });

  return schema.validate(data);
};

// Validation pour la réinitialisation du mot de passe
const resetPasswordValidation = (data) => {
  const schema = Joi.object({
    token: Joi.string().required()
      .messages({
        'any.required': 'Le token est requis'
      }),
    password: Joi.string().min(8).required()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d]{8,}$'))
      .messages({
        'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
        'string.pattern.base': 'Le mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule et un chiffre',
        'any.required': 'Le mot de passe est requis'
      }),
    confirmPassword: Joi.ref('password')
  }).with('password', 'confirmPassword');

  return schema.validate(data);
};

// Validation pour la demande de réinitialisation
const forgotPasswordValidation = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required()
      .messages({
        'string.email': 'Veuillez fournir une adresse email valide',
        'any.required': 'L\'email est requis'
      })
  });

  return schema.validate(data);
};

// Validation pour la mise à jour du profil
const updateProfileValidation = (data) => {
  const schema = Joi.object({
    nom: Joi.string().min(2).max(100)
      .messages({
        'string.min': 'Le nom doit contenir au moins 2 caractères',
        'string.max': 'Le nom ne peut pas dépasser 100 caractères'
      }),
    prenom: Joi.string().min(2).max(100)
      .messages({
        'string.min': 'Le prénom doit contenir au moins 2 caractères',
        'string.max': 'Le prénom ne peut pas dépasser 100 caractères'
      }),
    bio: Joi.string().max(500)
      .messages({
        'string.max': 'La bio ne peut pas dépasser 500 caractères'
      }),
    date_naissance: Joi.date().max('now')
      .messages({
        'date.max': 'La date de naissance ne peut pas être dans le futur'
      }),
    genre: Joi.string().valid('HOMME', 'FEMME', 'AUTRE'),
    pays: Joi.string().max(100),
    ville: Joi.string().max(100),
    adresse: Joi.string().max(255),
    code_postal: Joi.string().max(20),
    telephone: Joi.string().max(20),
    profession: Joi.string().max(50),
    photo_profil: Joi.string().max(255),
    compte_prive: Joi.boolean(),
    preferences_confidentialite: Joi.object(),
    preferences_notification: Joi.object()
  });

  return schema.validate(data);
};

// Validation pour le changement de mot de passe
const changePasswordValidation = (data) => {
  const schema = Joi.object({
    currentPassword: Joi.string().required()
      .messages({
        'any.required': 'Le mot de passe actuel est requis'
      }),
    newPassword: Joi.string().min(8).required()
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)[a-zA-Z\\d]{8,}$'))
      .messages({
        'string.min': 'Le nouveau mot de passe doit contenir au moins 8 caractères',
        'string.pattern.base': 'Le nouveau mot de passe doit contenir au moins une lettre majuscule, une lettre minuscule et un chiffre',
        'any.required': 'Le nouveau mot de passe est requis'
      }),
    confirmPassword: Joi.ref('newPassword')
  }).with('newPassword', 'confirmPassword');

  return schema.validate(data);
};

module.exports = {
  registerValidation,
  loginValidation,
  resetPasswordValidation,
  forgotPasswordValidation,
  updateProfileValidation,
  changePasswordValidation
};
