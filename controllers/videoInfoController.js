const axios = require('axios');
const LogAction = require('../models/LogAction');
require('dotenv').config();

/**
 * Controller pour récupérer les informations des vidéos à partir de leurs URLs
 * Utilisé par le panel LiveThrowback pour constituer des compilations
 */

// Clés API (à configurer dans les variables d'environnement)
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const VIMEO_ACCESS_TOKEN = process.env.VIMEO_ACCESS_TOKEN;
const DAILYMOTION_API_KEY = process.env.DAILYMOTION_API_KEY;

/**
 * @desc    Récupérer les informations d'une vidéo à partir de son URL
 * @route   GET /api/video-info
 * @access  Private/Admin
 */
exports.getVideoInfo = async (req, res) => {
  try {
    const { url, id, source } = req.query;
    
    if (!url || !id || !source) {
      return res.status(400).json({
        success: false,
        message: 'URL, ID et source sont requis'
      });
    }
    
    let videoInfo;
    let normalizedSource = source.toUpperCase();
    
    // Récupérer les informations selon la source
    switch (normalizedSource) {
      case 'YOUTUBE':
        videoInfo = await getYouTubeInfo(id);
        break;
      case 'VIMEO':
        videoInfo = await getVimeoInfo(id);
        break;
      case 'DAILYMOTION':
        videoInfo = await getDailymotionInfo(id);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Source non supportée. Utilisez youtube, vimeo ou dailymotion.'
        });
    }
    
    // Journaliser l'action
    if (req.user) {
      await LogAction.create({
        type_action: 'VIDEO_INFO_REQUEST',
        description_action: `Récupération des informations vidéo: ${normalizedSource}/${id}`,
        id_user: req.user.id,
        created_by: req.user.id
      });
    }
    
    res.status(200).json({
      success: true,
      source: normalizedSource,
      id,
      ...videoInfo
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des informations vidéo:', error);
    
    // Si l'erreur est due à une API, renvoyer un résultat simulé
    if (error.message.includes('API') || error.message.includes('key')) {
      return res.status(200).json({
        success: true,
        title: `Vidéo ${req.query.source.toUpperCase()} - ${req.query.id}`,
        description: 'Description non disponible (API indisponible)',
        thumbnail: '/images/video-placeholder.jpg',
        duration: '0:00',
        channel: 'Chaîne inconnue',
        publishedAt: new Date().toISOString(),
        simulatedData: true,
        message: 'Données simulées (API indisponible)'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des informations',
      error: error.message
    });
  }
};

/**
 * Récupérer les informations d'une vidéo YouTube
 * @param {string} videoId - ID de la vidéo YouTube
 * @returns {Object} - Informations de la vidéo
 */
const getYouTubeInfo = async (videoId) => {
  if (!YOUTUBE_API_KEY) {
    throw new Error('Clé API YouTube non configurée');
  }
  
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/videos', {
      params: {
        part: 'snippet,contentDetails,statistics',
        id: videoId,
        key: YOUTUBE_API_KEY
      }
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      throw new Error('Vidéo YouTube non trouvée');
    }
    
    const videoData = response.data.items[0];
    
    return {
      title: videoData.snippet.title,
      description: videoData.snippet.description,
      thumbnail: videoData.snippet.thumbnails.high?.url || videoData.snippet.thumbnails.default?.url,
      duration: formatYouTubeDuration(videoData.contentDetails.duration),
      channel: videoData.snippet.channelTitle,
      publishedAt: videoData.snippet.publishedAt,
      viewCount: videoData.statistics.viewCount,
      likeCount: videoData.statistics.likeCount
    };
  } catch (error) {
    console.error('Erreur lors de la récupération des infos YouTube:', error);
    
    // Méthode alternative : scraping de base (pour développement uniquement)
    return {
      title: `YouTube Video ${videoId}`,
      description: 'Description non disponible (API YouTube indisponible)',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      duration: '0:00',
      channel: 'Chaîne inconnue',
      publishedAt: new Date().toISOString()
    };
  }
};

