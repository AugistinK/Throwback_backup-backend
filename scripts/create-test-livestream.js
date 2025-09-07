const mongoose = require('mongoose');
const LiveStream = require('../models/LiveStream');
require('dotenv').config();

async function createTestLivestream() {
  try {
    // Connexion à la base de données
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    
    // Création d'un livestream de test
    const testStream = new LiveStream({
      title: "Compilation rap français des années 90",
      description: "Les meilleurs titres du rap français des années 90",
      scheduledStartTime: new Date(),
      actualStartTime: new Date(),
      status: "LIVE",
      streamKey: LiveStream.generateStreamKey(),
      streamUrl: "rtmp://example.com/live",
      playbackUrl: "https://www.youtube.com/embed/playlist?list=PLjT3XS2hb44UYOmOS9tXLvGzg60TMnqGQ",
      thumbnailUrl: "/images/live-default.jpg",
      category: "MUSIC_PERFORMANCE",
      isPublic: true,
      chatEnabled: true,
      moderationEnabled: true,
      hostName: "ThrowBack Host",
      tags: ["rap", "français", "90s", "nostalgie"],
      author: mongoose.Types.ObjectId("60d0fe4f5311236168a109ca"), // Remplacer par un ID valide d'un utilisateur dans votre base
      compilationType: "VIDEO_COLLECTION",
      compilationVideos: [
        {
          sourceId: "IAm-Classique",
          sourceType: "YOUTUBE",
          title: "IAM - Je danse le Mia",
          thumbnailUrl: "/images/thumbnails/iam-mia.jpg"
        },
        {
          sourceId: "NTM-Classique",
          sourceType: "YOUTUBE",
          title: "Suprême NTM - C'est arrivé près d'chez toi",
          thumbnailUrl: "/images/thumbnails/ntm-arrivé.jpg"
        }
      ],
      playbackConfig: {
        loop: true,
        autoplay: true,
        shuffle: false
      },
      statistics: {
        totalUniqueViewers: 127,
        likes: 42
      }
    });
    
    await testStream.save();
    
    console.log('Test livestream created successfully:', testStream._id);
  } catch (error) {
    console.error('Error creating test livestream:', error);
  } finally {
    mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

createTestLivestream();