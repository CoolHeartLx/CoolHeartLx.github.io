/**
 * Modern Local Search Implementation
 * Compatible with hexo-generator-search
 * Separated from UI control logic for better maintainability
 */

class ModernSearch {
  constructor(options = {}) {
    this.options = {
      path: options.path || 'search.xml',
      inputSelector: options.inputSelector || '#search-input',
      resultsSelector: options.resultsSelector || '#search-results .search-results__list',
      loadingSelector: options.loadingSelector || '.search-results__loading',
      emptySelector: options.emptySelector || '.search-results__empty',
      maxResults: options.maxResults || 50,
      excerptLength: options.excerptLength || 200,
      debounceDelay: options.debounceDelay || 300,
      ...options
    };
    
    this.searchData = [];
    this.searchInput = null;
    this.resultsContainer = null;
    this.loadingElement = null;
    this.emptyElement = null;
    this.debounceTimer = null;
    
    this.init();
  }
  
  async init() {
    // Find DOM elements
    this.searchInput = document.querySelector(this.options.inputSelector);
    this.resultsContainer = document.querySelector(this.options.resultsSelector);
    this.loadingElement = document.querySelector(this.options.loadingSelector);
    this.emptyElement = document.querySelector(this.options.emptySelector);
    
    if (!this.searchInput || !this.resultsContainer) {
      console.warn('Search elements not found');
      return;
    }
    
    // Load search data
    await this.loadSearchData();
    
    // Set up event listeners
    this.setupEventListeners();
  }
  
