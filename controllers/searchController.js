// controllers/searchController.js
const mongoose = require('mongoose');

// Déclare tes modèles (assume qu'ils sont déjà enregistrés quelque part)
const Video = mongoose.model('Video');
const Playlist = mongoose.model('Playlist');
const Podcast = mongoose.model('Podcast');
const LiveStream = mongoose.model('LiveStream');

/* ------------------------------ Utils ------------------------------ */

function parsePositiveInt(v, dft, min = 1, max = 100) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dft;
  return Math.max(min, Math.min(max, n));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* --------------------------- Global Search -------------------------- */
/**
 * @desc    Recherche globale
 * @route   GET /api/search
 * @access  Public
 * @query   query, page=1, limit=10, type=all|videos|playlists|podcasts|livestreams
 */
exports.globalSearch = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const type = (req.query.type || 'all').toLowerCase();
    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 10, 1, 50);

    if (!rawQuery) {
      return res.json({ success: true, data: { videos: [], playlists: [], podcasts: [], livestreams: [] } });
    }

    const skip = (page - 1) * limit;

    const rx = { $regex: escapeRegExp(rawQuery), $options: 'i' };

    const tasks = [];

    const wantAll = type === 'all';

    if (wantAll || type === 'videos') {
      tasks.push(
        Video.find({ $or: [{ titre: rx }, { description: rx }, { tags: rx }, { artiste: rx }] })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .then((items) => ({ key: 'videos', items }))
      );
    }

    if (wantAll || type === 'playlists') {
      tasks.push(
        Playlist.find({ public: true, $or: [{ nom: rx }, { description: rx }] })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .then((items) => ({ key: 'playlists', items }))
      );
    }

    if (wantAll || type === 'podcasts') {
      tasks.push(
        Podcast.find({ $or: [{ titre: rx }, { description: rx }, { host: rx }] })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .then((items) => ({ key: 'podcasts', items }))
      );
    }

    if (wantAll || type === 'livestreams') {
      tasks.push(
        LiveStream.find({ $or: [{ titre: rx }, { description: rx }, { category: rx }] })
          .sort({ startTime: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .then((items) => ({ key: 'livestreams', items }))
      );
    }

    const parts = await Promise.all(tasks);
    const data = { videos: [], playlists: [], podcasts: [], livestreams: [] };
    for (const p of parts) data[p.key] = p.items;

    return res.json({ success: true, data });
  } catch (error) {
    console.error('Erreur globalSearch:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la recherche',
    });
  }
};

/* --------------------------- Per-type Search --------------------------- */
/**
 * @route GET /api/search/videos
 * @query query, page=1, limit=12, genre, decennie, sort=relevance|newest|views
 */
exports.searchVideos = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 12, 1, 50);
    const skip = (page - 1) * limit;

    const { genre = null, decennie = null, sort = 'relevance' } = req.query;

    const filter = {};
    if (rawQuery) {
      const rx = { $regex: escapeRegExp(rawQuery), $options: 'i' };
      filter.$or = [{ titre: rx }, { description: rx }, { artiste: rx }, { tags: rx }];
    }
    if (genre) filter.genre = genre;
    if (decennie) filter.decennie = decennie;

    const sortMap = {
      relevance: { createdAt: -1 },
      newest: { createdAt: -1 },
      views: { vues: -1 },
    };

    const items = await Video.find(filter).sort(sortMap[sort] || sortMap.relevance).skip(skip).limit(limit).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Erreur searchVideos:', error);
    return res.status(500).json({ success: false, message: 'Erreur recherche vidéos' });
  }
};

/**
 * @route GET /api/search/playlists
 * @query query, page=1, limit=12, sort=popularity|newest
 */
exports.searchPlaylists = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 12, 1, 50);
    const skip = (page - 1) * limit;

    const { sort = 'popularity' } = req.query;

    const filter = { public: true };
    if (rawQuery) {
      const rx = { $regex: escapeRegExp(rawQuery), $options: 'i' };
      filter.$or = [{ nom: rx }, { description: rx }];
    }

    const sortMap = {
      popularity: { followersCount: -1, createdAt: -1 },
      newest: { createdAt: -1 },
    };

    const items = await Playlist.find(filter).sort(sortMap[sort] || sortMap.popularity).skip(skip).limit(limit).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Erreur searchPlaylists:', error);
    return res.status(500).json({ success: false, message: 'Erreur recherche playlists' });
  }
};

