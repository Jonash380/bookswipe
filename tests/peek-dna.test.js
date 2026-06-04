import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Minimal DOM setup for HTML parsing in assertions
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;

const { Recommender } = await import('../js/recommender.js');

// ===== Helper: reset recommender profile =====
function resetProfile(rec) {
  rec.profile = {
    genreWeights: {}, tagWeights: {}, eraPreference: null,
    tropes: {}, pacingStyles: {}, aesthetics: {}, warnings: {},
    totalSwipes: 0, likeRatio: 0,
    gamePlatformWeights: {}, gameMechanicWeights: {}, gameThemeWeights: {},
  };
  rec.cache.clear();
}

// ===== Helper: minimal app mock =====
function makeMockApp(stateOverrides = {}) {
  return {
    lang: 'en',
    state: {
      selectedGenres: [],
      selectedMoods: [],
      eraFilter: 'all',
      boostedMoods: [],
      blockedGenres: [],
      selectedPlatforms: [],
      ...stateOverrides,
    },
    _genreMap: {
      28: 'Action', 12: 'Adventure', 35: 'Comedy', 18: 'Drama',
      27: 'Horror', 10749: 'Romance', 878: 'Science Fiction',
      53: 'Thriller', 16: 'Animation', 14: 'Fantasy',
    },
  };
}

// ===== Helper: minimal card item =====
function makeItem(id, opts = {}) {
  return {
    id,
    title: opts.title || `Item ${id}`,
    type: opts.type || 'movie',
    source: opts.source || 'tmdb',
    genres: opts.genres || [],
    tags: opts.tags || [],
    mediaDNA: opts.mediaDNA || null,
    year: opts.year ?? null,
    ...opts,
  };
}

// ================================================================
// _renderPeekMatchDNA — extracted rendering logic
// ================================================================