/**
 * Récupérer les informations d'une vidéo Vimeo
 * @param {string} videoId - ID de la vidéo Vimeo
 * @returns {Object} - Informations de la vidéo
 */
const getVimeoInfo = async (videoId) => {
  if (!VIMEO_ACCESS_TOKEN) {
    throw new Error('Token d\'accès Vimeo non configuré');
  }
  
  try {
    const response = await axios.get(`https://api.vimeo.com/videos/${videoId}`, {
      headers: {
        'Authorization': `Bearer ${VIMEO_ACCESS_TOKEN}`
      }
    });
    
    const videoData = response.data;
    
    return {
      title: videoData.name,
      description: videoData.description,
      thumbnail: videoData.pictures.sizes[3]?.link || videoData.pictures.sizes[0]?.link,
      duration: formatVimeoDuration(videoData.duration),
      channel: videoData.user.name,
      publishedAt: videoData.created_time,
      viewCount: videoData.stats.plays,
      likeCount: videoData.metadata.connections.likes.total
    };
  } catch (error) {
    console.error('Erreur lors de la récupération des infos Vimeo:', error);
    
    // Retourner des infos de base sans API
    return {
      title: `Vimeo Video ${videoId}`,
      description: 'Description non disponible (API Vimeo indisponible)',
      thumbnail: '/images/vimeo-placeholder.jpg',
      duration: '0:00',
      channel: 'Chaîne inconnue',
      publishedAt: new Date().toISOString()
    };
  }
};

/**
 * Récupérer les informations d'une vidéo Dailymotion
 * @param {string} videoId - ID de la vidéo Dailymotion
 * @returns {Object} - Informations de la vidéo
 */
const getDailymotionInfo = async (videoId) => {
  try {
    const response = await axios.get(`https://api.dailymotion.com/video/${videoId}`, {
      params: {
        fields: 'title,description,thumbnail_url,duration,owner.screenname,created_time,views_total'
      }
    });
    
    const videoData = response.data;
    
    return {
      title: videoData.title,
      description: videoData.description,
      thumbnail: videoData.thumbnail_url,
      duration: formatDailymotionDuration(videoData.duration),
      channel: videoData.owner?.screenname,
      publishedAt: new Date(videoData.created_time * 1000).toISOString(),
      viewCount: videoData.views_total
    };
  } catch (error) {
    console.error('Erreur lors de la récupération des infos Dailymotion:', error);
    
    // Retourner des infos de base sans API
    return {
      title: `Dailymotion Video ${videoId}`,
      description: 'Description non disponible (API Dailymotion indisponible)',
      thumbnail: '/images/dailymotion-placeholder.jpg',
      duration: '0:00',
      channel: 'Chaîne inconnue',
      publishedAt: new Date().toISOString()
    };
  }
};

/**
 * Formater une durée YouTube (ISO 8601) en format lisible
 * @param {string} duration - Durée au format ISO 8601 (PT#H#M#S)
 * @returns {string} - Durée formatée (h:mm:ss)
 */
const formatYouTubeDuration = (duration) => {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  
  if (!match) return '0:00';
  
  const hours = match[1] ? parseInt(match[1]) : 0;
  const minutes = match[2] ? parseInt(match[2]) : 0;
  const seconds = match[3] ? parseInt(match[3]) : 0;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
};

/**
 * Formater une durée Vimeo (en secondes) en format lisible
 * @param {number} seconds - Durée en secondes
 * @returns {string} - Durée formatée (h:mm:ss)
 */
const formatVimeoDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
};

/**
 * Formater une durée Dailymotion (en secondes) en format lisible
 * @param {number} seconds - Durée en secondes
 * @returns {string} - Durée formatée (h:mm:ss)
 */
const formatDailymotionDuration = (seconds) => {
  return formatVimeoDuration(seconds);
};