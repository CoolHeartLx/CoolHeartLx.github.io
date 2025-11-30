/**
 * Webmention 动态加载脚本 - ES6版本
 * 支持三种模式：static, dynamic, hybrid
 */
class WebmentionLoader {
  constructor() {
    this.init();
  }

  // 内容截断函数
  truncateContent(content, maxLength = 200) {
    if (!content) return '';
    
    const textContent = content.replace(/<[^>]*>/g, '');
    if (textContent.length <= maxLength) {
      return content;
    }
    
    const truncatedText = textContent.substring(0, maxLength).trim();
    return content.includes('<') ? `<p>${truncatedText}…</p>` : `${truncatedText}…`;
  }

  // 创建webmention HTML元素（使用与服务端相同的结构）
  createWebmentionElement(mention) {
    const item = document.createElement('div');
    item.className = 'webmention-item webmention-dynamic';
    item.id = `webmention-${mention['wm-id']}`;
    item.setAttribute('data-webmention-id', mention['wm-id']);

    const authorName = mention.author ? mention.author.name || 'Anonymous' : 'Anonymous';
    const authorUrl = mention.author ? mention.author.url : '';
    const authorPhoto = mention.author ? mention.author.photo : '';

    const authorHtml = authorUrl 
      ? `<a class="webmention-author-name" href="${authorUrl}" target="_blank" rel="noopener ugc">${authorName}</a>`
      : `<span class="webmention-author-name">${authorName}</span>`;
    
    const photoHtml = authorPhoto
      ? `<img class="webmention-author-photo" src="${authorPhoto}" alt="${authorName}" loading="lazy">`
      : '';

    const publishedDate = new Date(mention.published || mention['wm-received']);
    const dateStr = publishedDate.toLocaleDateString('zh-CN');

    let content = mention.content;
    if (Array.isArray(content) && content.length > 0) {
      content = content[0];
    }

    const contentHtml = content ? content.html || content.text : '';

    item.innerHTML = `
      <div class="webmention-author">
        ${photoHtml}
        ${authorHtml}
        <span class="webmention-date">${dateStr}</span>
      </div>
      <div class="webmention-content">
        ${DOMPurify.sanitize(this.truncateContent(contentHtml))}
      </div>
      <div class="webmention-meta">
        <a class="webmention-source" href="${mention['wm-source']}" target="_blank" rel="noopener ugc">查看原文</a>
      </div>
    `;

    return item;
  }

  // 获取已存在的webmention IDs
  getExistingWebmentionIds(container) {
    const existingItems = container.querySelectorAll('[data-webmention-id]');
    const ids = new Set();
    existingItems.forEach(item => {
      const id = item.getAttribute('data-webmention-id');
      if (id) {
        ids.add(parseInt(id, 10));
      }
    });
    return ids;
  }

  // 更新webmention计数
  updateWebmentionCount(container, newCount) {
    const countEl = container.querySelector('.webmention-count');
    if (countEl) {
      countEl.textContent = newCount;
    }
  }

