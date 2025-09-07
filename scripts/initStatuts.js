// scripts/initStatuts.js
const mongoose = require('mongoose');
const StatutUser = require('../models/StatutUser');
require('dotenv').config();

async function initStatuts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Define initial statuses
    const statuts = [
      {
        code_statut: 'ACTIF',
        libelle_statut: 'Active',
        couleur: '#4caf50',
        ordre_affichage: 1
      },
      {
        code_statut: 'INACTIF',
        libelle_statut: 'Inactive',
        couleur: '#9e9e9e',
        ordre_affichage: 2
      },
      {
        code_statut: 'VERROUILLE',
        libelle_statut: 'Locked',
        couleur: '#ff9800',
        ordre_affichage: 3
      },
      {
        code_statut: 'SUSPENDU',
        libelle_statut: 'Suspended',
        couleur: '#f44336',
        ordre_affichage: 4
      },
      {
        code_statut: 'SUPPRIME',
        libelle_statut: 'Deleted',
        couleur: '#d32f2f',
        ordre_affichage: 5
      }
    ];

    // Insert or update statuses
    for (const statut of statuts) {
      await StatutUser.findOneAndUpdate(
        { code_statut: statut.code_statut },
        statut,
        { upsert: true }
      );
      console.log(`Status ${statut.code_statut} initialized`);
    }

    console.log('All statuses initialized successfully');
    
    // Close connection
    await mongoose.connection.close();
    console.log('MongoDB connection closed');
  } catch (error) {
    console.error('Error initializing statuses:', error);
    process.exit(1);
  }
}

initStatuts();