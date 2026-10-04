function getCsrfToken() {
  return window.__courseAppState?.csrf || '';
}

function buildAiRequestOptions(options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  return { credentials: 'same-origin', ...options, headers };
}

export function initializeAiChat() {
  const root = document.getElementById('ai-chat-root');
  if (!root) return;
  if (root.dataset.aiChatInitialized === 'true') return;
  root.dataset.aiChatInitialized = 'true';

  let floatingButton = root.querySelector('#ai-chat-button');
  if (!floatingButton) {
    floatingButton = document.createElement('button');
    floatingButton.id = 'ai-chat-button';
    floatingButton.className = 'ai-chat-button';
    floatingButton.type = 'button';
    floatingButton.setAttribute('aria-label', 'فتح مساعد S.T.C الذكي');
    floatingButton.innerHTML = `
      <svg class="ai-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span class="ai-chat-label">S.T.C AI</span>
    `;
    root.appendChild(floatingButton);
  }

  let modal = root.querySelector('#ai-chat-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ai-chat-modal';
    modal.className = 'ai-chat-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'ai-chat-header');
    modal.innerHTML = `
      <div class="ai-chat-overlay"></div>
      <div class="ai-chat-dialog">
        <header class="ai-chat-header">
          <div class="ai-chat-header-content">
            <h2 id="ai-chat-header" class="ai-chat-title">S.T.C AI</h2>
            <p class="ai-chat-subtitle">مساعدك الذكي لإدارة الكورس</p>
          </div>
          <button class="ai-chat-close-btn" type="button" aria-label="إغلاق المحادثة">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </header>

        <div class="ai-chat-messages" role="log" aria-live="polite" aria-label="رسائل المحادثة">
          <div class="ai-chat-welcome">
            <p class="ai-chat-welcome-text">👋 أهلاً! كيف يمكنني مساعدتك؟</p>
            <div class="ai-chat-suggestions">
              <button class="ai-chat-suggestion" type="button">احك مثال</button>
            </div>
          </div>
        </div>

        <footer class="ai-chat-footer">
          <div class="ai-chat-input-wrapper">
            <input
              type="text"
              class="ai-chat-input"
              placeholder="اكتب سؤالك..."
              aria-label="حقل إدخال الرسالة"
              autocomplete="off"
            />
            <button class="ai-chat-send-btn" type="button" aria-label="إرسال الرسالة">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
          <button class="ai-chat-clear-btn" type="button" aria-label="مسح المحادثة">
            🗑️ مسح
          </button>
        </footer>
      </div>
    `;
    root.appendChild(modal);
  }

  // State
  let isOpen = false;
  let isLoading = false;
  const messagesContainer = modal.querySelector('.ai-chat-messages');
  const input = modal.querySelector('.ai-chat-input');
  const sendBtn = modal.querySelector('.ai-chat-send-btn');
  const clearBtn = modal.querySelector('.ai-chat-clear-btn');
  const overlay = modal.querySelector('.ai-chat-overlay');
  const closeBtn = modal.querySelector('.ai-chat-close-btn');

  if (!messagesContainer || !input || !sendBtn || !clearBtn || !closeBtn) {
    return;
  }

  // Helper function to create message element
  function createMessageElement(type, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `ai-chat-message ai-chat-message-${type}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'ai-chat-message-content';
    contentDiv.textContent = text;

    messageDiv.appendChild(contentDiv);
    return messageDiv;
  }

  // Helper function to convert markdown to HTML
  function markdownToHtml(text) {
    const escaped = text.replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
    return escaped
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  // Open/Close modal
  function openModal() {
    isOpen = true;
    modal.hidden = false;
    input.focus();
    floatingButton.classList.add('active');
  }

  function closeModal() {
    isOpen = false;
    modal.hidden = true;
    floatingButton.classList.remove('active');
  }

  // Toggle modal
  floatingButton.addEventListener('click', () => {
    if (isOpen) closeModal();
    else openModal();
  });

  closeBtn.addEventListener('click', closeModal);
  if (overlay) overlay.addEventListener('click', closeModal);

  // Handle Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeModal();
  });

  // Send message
  async function sendMessage() {
    const messageText = input.value.trim();
    if (!messageText || isLoading) return;

    // Add user message to UI
    const userMessage = createMessageElement('user', messageText);
    messagesContainer.appendChild(userMessage);

    input.value = '';
    isLoading = true;

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-chat-message ai-chat-message-ai ai-chat-message-loading';
    loadingDiv.innerHTML = '<div class="ai-chat-loading-dots"><span></span><span></span><span></span></div>';
    messagesContainer.appendChild(loadingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      // Call API
      const response = await fetch('/api/ai/chat/message', buildAiRequestOptions({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageText })
      }));

      if (!response.ok) {
        throw new Error('فشل إرسال الرسالة');
      }

      const data = await response.json();

      // Remove loading indicator
      loadingDiv.remove();

      // Add AI response
      const aiMessage = createMessageElement('ai', data.response);
      const contentDiv = aiMessage.querySelector('.ai-chat-message-content');
      contentDiv.innerHTML = markdownToHtml(data.response);
      messagesContainer.appendChild(aiMessage);

      // Welcome message should be hidden once we have real messages
      const welcome = messagesContainer.querySelector('.ai-chat-welcome');
      if (welcome) welcome.remove();

      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
      console.error('Chat error:', error);

      // Remove loading indicator
      loadingDiv.remove();

      // Add error message
      const errorMessage = createMessageElement('ai', 'عذراً، حدث خطأ. حاول مرة أخرى.');
      messagesContainer.appendChild(errorMessage);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } finally {
      isLoading = false;
      input.focus();
    }
  }

  // Send button click
  sendBtn.addEventListener('click', sendMessage);

  // Enter key to send
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Clear chat history
  clearBtn.addEventListener('click', async () => {
    if (!confirm('هل تريد مسح جميع الرسائل؟')) return;

    try {
      const response = await fetch('/api/ai/chat/history', buildAiRequestOptions({
        method: 'DELETE'
      }));

      if (response.ok) {
        messagesContainer.innerHTML = `
          <div class="ai-chat-welcome">
            <p class="ai-chat-welcome-text">👋 تم مسح المحادثة. كيف يمكنني مساعدتك؟</p>
          </div>
        `;
      }
    } catch (error) {
      console.error('Clear history error:', error);
    }
  });

  // Load chat history on open
  floatingButton.addEventListener('click', async () => {
    if (isOpen) {
      try {
        const response = await fetch('/api/ai/chat/history', buildAiRequestOptions({ method: 'GET' }));

        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            // Only load if we're starting fresh
            const hasMessages = messagesContainer.querySelectorAll('.ai-chat-message').length > 0;
            if (!hasMessages) {
              messagesContainer.innerHTML = '';
              data.messages.forEach(msg => {
                const userMsg = createMessageElement('user', msg.message);
                messagesContainer.appendChild(userMsg);

                const aiMsg = createMessageElement('ai', msg.response);
                const contentDiv = aiMsg.querySelector('.ai-chat-message-content');
                contentDiv.innerHTML = markdownToHtml(msg.response);
                messagesContainer.appendChild(aiMsg);
              });
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          }
        }
      } catch (error) {
        console.error('Load history error:', error);
      }
    }
  });
}