  async loadSearchData() {
    try {
      this.showLoading();
      
      const response = await fetch(this.options.path);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      // Check for parsing errors
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        throw new Error('XML parsing failed');
      }
      
      // Extract search data
      const entries = xmlDoc.querySelectorAll('entry');
      this.searchData = Array.from(entries).map(entry => ({
        title: this.getTextContent(entry, 'title'),
        content: this.getTextContent(entry, 'content'),
        url: this.getTextContent(entry, 'url')
      })).filter(item => item.title && item.content); // Filter out empty entries
      
      this.hideLoading();
      console.log(`Loaded ${this.searchData.length} search entries`);
      
    } catch (error) {
      console.error('Failed to load search data:', error);
      this.hideLoading();
      this.showError('Failed to load search data');
    }
  }
  
  getTextContent(parent, tagName) {
    const element = parent.querySelector(tagName);
    return element ? element.textContent.trim() : '';
  }
  
  setupEventListeners() {
    // Debounced input handler
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(this.debounceTimer);
      const query = e.target.value.trim();
      
      this.debounceTimer = setTimeout(() => {
        if (query.length === 0) {
          this.clearResults();
        } else if (query.length >= 2) { // Only search for 2+ characters
          this.performSearch(query);
        }
      }, this.options.debounceDelay);
    });
    
    // Handle Enter key
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim();
        if (query.length >= 2) {
          clearTimeout(this.debounceTimer);
          this.performSearch(query);
        }
      }
    });
  }
  
  performSearch(query) {
    if (!query || this.searchData.length === 0) {
      this.clearResults();
      return;
    }
    
    this.showLoading();
    
    // Use requestAnimationFrame for better performance with large datasets
    requestAnimationFrame(() => {
      const results = this.search(query);
      this.displayResults(results, query);
      this.hideLoading();
    });
  }
  
  search(query) {
    const keywords = query.toLowerCase()
      .split(/[\s\-\+\(\)]+/)
      .filter(word => word.length > 0);
    
    if (keywords.length === 0) return [];
    
    const results = [];
    
    for (const item of this.searchData) {
      const titleLower = item.title.toLowerCase();
      const contentLower = this.stripHtml(item.content).toLowerCase();
      
      let score = 0;
      let matchedKeywords = 0;
      const titleMatches = [];
      const contentMatches = [];
      
      for (const keyword of keywords) {
        const titleIndex = titleLower.indexOf(keyword);
        const contentIndex = contentLower.indexOf(keyword);
        
        if (titleIndex >= 0 || contentIndex >= 0) {
          matchedKeywords++;
          
          // Higher score for title matches
          if (titleIndex >= 0) {
            score += titleIndex === 0 ? 10 : 5; // Boost for exact start matches
            titleMatches.push({ keyword, index: titleIndex });
          }
          
          // Lower score for content matches
          if (contentIndex >= 0) {
            score += 1;
            contentMatches.push({ keyword, index: contentIndex });
          }
        }
      }
      
      // Only include results that match all keywords
      if (matchedKeywords === keywords.length) {
        results.push({
          ...item,
          score,
          titleMatches,
          contentMatches,
          excerpt: this.generateExcerpt(contentLower, keywords)
        });
      }
    }
    
    // Sort by score (descending) and limit results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.maxResults);
  }
  
  stripHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }
  
  generateExcerpt(content, keywords) {
    // Find the first keyword occurrence
    let firstIndex = Infinity;
    for (const keyword of keywords) {
      const index = content.indexOf(keyword);
      if (index >= 0 && index < firstIndex) {
        firstIndex = index;
      }
    }
    
    if (firstIndex === Infinity) return content.substring(0, this.options.excerptLength);
    
    // Generate excerpt around the first match
    const start = Math.max(0, firstIndex - 50);
    const end = Math.min(content.length, start + this.options.excerptLength);
    
    let excerpt = content.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';
    
    return excerpt;
  }
  
  highlightKeywords(text, keywords) {
    let highlighted = text;
    
    for (const keyword of keywords) {
      const regex = new RegExp(`(${this.escapeRegex(keyword)})`, 'gi');
      highlighted = highlighted.replace(regex, '<mark class="search-keyword">$1</mark>');
    }
    
    return highlighted;
  }
  
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  displayResults(results, query) {
    if (results.length === 0) {
      this.showEmpty();
      return;
    }
    
    this.hideEmpty();
    
    const keywords = query.toLowerCase().split(/[\s\-\+\(\)]+/).filter(word => word.length > 0);
    
    const resultsHtml = results.map(result => `
      <article class="search-result-item">
        <h3 class="search-result-item__title">
          <a href="${this.escapeHtml(result.url)}" title="${this.escapeHtml(result.title)}">
            ${this.highlightKeywords(this.escapeHtml(result.title), keywords)}
          </a>
        </h3>
        <p class="search-result-item__excerpt">
          ${this.highlightKeywords(this.escapeHtml(result.excerpt), keywords)}
        </p>
        <div class="search-result-item__meta">
          ${result.url}
        </div>
      </article>
    `).join('');
    
    this.resultsContainer.innerHTML = resultsHtml;
    
    // Add click tracking (optional)
    this.trackSearchResults(query, results.length);
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  clearResults() {
    if (this.resultsContainer) {
      this.resultsContainer.innerHTML = '';
    }
    this.hideLoading();
    this.hideEmpty();
  }
  
  showLoading() {
    if (this.loadingElement) {
      this.loadingElement.hidden = false;
    }
    this.hideEmpty();
  }
  
  hideLoading() {
    if (this.loadingElement) {
      this.loadingElement.hidden = true;
    }
  }
  
  showEmpty() {
    if (this.emptyElement) {
      this.emptyElement.hidden = false;
    }
  }
  
  hideEmpty() {
    if (this.emptyElement) {
      this.emptyElement.hidden = true;
    }
  }
  
  showError(message) {
    if (this.resultsContainer) {
      this.resultsContainer.innerHTML = `
        <div class="search-error" style="text-align: center; color: var(--color-danger); padding: 2rem;">
          <p>${this.escapeHtml(message)}</p>
        </div>
      `;
    }
  }
  
  trackSearchResults(query, resultCount) {
    // Optional: Track search analytics
    if (typeof gtag === 'function') {
      gtag('event', 'search', {
        search_term: query,
        custom_parameter: resultCount
      });
    }
  }
}

// Initialize search when DOM is ready and search is enabled
document.addEventListener('DOMContentLoaded', () => {
  // Check if search elements exist (indicating search is enabled)
  if (document.querySelector('#search-dialog') && document.querySelector('#search-input')) {
    // Initialize with default options - can be customized via theme config
    window.modernSearch = new ModernSearch({
      path: '/search.xml', // Default path - should be configurable
      maxResults: 50,
      excerptLength: 200,
      debounceDelay: 300
    });
  }
});