function escapeHTML(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/**
 * Replicates the logic of App._renderPeekMatchDNA(card) as a pure function.
 * Takes a DNA result object and locale, returns HTML string.
 */
function renderPeekMatchDNA(dna, lang = 'en') {
  if (!dna || !dna.dna_breakdown || !dna.dna_breakdown.length) return '';

  const pct = dna.overall_match_percentage;
  let color = '#ef4444';
  let label = lang === 'de' ? 'Schlecht' : 'Poor';
  if (pct >= 80) { color = '#22c55e'; label = lang === 'de' ? 'Perfekt' : 'Perfect'; }
  else if (pct >= 60) { color = '#4ecdc4'; label = lang === 'de' ? 'Gut' : 'Good'; }
  else if (pct >= 40) { color = '#f59e0b'; label = lang === 'de' ? 'Okay' : 'Okay'; }

  const top = dna.dna_breakdown.slice(0, 2);

  const headerLabel = lang === 'de' ? 'Trefferquote' : 'Match';

  return `
        <div class="peek-dna-section">
          <div class="peek-dna-header">
            <span class="peek-dna-label">🧬 ${headerLabel}</span>
            <span class="peek-dna-pct" style="color:${color}">${pct}% ${escapeHTML(label)}</span>
          </div>
          ${dna.hook ? `<p class="peek-dna-hook">${escapeHTML(dna.hook)}</p>` : ''}
          <div class="peek-dna-bars">
            ${top.map(b => {
              const barColor = b.score >= 80 ? '#22c55e' : b.score >= 60 ? '#4ecdc4' : b.score >= 40 ? '#f59e0b' : '#ef4444';
              return `
                <div class="peek-dna-bar">
                  <div class="peek-dna-bar-label">
                    <span>${escapeHTML(b.category)}</span>
                    <span class="peek-dna-bar-score">${b.score}%</span>
                  </div>
                  <div class="peek-dna-bar-track">
                    <div class="peek-dna-bar-fill" style="width:${b.score}%;background:${barColor}"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>`;
}

// ================================================================
// TESTS
// ================================================================

describe('_renderPeekMatchDNA', () => {
  // ================================================================
  // OUTPUT STRUCTURE
  // ================================================================

  describe('output structure', () => {
    it('should return HTML string with .peek-dna-section wrapper', () => {
      const dna = { overall_match_percentage: 50, dna_breakdown: [{ category: 'Genre', score: 50, reason: 'test' }], hook: 'A hook' };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('peek-dna-section'));
      assert.ok(html.includes('peek-dna-header'));
      assert.ok(html.includes('peek-dna-bars'));
    });

    it('should return empty string when dna is null', () => {
      assert.equal(renderPeekMatchDNA(null), '');
    });

    it('should return empty string when dna is undefined', () => {
      assert.equal(renderPeekMatchDNA(undefined), '');
    });

    it('should return empty string when dna_breakdown is missing', () => {
      assert.equal(renderPeekMatchDNA({ overall_match_percentage: 50 }), '');
    });

    it('should return empty string when dna_breakdown is empty array', () => {
      assert.equal(renderPeekMatchDNA({ overall_match_percentage: 50, dna_breakdown: [], hook: '' }), '');
    });
  });

  // ================================================================
  // COMPACT OUTPUT — TOP 2
  // ================================================================

  describe('compact output (top 2)', () => {
    it('should show only top 2 breakdown items when there are 4', () => {
      const dna = {
        overall_match_percentage: 70,
        dna_breakdown: [
          { category: 'Genre', score: 90, reason: 'r1' },
          { category: 'Mood', score: 80, reason: 'r2' },
          { category: 'Tropes', score: 60, reason: 'r3' },
          { category: 'Pacing', score: 50, reason: 'r4' },
        ],
        hook: 'Great match!',
      };
      const html = renderPeekMatchDNA(dna);
      // Should contain Genre and Mood bars, but NOT Tropes or Pacing
      assert.ok(html.includes('Genre'));
      assert.ok(html.includes('Mood'));
      assert.ok(!html.includes('Tropes'), 'Should not include 3rd item');
      assert.ok(!html.includes('Pacing'), 'Should not include 4th item');
    });

    it('should show all items when there are fewer than 2', () => {
      const dna = {
        overall_match_percentage: 60,
        dna_breakdown: [
          { category: 'Genre', score: 60, reason: 'r1' },
        ],
        hook: 'Decent',
      };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('Genre'));
      // count bar elements — only one bar should be present
      const bars = html.match(/<div class="peek-dna-bar">/g);
      assert.equal(bars ? bars.length : 0, 1);
    });
  });

  // ================================================================
  // COLOR CODING & LABELS
  // ================================================================

  describe('color coding and labels', () => {
    it('should use green (#22c55e) and "Perfect" for >= 80% (en)', () => {
      const dna = { overall_match_percentage: 90, dna_breakdown: [{ category: 'Genre', score: 90, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('#22c55e') || html.includes('color:#22c55e'));
      assert.ok(html.includes('90% Perfect'));
    });

    it('should use green (#22c55e) and "Perfekt" for >= 80% (de)', () => {
      const dna = { overall_match_percentage: 95, dna_breakdown: [{ category: 'Genre', score: 95, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'de');
      assert.ok(html.includes('95% Perfekt'));
    });

    it('should use teal (#4ecdc4) and "Good" for 60-79% (en)', () => {
      const dna = { overall_match_percentage: 70, dna_breakdown: [{ category: 'Genre', score: 70, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('70% Good'));
    });

    it('should use teal (#4ecdc4) and "Gut" for 60-79% (de)', () => {
      const dna = { overall_match_percentage: 65, dna_breakdown: [{ category: 'Genre', score: 65, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'de');
      assert.ok(html.includes('65% Gut'));
    });

    it('should use amber (#f59e0b) and "Okay" for 40-59%', () => {
      const dna = { overall_match_percentage: 50, dna_breakdown: [{ category: 'Genre', score: 50, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('50% Okay'));
    });

    it('should use red (#ef4444) and "Poor" for < 40% (en)', () => {
      const dna = { overall_match_percentage: 20, dna_breakdown: [{ category: 'Genre', score: 20, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('20% Poor'));
    });

    it('should use red (#ef4444) and "Schlecht" for < 40% (de)', () => {
      const dna = { overall_match_percentage: 15, dna_breakdown: [{ category: 'Genre', score: 15, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'de');
      assert.ok(html.includes('15% Schlecht'));
    });

    it('should use boundary 80 as green "Perfect"', () => {
      const dna = { overall_match_percentage: 80, dna_breakdown: [{ category: 'Genre', score: 80, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('80% Perfect'));
    });

    it('should use boundary 60 as teal "Good"', () => {
      const dna = { overall_match_percentage: 60, dna_breakdown: [{ category: 'Genre', score: 60, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('60% Good'));
    });

    it('should use boundary 40 as amber "Okay"', () => {
      const dna = { overall_match_percentage: 40, dna_breakdown: [{ category: 'Genre', score: 40, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('40% Okay'));
    });
  });

  // ================================================================
  // HOOK DISPLAY
  // ================================================================

  describe('hook display', () => {
    it('should include hook text when present', () => {
      const dna = { overall_match_percentage: 85, dna_breakdown: [{ category: 'Genre', score: 85, reason: 'r' }], hook: 'This is your next favorite!' };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('This is your next favorite!'));
      assert.ok(html.includes('peek-dna-hook'));
    });

    it('should NOT include hook section when hook is empty string', () => {
      const dna = { overall_match_percentage: 50, dna_breakdown: [{ category: 'Genre', score: 50, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna);
      assert.ok(!html.includes('peek-dna-hook'));
    });

    it('should NOT include hook section when hook is null', () => {
      const dna = { overall_match_percentage: 50, dna_breakdown: [{ category: 'Genre', score: 50, reason: 'r' }], hook: null };
      const html = renderPeekMatchDNA(dna);
      assert.ok(!html.includes('peek-dna-hook'));
    });
  });

  // ================================================================
  // BAR RENDERING
  // ================================================================

  describe('bar rendering', () => {
    it('should render each bar with label, score, and track', () => {
      const dna = {
        overall_match_percentage: 70,
        dna_breakdown: [
          { category: 'Genre Alignment', score: 85, reason: 'Strong match' },
          { category: 'Mood & Vibe', score: 55, reason: 'Decent fit' },
        ],
        hook: 'A match!',
      };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('Genre Alignment'));
      assert.ok(html.includes('85%'));
      // & is escaped to &amp; by escapeHTML
      assert.ok(html.includes('Mood &amp; Vibe'), 'Should show HTML-escaped ampersand');
      assert.ok(html.includes('55%'));
      // Count bars — should be exactly 2
      const bars = html.match(/<div class="peek-dna-bar">/g);
      assert.equal(bars ? bars.length : 0, 2);
      assert.ok(html.includes('peek-dna-bar-track'));
    });

    it('should set bar fill width to match score percentage', () => {
      const dna = {
        overall_match_percentage: 60,
        dna_breakdown: [{ category: 'Genre', score: 72, reason: 'r' }],
        hook: '',
      };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('width:72%'));
    });

    it('should color each bar based on its own score (not overall)', () => {
      // Overall is 50 (amber), but the bar is 85 (green)
      const dna = {
        overall_match_percentage: 50,
        dna_breakdown: [{ category: 'Genre', score: 85, reason: 'r' }],
        hook: '',
      };
      const html = renderPeekMatchDNA(dna);
      // Bar should be green (#22c55e) because score >= 80, despite overall being 50
      assert.ok(html.includes('#22c55e'), 'Bar fill should be green for score >= 80');
    });

    it('should render score with % symbol in peek-dna-bar-score span', () => {
      const dna = {
        overall_match_percentage: 65,
        dna_breakdown: [{ category: 'Pacing', score: 60, reason: 'r' }],
        hook: '',
      };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('peek-dna-bar-score'));
      assert.ok(html.includes('60%'));
    });
  });

  // ================================================================
  // EDGE CASES
  // ================================================================

  describe('edge cases', () => {
    it('should handle score of 0 without crashing', () => {
      const dna = { overall_match_percentage: 0, dna_breakdown: [{ category: 'Genre', score: 0, reason: 'No match' }], hook: '' };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('0%'));
    });

    it('should handle score of 100 without crashing', () => {
      const dna = { overall_match_percentage: 100, dna_breakdown: [{ category: 'Genre', score: 100, reason: 'Perfect' }], hook: 'Top pick!' };
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('100% Perfect'));
      assert.ok(html.includes('Top pick!'));
    });

    it('should handle negative scores gracefully', () => {
      const dna = { overall_match_percentage: -5, dna_breakdown: [{ category: 'Genre', score: -10, reason: 'Bad' }], hook: '' };
      const html = renderPeekMatchDNA(dna);
      // Should still render, showing -5% with Poor/Schlecht label
      assert.ok(html.includes('-5%'));
      assert.ok(html.includes('Poor'));
    });

    it('should escape HTML in category names', () => {
      const dna = {
        overall_match_percentage: 50,
        dna_breakdown: [{ category: 'Genre <script>', score: 50, reason: 'XSS' }],
        hook: '',
      };
      const html = renderPeekMatchDNA(dna);
      assert.ok(!html.includes('<script>'), 'Should escape script tags');
      assert.ok(html.includes('&lt;script&gt;'));
    });

    it('should escape HTML in hook text', () => {
      const dna = {
        overall_match_percentage: 80,
        dna_breakdown: [{ category: 'Genre', score: 80, reason: 'Fine' }],
        hook: 'Match <strong>bold</strong>',
      };
      const html = renderPeekMatchDNA(dna);
      assert.ok(!html.includes('<strong>'));
      assert.ok(html.includes('&lt;strong&gt;'));
    });
  });

  // ================================================================
  // LOCALE
  // ================================================================

  describe('German locale', () => {
    it('should show "Trefferquote" as the header label when lang is de', () => {
      const dna = { overall_match_percentage: 70, dna_breakdown: [{ category: 'Genre', score: 70, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'de');
      assert.ok(html.includes('Trefferquote'));
    });

    it('should show "Match" as the header label when lang is en', () => {
      const dna = { overall_match_percentage: 70, dna_breakdown: [{ category: 'Genre', score: 70, reason: 'r' }], hook: '' };
      const html = renderPeekMatchDNA(dna, 'en');
      assert.ok(html.includes('>🧬 Match<'));
    });

    it('should use Perfekt/Gut/Okay/Schlecht for de locale across all tiers', () => {
      const tiers = [
        { pct: 90, expected: 'Perfekt' },
        { pct: 65, expected: 'Gut' },
        { pct: 45, expected: 'Okay' },
        { pct: 10, expected: 'Schlecht' },
      ];
      for (const { pct, expected } of tiers) {
        const dna = { overall_match_percentage: pct, dna_breakdown: [{ category: 'Genre', score: pct, reason: 'r' }], hook: '' };
        const html = renderPeekMatchDNA(dna, 'de');
        assert.ok(html.includes(expected), `Expected "${expected}" for ${pct}% in de locale`);
      }
    });
  });

  // ================================================================
  // INTEGRATION WITH generateMatchDNA
  // ================================================================

  describe('integration with generateMatchDNA', () => {
    let app;
    let rec;

    beforeEach(() => {
      app = makeMockApp();
      rec = new Recommender(app);
      resetProfile(rec);
    });

    it('should render HTML for a basic movie item via recommender', () => {
      const item = makeItem('a', { genres: [28] });
      const dna = rec.generateMatchDNA(item);
      const html = renderPeekMatchDNA(dna);
      assert.ok(html.includes('peek-dna-section'));
      assert.ok(html.includes('Match'));
      assert.ok(html.includes('%'));
    });

    it('should render only top 2 categories when recommender returns 4', () => {
      const item = makeItem('b', {
        genres: [28, 12],
        tags: ['dark', 'funny'],
        year: 2020,
        mediaDNA: { tropes: ['revenge'], pacing: ['relentless'], aesthetic: [], warnings: [] },
      });
      app.state.eraFilter = 'current';
      const dna = rec.generateMatchDNA(item);
      assert.ok(dna.dna_breakdown.length >= 3, 'Recommender should generate 3+ categories');

      const html = renderPeekMatchDNA(dna);
      const bars = html.match(/<div class="peek-dna-bar">/g);
      assert.equal(bars ? bars.length : 0, 2, 'Should render exactly 2 bars (top 2 only)');
    });

    it('should produce color-coded output consistent with the overall score', () => {
      const item = makeItem('c', { genres: [27] }); // Horror + no profile = baseline ~50
      const dna = rec.generateMatchDNA(item);
      const html = renderPeekMatchDNA(dna);

      // The overall percentage should match what appears in the header
      assert.ok(html.includes(`${dna.overall_match_percentage}%`));
    });
  });
});