/**
 * @route GET /api/search/podcasts
 * @query query, page=1, limit=12, category, sort=newest|popular
 */
exports.searchPodcasts = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 12, 1, 50);
    const skip = (page - 1) * limit;

    const { category = null, sort = 'newest' } = req.query;

    const filter = {};
    if (rawQuery) {
      const rx = { $regex: escapeRegExp(rawQuery), $options: 'i' };
      filter.$or = [{ titre: rx }, { description: rx }, { host: rx }];
    }
    if (category) filter.category = category;

    const sortMap = {
      newest: { createdAt: -1 },
      popular: { listens: -1, createdAt: -1 },
    };

    const items = await Podcast.find(filter).sort(sortMap[sort] || sortMap.newest).skip(skip).limit(limit).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Erreur searchPodcasts:', error);
    return res.status(500).json({ success: false, message: 'Erreur recherche podcasts' });
  }
};

/**
 * @route GET /api/search/livestreams
 * @query query, page=1, limit=12, status=all|upcoming|live|ended, category
 */
exports.searchLivestreams = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const page = parsePositiveInt(req.query.page, 1, 1, 100000);
    const limit = parsePositiveInt(req.query.limit, 12, 1, 50);
    const skip = (page - 1) * limit;

    const { status = 'all', category = null } = req.query;

    const filter = {};
    if (rawQuery) {
      const rx = { $regex: escapeRegExp(rawQuery), $options: 'i' };
      filter.$or = [{ titre: rx }, { description: rx }, { category: rx }];
    }
    if (category) filter.category = category;

    const now = new Date();
    if (status === 'upcoming') filter.startTime = { $gt: now };
    if (status === 'ended') filter.endTime = { $lt: now };
    if (status === 'live') filter.$and = [{ startTime: { $lte: now } }, { endTime: { $gte: now } }];

    const items = await LiveStream.find(filter).sort({ startTime: -1 }).skip(skip).limit(limit).lean();
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('Erreur searchLivestreams:', error);
    return res.status(500).json({ success: false, message: 'Erreur recherche livestreams' });
  }
};

/* ------------------------ Suggestions (Autocomplete) ------------------------ */
/**
 * @desc    Suggestions de recherche
 * @route   GET /api/search/suggestions
 * @access  Public
 * @query   query (min 2), limit=8
 * @return  { success, data: Array<{type,text,query}> }
 */
exports.getSearchSuggestions = async (req, res) => {
  try {
    const rawQuery = (req.query.query || '').trim();
    const limitNum = parsePositiveInt(req.query.limit, 8, 1, 20);

    if (rawQuery.length < 2) {
      return res.json({ success: true, data: [] });
    }

    // Regex de préfixe (accélère les indexes, évite les backtracking fous)
    const rx = { $regex: '^' + escapeRegExp(rawQuery), $options: 'i' };

    const [videoHits, playlistHits, artistHits] = await Promise.all([
      // Vidéos: titre
      Video.find({ titre: rx }).select({ _id: 0, titre: 1 }).limit(limitNum).lean(),

      // Playlists publiques: nom
      Playlist.find({ public: true, nom: rx }).select({ _id: 0, nom: 1 }).limit(limitNum).lean(),

      // Artistes distincts depuis Video (adapte si tu as une collection Artists)
      Video.aggregate([
        { $match: { artiste: rx } },
        { $group: { _id: '$artiste' } },
        { $limit: limitNum },
      ]),
    ]);

    let suggestions = [
      ...videoHits.map((v) => ({ type: 'video', text: v.titre, query: v.titre })),
      ...playlistHits.map((p) => ({ type: 'playlist', text: p.nom, query: p.nom })),
      ...artistHits.map((a) => ({ type: 'artist', text: a._id, query: a._id })),
    ];

    // dédoublonner (type+text)
    suggestions = suggestions.filter(
      (s, i, arr) => arr.findIndex((t) => t.type === s.type && t.text === s.text) === i
    );

    // couper au total
    suggestions = suggestions.slice(0, limitNum);

    return res.json({ success: true, data: suggestions });
  } catch (error) {
    console.error('Erreur lors de la récupération des suggestions:', error);
    return res.status(500).json({
      success: false,
      message: 'Une erreur est survenue lors de la récupération des suggestions',
    });
  }
};
