const PROXY_BASE = '/proxy/steam';

class SteamAPI {
  constructor() {
    this._cache = new Map();
    this._cacheTTL = 30 * 60 * 1000;
  }

  _get(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${PROXY_BASE}/${path}${qs ? '?' + qs : ''}`;
    const cached = this._cache.get(url);
    if (cached && Date.now() - cached.t < this._cacheTTL) {
      return Promise.resolve(cached.d);
    }
    return fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!data.error) {
          this._cache.set(url, { d: data, t: Date.now() });
        }
        return data;
      })
      .catch(e => {
        console.warn('Steam API error:', e);
        return null;
      });
  }

  getAppDetails(appIds, cc = 'us') {
    const ids = Array.isArray(appIds) ? appIds.join(',') : String(appIds);
    return this._get('appdetails', { appids: ids, cc }).then(data => {
      if (!data) return {};
      const result = {};
      for (const [id, info] of Object.entries(data)) {
        if (info) {
          result[id] = this._mapAppDetails(id, info);
        }
      }
      return result;
    });
  }

  _mapAppDetails(appId, raw) {
    const genres = (raw.genres || []).map(g => g.description);
    const categories = (raw.categories || []).map(c => c.description);
    const isMultiplayer = categories.some(c =>
      /multi|co-?op|pvp|mmorpg/i.test(c)
    );
    const platforms = [];
    if (raw.platforms) {
      if (raw.platforms.windows) platforms.push('PC');
      if (raw.platforms.mac) platforms.push('Mac');
      if (raw.platforms.linux) platforms.push('Linux');
    }
    const screenshots = (raw.screenshots || []).slice(0, 5).map(s => s.path_full);
    const movies = (raw.movies || []).slice(0, 2).map(m => ({
      id: m.id,
      name: m.name,
      webm: m.webm && m.webm.max ? m.webm.max : (m.webm && m.webm['480'] ? m.webm['480'] : null),
      mp4: m.mp4 && m.mp4.max ? m.mp4.max : (m.mp4 && m.mp4['480'] ? m.mp4['480'] : null),
      thumbnail: m.thumbnail
    }));

    const price = raw.price_overview || {};
    const isFree = raw.is_free || price.final === 0;
    const discount = price.discount_percent || 0;
    const priceFinal = price.final_formatted || (isFree ? 'Free' : '');
    const priceCents = price.final || 0;

    return {
      appId: Number(appId),
      name: raw.name,
      shortDescription: raw.short_description || '',
      detailedDescription: raw.detailed_description || '',
      headerImage: raw.header_image || '',
      capsuleImage: raw.capsule_image || '',
      background: raw.background || '',
      website: raw.website || '',
      releaseDate: raw.release_date ? raw.release_date.date || '' : '',
      comingSoon: raw.release_date ? raw.release_date.coming_soon || false : false,
      developers: raw.developers || [],
      publishers: raw.publishers || [],
      genres,
      categories,
      platforms,
      screenshots,
      movies,
      metacritic: raw.metacritic ? raw.metacritic.score || null : null,
      metacriticUrl: raw.metacritic ? raw.metacritic.url || '' : '',
      isFree,
      price: priceFinal,
      priceCents,
      discount,
      reviewScore: null,
      reviewCount: 0,
      reviewPositive: 0,
      reviewNegative: 0,
      achievements: raw.achievements ? raw.achievements.total || 0 : 0,
      supportUrl: raw.support_url || '',
      controllerSupport: raw.controller_support || 'none',
      steamTags: [],
      estimatedPlaytime: null
    };
  }

  getFeatured(cc = 'us') {
    return this._get('featured', { cc }).then(data => {
      if (!data) return { featured: [], topSellers: [], newReleases: [], specials: [] };
      return {
        featured: (data.featured_win || []).slice(0, 20).map(this._mapFeaturedItem),
        topSellers: (data.top_sellers || []).slice(0, 20).map(this._mapFeaturedItem),
        newReleases: (data.new_releases || []).slice(0, 20).map(this._mapFeaturedItem),
        specials: (data.specials || []).slice(0, 20).map(this._mapFeaturedItem),
        comingSoon: (data.coming_soon || []).slice(0, 20).map(this._mapFeaturedItem),
        under10: (data.under10 || []).slice(0, 20).map(this._mapFeaturedItem)
      };
    });
  }

  _mapFeaturedItem(item) {
    return {
      id: item.id,
      name: item.name || '',
      discount: item.discount_percent || 0,
      originalPrice: item.original_price || 0,
      finalPrice: item.final_price || 0,
      isFree: item.is_free || false,
      headerImage: item.header_image || '',
      price: item.final_price === 0 ? 'Free' : (item.final_price / 100).toFixed(2),
      url: `https://store.steampowered.com/app/${item.id}`
    };
  }

  getReviews(appId) {
    return this._get('reviews', { appid: appId }).then(data => {
      if (!data || !data.query_summary) return null;
      const s = data.query_summary;
      const total = s.total_reviews || 0;
      const positive = s.total_positive || 0;
      const negative = s.total_negative || 0;
      const score = total > 0 ? Math.round((positive / total) * 100) : 0;
      return {
        appId,
        total,
        positive,
        negative,
        score,
        reviewScore: this._getReviewSentiment(score, total),
        reviewDesc: this._getReviewDescription(score, total),
        reviewDescDe: this._getReviewDescriptionDe(score, total)
      };
    });
  }

  _getReviewSentiment(score, total) {
    if (total >= 500 && score >= 95) return 'overwhelmingly_positive';
    if (total >= 50 && score >= 80) return 'very_positive';
    if (score >= 70) return 'mostly_positive';
    if (score >= 40) return 'mixed';
    if (score >= 20) return 'mostly_negative';
    return 'very_negative';
  }

  _getReviewDescription(score, total) {
    if (total < 50) return 'User Reviews';
    if (score >= 95 && total >= 500) return 'Overwhelmingly Positive';
    if (score >= 80) return 'Very Positive';
    if (score >= 70) return 'Mostly Positive';
    if (score >= 40) return 'Mixed';
    if (score >= 20) return 'Mostly Negative';
    return 'Very Negative';
  }

  _getReviewDescriptionDe(score, total) {
    if (total < 50) return 'Nutzerbewertungen';
    if (score >= 95 && total >= 500) return 'Überwältigend positiv';
    if (score >= 80) return 'Sehr positiv';
    if (score >= 70) return 'Überwiegend positiv';
    if (score >= 40) return 'Gemischt';
    if (score >= 20) return 'Überwiegend negativ';
    return 'Sehr negativ';
  }

  searchTopSellers(options = {}) {
    const { tags, cc = 'us', limit = 20 } = options;
    const params = {
      cc,
      sort_by: 'Reviews_DESC',
      category1: '998',
      force_infinite: '1'
    };
    if (tags) params.tags = tags;
    return this._get('search', params).then(data => {
      if (!data || !data.results_html) return [];
      return this._parseSearchResults(data.results_html).slice(0, limit);
    });
  }

  searchByTags(tagIds, options = {}) {
    const { cc = 'us', sort = 'Reviews_DESC', limit = 20 } = options;
    const tags = Array.isArray(tagIds) ? tagIds.join(',') : String(tagIds);
    return this._get('search', {
      cc,
      tags,
      sort_by: sort,
      category1: '998',
      force_infinite: '1'
    }).then(data => {
      if (!data || !data.results_html) return [];
      return this._parseSearchResults(data.results_html).slice(0, limit);
    });
  }

  _parseSearchResults(html) {
    const results = [];
    const regex = /data-ds-appid="(\d+)"/g;
    const nameRegex = /class="title">([^<]+)<\/span>/g;
    const priceRegex = /class="discount_final_price[^"]*">([^<]+)<\/div>/g;
    const originalPriceRegex = /class="discount_original_price[^"]*">([^<]+)<\/div>/g;
    const discountRegex = /data折扣="(\d+)"/;
    const headerRegex = /src="(https:\/\/cdn\.akamai\.steamstatic\.com\/store\/[^"]+)"/;
    let match;
    const appIds = [];
    while ((match = regex.exec(html)) !== null) {
      appIds.push(match[1]);
    }
    const names = [];
    while ((match = nameRegex.exec(html)) !== null) {
      names.push(match[1].trim());
    }
    for (let i = 0; i < appIds.length; i++) {
      results.push({
        appId: Number(appIds[i]),
        name: names[i] || '',
        headerImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appIds[i]}/header.jpg`,
        url: `https://store.steampowered.com/app/${appIds[i]}`
      });
    }
    return results;
  }

  enrichGameData(steamData, reviewData) {
    if (!steamData) return null;
    const enriched = { ...steamData };
    if (reviewData) {
      enriched.reviewScore = reviewData.score;
      enriched.reviewCount = reviewData.total;
      enriched.reviewPositive = reviewData.positive;
      enriched.reviewNegative = reviewData.negative;
      enriched.reviewDesc = reviewData.reviewDesc;
      enriched.reviewDescDe = reviewData.reviewDescDe;
      enriched.reviewSentiment = reviewData.reviewScore;
    }
    return enriched;
  }

  getStoreLink(appId) {
    return `https://store.steampowered.com/app/${appId}`;
  }

  getSteamDeepLink(appId) {
    return `steam://store/${appId}`;
  }

  formatPlaytime(hours) {
    if (hours === 0) return 'N/A';
    if (hours < 1) return '< 1h';
    if (hours < 20) return `${hours}h`;
    if (hours < 100) return `${hours}h`;
    return `${Math.round(hours / 10) * 10}h+`;
  }

  getPriceDisplay(steamData) {
    if (!steamData) return null;
    if (steamData.isFree) return { text: 'Free', isFree: true, discount: 0 };
    if (!steamData.price) return null;
    return {
      text: steamData.price,
      original: steamData.discount > 0 ? steamData.price : null,
      discount: steamData.discount,
      isFree: false,
      cents: steamData.priceCents
    };
  }
}

export const steamAPI = new SteamAPI();
export default steamAPI;
