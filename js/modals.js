// Modal mixin extracted from app.js — feedback modal, mood+time modal,
// steam library import modal, explicit feedback handler, and the
// _isInLibrary check used by game card badges.
// Applied to App prototype via Object.assign(App.prototype, ModalsMixin).

export const ModalsMixin = {
  // ===== EXPLICIT FEEDBACK MODAL (triggered from deep-dive "Why not?" button) =====
  _showFeedbackModal(card) {
    const de = this.lang === 'de';
    const overlay = document.createElement('div');
    overlay.className = 'feedback-overlay';
    overlay.innerHTML = `
      <div class="feedback-modal">
        <h3>💬 ${de ? 'Warum interessiert dich das nicht?' : 'Why are you not interested?'}</h3>
        <p>${escapeHTML(card.title)}</p>
        <div class="feedback-options">
          <button class="feedback-btn" data-reason="seen">👁️ ${this.tr.seenIt}</button>
          <button class="feedback-btn" data-reason="mood">🎭 ${this.tr.wrongMood}</button>
          <button class="feedback-btn" data-reason="genre">📚 ${this.tr.notMyGenre}</button>
          <button class="feedback-btn" data-reason="other">💡 ${this.tr.otherReason}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.querySelectorAll('.feedback-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const reason = btn.dataset.reason;
        this._applyExplicitFeedback(card, reason);
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      });
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
  },

  _applyExplicitFeedback(card, reason) {
    // Feed explicit reasons into the recommender profile for better future predictions
    if (reason === 'seen' || reason === 'mood' || reason === 'genre') {
      const signals = {
        seen: { genrePenalty: 0.2 },
        mood: { genrePenalty: 0.1 },
        genre: { genrePenalty: 0.6 }
      };
      // Directly weaken genre weights in the recommender's profile
      (card.genres || []).forEach(g => {
        const genre = (typeof g === 'string' ? g : (this._genreMap[g] || g));
        if (genre && this.recommender.profile) {
          const cur = this.recommender.profile.genreWeights[genre] || 0;
          this.recommender.profile.genreWeights[genre] = cur - signals[reason].genrePenalty;
        }
      });
      this.recommender._saveProfile();
      this.recommender.cache.clear();
    }
    // Nope the card after feedback
    this.handleSwipe('left');
  },

  // ===== MOOD + TIME SELECTOR MODAL =====
  _showMoodTimeModal(app) {
    const de = this.lang === 'de';
    const overlay = document.createElement('div');
    overlay.className = 'mood-time-overlay';
    
    const moods = [
      { id: 'cozy', icon: '☕', label: this.tr.cozy },
      { id: 'intense', icon: '🔥', label: this.tr.intense },
      { id: 'chill', icon: '🌊', label: this.tr.chill },
      { id: 'competitive', icon: '🏆', label: this.tr.competitive }
    ];
    
    const playtimes = [
      { id: 'quick', icon: '⚡', label: this.tr.quickPlay, max: 30 },
      { id: 'medium', icon: '⏱️', label: this.tr.mediumPlay, max: 120 },
      { id: 'long', icon: '📚', label: this.tr.longPlay, max: 999 },
      { id: 'any', icon: '♾️', label: this.tr.anyPlay, max: 9999 }
    ];
    
    const currentMood = this.state.moodTimeFilter.mood;
    const currentPlaytime = this.state.moodTimeFilter.playtime;
    
    overlay.innerHTML = `
      <div class="mood-time-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <h3>🎯 ${this.tr.moodTimeTitle}</h3>
        <p class="mood-time-subtitle">${this.tr.moodTimeSub}</p>
        
        <div class="mood-time-section">
          <h4>${de ? 'Stimmung' : 'Mood'}</h4>
          <div class="mood-options">
            ${moods.map(m => `
              <button class="mood-option ${currentMood === m.id ? 'active' : ''}" data-mood="${m.id}">
                <span class="mood-icon">${m.icon}</span>
                <span class="mood-label">${m.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="mood-time-section">
          <h4>${de ? 'Verfuegbare Zeit' : 'Available Time'}</h4>
          <div class="playtime-options">
            ${playtimes.map(p => `
              <button class="playtime-option ${currentPlaytime === p.id ? 'active' : ''}" data-playtime="${p.id}">
                <span class="playtime-icon">${p.icon}</span>
                <span class="playtime-label">${p.label}</span>
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="mood-time-actions">
          <button class="btn btn-secondary mood-time-clear">${this.tr.clearFilter}</button>
          <button class="btn btn-primary mood-time-apply">${this.tr.applyFilter}</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    
    // Mood selection
    overlay.querySelectorAll('.mood-option').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.mood-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Playtime selection
    overlay.querySelectorAll('.playtime-option').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.playtime-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    // Clear button
    overlay.querySelector('.mood-time-clear').addEventListener('click', () => {
      this.state.moodTimeFilter = { active: false, mood: null, playtime: null };
      this.save();
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
      this.renderCards(app);
    });
    
    // Apply button
    overlay.querySelector('.mood-time-apply').addEventListener('click', () => {
      const selectedMood = overlay.querySelector('.mood-option.active')?.dataset.mood;
      const selectedPlaytime = overlay.querySelector('.playtime-option.active')?.dataset.playtime;
      
      this.state.moodTimeFilter = {
        active: !!(selectedMood || selectedPlaytime),
        mood: selectedMood || null,
        playtime: selectedPlaytime || null
      };
      this.save();
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
      this.renderCards(app);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
    
    // Close button
    overlay.querySelector('.modal-close').addEventListener('click', () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    });
  },

  // ===== STEAM LIBRARY IMPORT MODAL =====
  _showSteamLibraryModal(app) {
    const de = this.lang === 'de';
    const overlay = document.createElement('div');
    overlay.className = 'steam-library-overlay';
    
    const { steamId, apiKey, imported, gameCount, lastFetch } = this.state.steamLibrary;
    const hasImported = imported && gameCount > 0;
    const lastFetchDate = lastFetch ? new Date(lastFetch * 1000).toLocaleDateString() : '';
    
    overlay.innerHTML = `
      <div class="steam-library-modal">
        <button class="modal-close" aria-label="Close">✕</button>
        <h3>🎮 ${this.tr.steamLibrary}</h3>
        <p class="steam-library-subtitle">${de ? 'Importiere deine Steam Spiele fuer bessere Empfehlungen' : 'Import your Steam games for better recommendations'}</p>
        
        ${hasImported ? `
          <div class="steam-library-status">
            <div class="steam-library-count">${this.t('steamLibraryCount', gameCount.toString())}</div>
            <div class="steam-library-lastfetch">${de ? 'Letzter Import:' : 'Last import:'} ${lastFetchDate}</div>
          </div>
        ` : ''}
        
        <div class="steam-library-form">
          <div class="steam-library-field">
            <label for="steam-id">${this.tr.steamId}</label>
            <input type="text" id="steam-id" value="${escapeHTML(steamId)}" placeholder="${de ? 'Deine Steam ID (z.B. 76561198012345678)' : 'Your Steam ID (e.g. 76561198012345678)'}">
            <a href="https://steamid.io/" target="_blank" rel="noopener" class="steam-library-help">${de ? 'Steam ID finden' : 'Find your Steam ID'}</a>
          </div>
          
          <div class="steam-library-field">
            <label for="steam-api-key">${this.tr.steamApiKey}</label>
            <input type="password" id="steam-api-key" value="${escapeHTML(apiKey)}" placeholder="${de ? 'Steam Web API Key (optional)' : 'Steam Web API Key (optional)'}">
            <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noopener" class="steam-library-help">${de ? 'API Key bekommen' : 'Get API Key'}</a>
          </div>
        </div>
        
        <div class="steam-library-actions">
          ${hasImported ? `
            <button class="btn btn-secondary steam-library-clear">${this.tr.clearFilter}</button>
          ` : ''}
          <button class="btn btn-primary steam-library-import" ${!steamId ? 'disabled' : ''}>
            ${this.tr.steamImport}
          </button>
        </div>
        
        <div class="steam-library-info">
          <p>${de ? 'Hinweis: Dein Profil muss oeffentlich sein, oder du brauchst einen API Key.' : 'Note: Your profile must be public, or you need an API key.'}</p>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    
    // Enable/disable import button based on Steam ID input
    const steamIdInput = overlay.querySelector('#steam-id');
    const importBtn = overlay.querySelector('.steam-library-import');
    steamIdInput.addEventListener('input', () => {
      importBtn.disabled = !steamIdInput.value.trim();
    });
    
    // Import button
    importBtn.addEventListener('click', async () => {
      const id = steamIdInput.value.trim();
      const key = overlay.querySelector('#steam-api-key').value.trim();
      
      if (!id) return;
      
      importBtn.disabled = true;
      importBtn.textContent = this.tr.steamImporting;
      
      try {
        await this._fetchSteamLibrary(id, key, overlay);
      } catch (error) {
        console.error('Steam Library import error:', error);
        showToast(this.tr.steamImportError, { type: 'error', duration: 3000 });
      } finally {
        importBtn.disabled = false;
        importBtn.textContent = this.tr.steamImport;
      }
    });
    
    // Clear button
    overlay.querySelector('.steam-library-clear')?.addEventListener('click', () => {
      this.state.steamLibrary = { steamId: '', apiKey: '', imported: false, gameCount: 0, lastFetch: 0 };
      this.save();
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
      this.renderCards(app);
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 300);
      }
    });
    
    // Close button
    overlay.querySelector('.modal-close').addEventListener('click', () => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 300);
    });
  },

  async _fetchSteamLibrary(steamId, apiKey, overlay) {
    const params = new URLSearchParams({ steamid: steamId });
    if (apiKey) params.set('api_key', apiKey);
    
    const response = await fetch(`/proxy/steam/library?${params.toString()}`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch Steam library');
    }
    
    const data = await response.json();
    const { gameCount, games } = data;
    
    // Store library in state
    this.state.steamLibrary = {
      steamId,
      apiKey,
      imported: true,
      gameCount,
      lastFetch: Math.floor(Date.now() / 1000),
      games: games || []
    };
    this.save();
    
    // Store in IndexedDB for persistence
    await safeSetJSON('bs-steam-library', this.state.steamLibrary);
    
    showToast(this.t('steamLibraryCount', gameCount.toString()), { type: 'success', duration: 3000 });
    
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), 300);
    this.renderCards(document.getElementById('app'));
  },

  _isInLibrary(card) {
    if (!this.state.steamLibrary.imported || !this.state.steamLibrary.games) {
      return false;
    }
    
    // Check by Steam App ID if available
    if (card.steamAppId) {
      return this.state.steamLibrary.games.some(g => g.appId === card.steamAppId);
    }
    
    // Fallback: check by title (case-insensitive)
    const cardTitle = (card.title || '').toLowerCase();
    return this.state.steamLibrary.games.some(g => 
      (g.name || '').toLowerCase() === cardTitle
    );
  },

  // ===== MOOD + TIME FILTER LOGIC =====
};