  // 添加加载动画
  addLoadingAnimation(element) {
    element.style.opacity = '0';
    element.style.transform = 'translateY(10px)';
    element.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.style.opacity = '1';
        element.style.transform = 'translateY(0)';
      });
    });
  }

  // 获取webmention数据（使用target API，无需客户端过滤）
  async fetchWebmentions(fullUrl) {
    const apiUrl = `https://webmention.io/api/mentions.jf2?target=${encodeURIComponent(fullUrl)}`;
    
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      // 直接返回API结果，无需客户端处理
      return data.children || [];
    } catch (error) {
      console.error('Failed to fetch webmentions:', error);
      throw error;
    }
  }

  // 静态模式：什么都不做
  handleStaticMode(container) {
    console.log('Webmention static mode - no dynamic loading');
  }

  // 动态模式：完全由客户端加载
  async handleDynamicMode(container) {
    const fullUrl = container.getAttribute('data-full-url');
    
    try {
      const webmentions = await this.fetchWebmentions(fullUrl);
      
      // 创建完整的结构
      if (webmentions.length > 0) {
        container.innerHTML = `
          <h3 class="webmention-title">Webmentions (<span class="webmention-count">${webmentions.length}</span>)</h3>
          <div class="webmention-list"></div>
        `;
        
        const webmentionList = container.querySelector('.webmention-list');
        
        // 按时间排序并添加所有webmentions
        webmentions
          .sort((a, b) => new Date(a['wm-received']) - new Date(b['wm-received']))
          .forEach(mention => {
            const element = this.createWebmentionElement(mention);
            webmentionList.appendChild(element);
            this.addLoadingAnimation(element);
          });

        console.log(`Loaded ${webmentions.length} webmentions in dynamic mode`);
      } else {
        // 显示空状态
        container.innerHTML = `
          <h3 class="webmention-title">Webmentions (<span class="webmention-count">0</span>)</h3>
          <div class="webmention-list"></div>
          <span>暂无 Webmentions</span>
        `;
      }
      
      // 移除loading类
      if (container.classList.contains('webmention-empty')) {
        container.classList.remove('webmention-empty');
      }
    } catch (error) {
      console.error('Dynamic webmention loading failed:', error);
      container.innerHTML = `
        <h3 class="webmention-title">Webmentions</h3>
        <span class="webmention-error">加载失败</span>
      `;
    }
  }

  // 混合模式：与静态内容合并
  async handleHybridMode(container) {
    const fullUrl = container.getAttribute('data-full-url');
    
    try {
      const webmentions = await this.fetchWebmentions(fullUrl);
      
      // 获取已存在的webmention IDs
      const existingIds = this.getExistingWebmentionIds(container);
      
      // 过滤出新的webmentions
      const newWebmentions = webmentions.filter(mention => 
        !existingIds.has(mention['wm-id'])
      );

      if (newWebmentions.length > 0) {
        const webmentionList = container.querySelector('.webmention-list');
        
        // 移除空状态
        const emptySpan = container.querySelector('.webmention-section.webmention-empty > span');
        if (emptySpan) {
          emptySpan.style.display = 'none';
        }
        
        if (container.classList.contains('webmention-empty')) {
          container.classList.remove('webmention-empty');
        }

        // 按时间排序并添加新的webmentions
        newWebmentions
          .sort((a, b) => new Date(a['wm-received']) - new Date(b['wm-received']))
          .forEach(mention => {
            const element = this.createWebmentionElement(mention);
            webmentionList.appendChild(element);
            this.addLoadingAnimation(element);
          });

        // 更新计数
        const totalCount = existingIds.size + newWebmentions.length;
        this.updateWebmentionCount(container, totalCount);
        
        console.log(`Added ${newWebmentions.length} new webmentions in hybrid mode`);
      } else {
        console.log('No new webmentions found in hybrid mode');
      }
    } catch (error) {
      console.error('Hybrid webmention loading failed:', error);
      // 静默失败，不影响已有的静态内容
    }
  }

  // 处理单个webmention容器
  async processContainer(container) {
    const mode = container.getAttribute('data-mode') || 'static';
    const fullUrl = container.getAttribute('data-full-url');
    
    if (!fullUrl) {
      console.warn('Webmention container missing required data-full-url attribute');
      return;
    }

    console.log(`Processing webmention container in ${mode} mode`);

    switch (mode) {
      case 'static':
        this.handleStaticMode(container);
        break;
      case 'dynamic':
        await this.handleDynamicMode(container);
        break;
      case 'hybrid':
        await this.handleHybridMode(container);
        break;
      default:
        console.warn(`Unknown webmention mode: ${mode}`);
    }
  }

  // 初始化
  init() {
    const containers = document.querySelectorAll('.webmention-section[data-full-url]');
    if (containers.length === 0) {
      return;
    }

    // 处理所有容器
    containers.forEach(container => this.processContainer(container));
  }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new WebmentionLoader());
} else {
  new WebmentionLoader();
}