require('dotenv').config();
const mongoose = require('mongoose');

async function checkMongoConnection() {
  console.log(' Diagnostic MongoDB\n');
  
  // 1. Vérifier les variables d'environnement
  console.log(' Configuration:');
  console.log('MONGO_URI:', process.env.MONGO_URI || ' NON DÉFINIE');
  console.log('');
  
  if (!process.env.MONGO_URI) {
    console.log(' MONGO_URI non définie dans le fichier .env');
    console.log(' Ajoutez la ligne suivante dans votre .env:');
    console.log('MONGO_URI=mongodb://localhost:27017/throwback');
    return;
  }
  
  // 2. Analyser l'URI
  try {
    const uri = process.env.MONGO_URI;
    console.log(' Analyse de l\'URI:');
    
    if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
      console.log(' Connexion locale détectée');
      console.log(' Assurez-vous que MongoDB est démarré localement');
    } else {
      console.log('  Connexion distante détectée');
      console.log(' Serveur:', uri.split('@')[1]?.split('/')[0] || 'Unknown');
      console.log(' Vérifiez votre connexion internet et les paramètres du serveur');
    }
    console.log('');
  } catch (error) {
    console.log(' Erreur analyse URI:', error.message);
  }
  
  // 3. Test de connexion avec différents timeouts
  const timeouts = [2000, 5000, 10000];
  
  for (const timeout of timeouts) {
    console.log(`  Test connexion (timeout: ${timeout}ms)...`);
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: timeout,
        socketTimeoutMS: timeout,
      });
      
      console.log(' CONNEXION RÉUSSIE !');
      console.log(' Database:', mongoose.connection.db.databaseName);
      console.log(' Host:', mongoose.connection.host);
      console.log(' Port:', mongoose.connection.port);
      console.log(' Ready State:', mongoose.connection.readyState);
      
      await mongoose.connection.close();
      console.log(' Connexion fermée proprement');
      return;
      
    } catch (error) {
      console.log(` Échec (${timeout}ms):`, error.name, '-', error.message);
      
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  }
  
  // 4. Diagnostics et solutions
  console.log('\n SOLUTIONS POSSIBLES:\n');
  
  if (process.env.MONGO_URI.includes('65.62.32.228')) {
    console.log(' Connexion à un serveur distant (65.62.32.228):');
    console.log('1. Vérifiez votre connexion internet');
    console.log('2. Vérifiez que le serveur MongoDB est accessible');
    console.log('3. Vérifiez vos identifiants MongoDB');
    console.log('4. Contactez l\'administrateur du serveur\n');
    
    console.log(' Alternative - Utiliser MongoDB local:');
    console.log('1. Installez MongoDB localement');
    console.log('2. Modifiez MONGO_URI dans .env:');
    console.log('   MONGO_URI=mongodb://localhost:27017/throwback');
    console.log('3. Démarrez MongoDB avec: mongod\n');
  } else {
    console.log(' Connexion locale:');
    console.log('1. Démarrez MongoDB: mongod');
    console.log('2. Vérifiez que le port 27017 est libre');
    console.log('3. Vérifiez le pare-feu\n');
  }
  
  console.log(' Commandes utiles:');
  console.log('- Vérifier si MongoDB est installé: mongod --version');
  console.log('- Démarrer MongoDB: mongod');
  console.log('- Se connecter avec le client: mongosh');
  console.log('- Vérifier les processus: netstat -an | findstr 27017');
}

// Fonction pour tester différentes URLs
async function testAlternativeUrls() {
  const testUrls = [
    'mongodb://localhost:27017/throwback',
    'mongodb://127.0.0.1:27017/throwback',
    'mongodb://localhost:27017/test',
  ];
  
  console.log('\n Test d\'URLs alternatives:\n');
  
  for (const url of testUrls) {
    console.log(`Testing: ${url}`);
    try {
      await mongoose.connect(url, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 3000,
      });
      
      console.log(' Connexion réussie !');
      await mongoose.connection.close();
      console.log(` Vous pouvez utiliser: MONGO_URI=${url}\n`);
      return url;
      
    } catch (error) {
      console.log(' Échec:', error.message);
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }
    }
  }
  
  console.log(' Aucune URL alternative ne fonctionne');
  return null;
}

// Exécution
async function main() {
  await checkMongoConnection();
  console.log('\n' + '='.repeat(50) + '\n');
  await testAlternativeUrls();
}

main().catch(console.error);