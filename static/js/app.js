/* ====================================================
   DRAKON AI - Grok-Style Chat Interface
   Modern, Clean, Minimal JavaScript
   ==================================================== */

class DrakonInterface {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.chatMessages = document.getElementById('chatMessages');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.voiceBtn = document.getElementById('voiceBtn');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');
        this.chatListContainer = document.getElementById('chatList');

        this.chatId = null; // Current active chat
        this.isLoading = false;
        this.conversationStarted = false;
        this.messageStartTime = null;
        this.selectedModel = localStorage.getItem('drakon_selected_model') || 'drakon'; // Load from storage or default
        this.abortController = null; // Controller for stopping generation
        window.imageGenMode = false; // Initialize Image Gen Mode
        this.deepThinkMode = false; // Initialize DeepThink Mode

        // File Upload Elements
        this.attachBtn = document.getElementById('attachOption');
        this.fileInput = document.getElementById('fileInput');
        this.filePreviewArea = document.getElementById('filePreviewArea');
        this.selectedFiles = []; // Array to store selected files

        this.initialize();
        // Note: loadModels and setupModelSelector are called inside initialize()
    }

    initialize() {
        console.log('⚡ DRAKON Interface initializing...');

        // Check for ?start=true to auto-dismiss landing page
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('start') === 'true') {
            if (typeof dismissLandingPage === 'function') {
                dismissLandingPage();
                // Clean URL
                window.history.replaceState({}, document.title, window.location.pathname);
            } else {
                // Fallback if function not ready yet (wait for it)
                const checkDismiss = setInterval(() => {
                    if (typeof dismissLandingPage === 'function') {
                        dismissLandingPage();
                        clearInterval(checkDismiss);
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                }, 100);
            }
        }

        // Configure marked for markdown parsing (Custom Renderer for Code Cards)
        if (typeof marked !== 'undefined') {
            console.log('✅ marked.js loaded, version:', marked.version || 'unknown');
            try {
                var renderer = new marked.Renderer();

                renderer.code = function (code, language) {
                    var lang = language || 'code';
                    var highlighted = code;

                    if (typeof hljs !== 'undefined') {
                        try {
                            if (language && hljs.getLanguage(language)) {
                                highlighted = hljs.highlight(code, { language: language }).value;
                            } else {
                                highlighted = hljs.highlightAuto(code).value;
                            }
                        } catch (e) {
                            console.warn('Highlight failed:', e);
                        }
                    }

                    return '<div class="code-card">' +
                        '<div class="code-header">' +
                        '<span class="code-lang">' + lang + '</span>' +
                        '<button class="copy-btn" onclick="drakon.copyCode(this)">' +
                        '<i class="fas fa-copy"></i> Copy' +
                        '</button>' +
                        '</div>' +
                        '<pre><code class="hljs ' + lang + '">' + highlighted + '</code></pre>' +
                        '</div>';
                };

                marked.setOptions({
                    renderer: renderer,
                    breaks: true,
                    gfm: true
                });
            } catch (err) {
                console.error('❌ marked config failed:', err);
            }
        } else {
            console.error('❌ marked.js NOT loaded! Markdown will not render.');
        }

        // Configure highlight.js
        if (typeof hljs !== 'undefined') {
            hljs.configure({ ignoreUnescapedHTML: true });
        }

        // Focus input on load
        if (this.messageInput) {
            this.messageInput.focus();
        }

        // Setup Send Button
        this.sendBtn = document.getElementById('sendBtn');
        if (this.sendBtn) {
            this.sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // Setup auto-resize for textarea
        this.setupAutoResize();

        // Setup sidebar toggling
        const sidebarToggleBtn = document.getElementById('sidebarToggle');
        if (sidebarToggleBtn) {
            sidebarToggleBtn.addEventListener('click', () => this.toggleSidebar());
        }
        if (this.sidebarOverlay) {
            this.sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        }

        // Load chat list
        this.loadChatList();

        // Load models and setup selector (New)
        this.loadModels();
        this.setupModelSelector();
        this.setupModeDropdown();

        // File Attachment Events
        if (this.attachBtn) {
            this.attachBtn.addEventListener('click', () => {
                this.fileInput.click();
                // Close the dropdown after clicking
                const menu = document.getElementById('modeDropdownMenu');
                const btn = document.getElementById('modeDropdownBtn');
                if (menu) menu.classList.remove('show');
                if (btn) btn.classList.remove('active');
            });
        }
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        console.log('✅ DRAKON Interface ready!');
    }

    async loadChatList() {
        try {
            const response = await fetch('/api/chats');
            if (response.ok) {
                const chats = await response.json();
                this.renderChatList(chats);
            }
        } catch (error) {
            console.error('Failed to load chat list:', error);
        }
    }

    async loadModels() {
        try {
            console.log('🔄 Fetching models...');
            const response = await fetch('/api/models');
            if (response.ok) {
                const models = await response.json();
                console.log('✅ Models loaded:', models);

                // Default to first available model if the saved one isn't loaded (e.g., Drakon removed in Desktop mode)
                if (models.length > 0 && !models.some(m => m.id === this.selectedModel)) {
                    this.selectedModel = models[0].id;
                    localStorage.setItem('drakon_selected_model', this.selectedModel);
                }

                this.modelsList = models;
                this.renderModelList(models);

                // Update header to show saved model name
                const savedModelId = this.selectedModel;
                const savedModel = models.find(m => m.id === savedModelId);

                let displayName = 'Drakon'; // Default

                if (savedModel) {
                    displayName = savedModel.name.replace(/✨|🖥️/g, '').trim();
                    if (displayName.includes('(Cloud)')) displayName = displayName.replace('(Cloud)', '').trim();
                    if (displayName.includes('(Local)')) displayName = displayName.replace('(Local)', '').trim();
                } else if (savedModelId && savedModelId !== 'drakon') {
                    // Fallback: If saved model is valid but not in list (e.g. loading issue), show ID
                    displayName = savedModelId;
                }

                if (displayName.length > 15) displayName = displayName.substring(0, 13) + '..';

                const versionElem = document.getElementById('currentModelName');
                if (versionElem) versionElem.textContent = displayName;

                // If the selected model is disabled (e.g., Hushiyar is missing), show the modal automatically
                const currentSelectedModelConfig = models.find(m => m.id === this.selectedModel);
                if (currentSelectedModelConfig && currentSelectedModelConfig.disabled) {
                    setTimeout(() => {
                        const hushiyarModal = document.getElementById('hushiyarModal');
                        if (hushiyarModal) hushiyarModal.classList.add('active');
                    }, 500);
                }
            } else {
                console.error('❌ Failed to fetch models:', response.status);
            }
        } catch (error) {
            console.error('❌ Error loading models:', error);
        }
    }

    renderModelList(models) {
        const menu = document.getElementById('modelDropdownMenu');
        if (!menu) {
            console.error('❌ renderModelList: Menu not found!');
            return;
        }

        menu.innerHTML = ''; // Clear existing

        // Apply essential inline styles
        menu.style.position = 'fixed';
        menu.style.minWidth = '280px';
        menu.style.background = '#1e1e1e';
        menu.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        menu.style.borderRadius = '12px';
        menu.style.boxShadow = '0 10px 40px rgba(0, 0, 0, 0.8)';
        menu.style.zIndex = '99999';
        menu.style.padding = '0';
        menu.style.overflow = 'hidden';
        menu.style.display = 'none'; // Hidden by default

        // Add header
        const header = document.createElement('div');
        header.className = 'dropdown-header';
        header.style.cssText = 'padding: 12px 16px; font-weight: 600; color: #fff; border-bottom: 1px solid #333; display: flex; justify-content: space-between; align-items: center;';
        header.innerHTML = `
            <span>DRAKON Models</span>
            <button id="refreshModelsBtn" title="Refresh Models" style="background: none; border: none; color: #888; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: color 0.2s;">
                <i class="fas fa-sync-alt"></i>
            </button>
        `;
        menu.appendChild(header);

        // Add refresh event listener
        const refreshBtn = header.querySelector('#refreshModelsBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const icon = refreshBtn.querySelector('i');
                if (icon) {
                    icon.classList.add('fa-spin');
                    icon.style.color = '#fff';
                }
                this.loadModels();
            });
            refreshBtn.addEventListener('mouseover', () => { refreshBtn.style.color = '#fff'; });
            refreshBtn.addEventListener('mouseout', () => { refreshBtn.style.color = '#888'; });
        }

        // Create items container
        const itemsContainer = document.createElement('div');
        itemsContainer.className = 'dropdown-items';
        itemsContainer.style.cssText = 'padding: 8px; max-height: 300px; overflow-y: auto; overflow-x: hidden;';

        // Model descriptions map
        const modelDescriptions = {
            'drakon': 'Fast cloud-powered responses',
        };

        models.forEach(model => {
            const btn = document.createElement('button');
            const isSelected = model.id === this.selectedModel;
            btn.className = `mode-dropdown-item ${isSelected ? 'active' : ''}`;
            btn.style.cssText = 'display: flex; width: 100%; padding: 10px 12px; background: transparent; border: none; color: #fff; cursor: pointer; border-radius: 8px; text-align: left; align-items: flex-start; gap: 12px;';

            // Get display name (strip emojis)
            let displayName = model.name.replace(/✨|🖥️/g, '').trim();
            if (displayName.includes('(Cloud)')) displayName = displayName.replace('(Cloud)', '').trim();
            if (displayName.includes('(Local)')) displayName = displayName.replace('(Local)', '').trim();

            // Get description
            let description = modelDescriptions[model.id] ||
                (model.provider === 'ollama' ? 'Local model on your machine' : 'Cloud-powered AI');

            // Check if it's a special/new model
            const isNew = model.id.includes('deepseek') || model.id.includes('mistral');

            btn.innerHTML = `
                <div class="dropdown-item-content" style="flex: 1;">
                    <span class="dropdown-item-title" style="display: block; font-weight: 500; color: #fff;">${displayName}</span>
                    <span class="dropdown-item-subtitle" style="display: block; font-size: 0.8rem; color: #888;">${model.disabled ? model.disabledReason : description}</span>
                </div>
                <div class="dropdown-item-right" style="display: flex; align-items: center; gap: 8px;">
                    ${isNew && !model.disabled ? '<span class="dropdown-badge" style="padding: 2px 8px; background: rgba(138,180,248,0.2); color: #8ab4f8; font-size: 0.7rem; border-radius: 10px;">New</span>' : ''}
                    ${model.disabled ? '<i class="fas fa-lock" style="color: #666; font-size: 14px;"></i>' : ''}
                    ${isSelected ? '<div class="dropdown-check" style="width: 20px; height: 20px; background: #4a9eff; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><i class="fas fa-check" style="font-size: 10px; color: #000;"></i></div>' : ''}
                </div>
            `;

            if (model.disabled) {
                btn.style.opacity = '0.5';
                btn.style.cursor = 'not-allowed';
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const hushiyarModal = document.getElementById('hushiyarModal');
                    if (model.disabledReason && model.disabledReason.includes('Hushiyar') && hushiyarModal) {
                        hushiyarModal.classList.add('active');
                        // Close dropdown menu
                        const menu = document.getElementById('modelDropdownMenu');
                        if (menu) menu.style.display = 'none';
                    } else if (typeof showNotification === 'function') {
                        showNotification(model.disabledReason || 'This model is currently unavailable', 'error');
                    }
                };
            } else {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    this.selectModel(model);
                    // Re-render list to update checkmarks
                    this.renderModelList(models);
                };

                // Hover effect
                btn.onmouseenter = () => btn.style.background = 'rgba(255,255,255,0.1)';
                btn.onmouseleave = () => btn.style.background = 'transparent';
            }

            itemsContainer.appendChild(btn);
        });

        menu.appendChild(itemsContainer);
    }

    selectModel(model) {
        console.log('🎯 Selecting model:', model.id);

        // If placeholder is selected, refresh models instead
        if (model.id === 'ollama-placeholder') {
            console.log('🔄 Refreshing Ollama models...');
            if (typeof showNotification === 'function') {
                showNotification('Starting Ollama...', 'info');
            }
            this.loadModels(); // Reload models (triggers auto-start on backend)
            return;
        }

        this.selectedModel = model.id;

        // Save to localStorage for persistence
        localStorage.setItem('drakon_selected_model', model.id);

        // Get clean display name for the header
        let displayName = model.name.replace(/✨|🖥️/g, '').trim();
        if (displayName.includes('(Cloud)')) displayName = displayName.replace('(Cloud)', '').trim();
        if (displayName.includes('(Local)')) displayName = displayName.replace('(Local)', '').trim();

        // Shorten for header display
        if (displayName.length > 15) displayName = displayName.substring(0, 13) + '..';

        // Update header model version text
        const versionElem = document.getElementById('currentModelName');
        if (versionElem) versionElem.textContent = displayName;

        // Close dropdown
        const menu = document.getElementById('modelDropdownMenu');
        if (menu) menu.classList.remove('active');

        // Visual feedback
        if (typeof showNotification === 'function') {
            showNotification(`Switched to ${displayName}`, 'info');
        }
    }

    setupModelSelector() {
        const btn = document.getElementById('modelSelectorBtn');
        const menu = document.getElementById('modelDropdownMenu');

        if (btn && menu) {
            console.log('✅ setupModelSelector: Found button and menu');
            btn.addEventListener('click', (e) => {
                console.log('🔘 Toggle model menu clicked');
                e.stopPropagation();

                // Calculate position based on button location
                const rect = btn.getBoundingClientRect();

                // Position above the button using top/left
                // Position above the button using bottom/right
                menu.style.top = 'auto'; // Let height determine top
                menu.style.left = 'auto';
                menu.style.right = (window.innerWidth - rect.right) + 'px';
                menu.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
                menu.style.maxHeight = '500px'; // Prevent covering entire screen
                menu.style.flexDirection = 'column';

                // Toggle display using inline style
                if (menu.style.display === 'none' || menu.style.display === '') {
                    menu.style.display = 'flex';
                    console.log('🔘 Menu shown at top:', menu.style.top, 'left:', menu.style.left);
                    console.log('🔘 Menu element:', menu);
                } else {
                    menu.style.display = 'none';
                    console.log('🔘 Menu hidden');
                }
            });

            // Close on click outside
            document.addEventListener('click', (e) => {
                if (!btn.contains(e.target) && !menu.contains(e.target)) {
                    menu.style.display = 'none';
                }
            });
        } else {
            console.error('❌ setupModelSelector: Button or menu missing!');
        }
    }

    setupModeDropdown() {
        const btn = document.getElementById('modeDropdownBtn');
        const menu = document.getElementById('modeDropdownMenu');

        if (btn && menu) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close other menu
                const otherMenu = document.getElementById('modelDropdownMenu');
                if (otherMenu) otherMenu.classList.remove('active');

                // Position the dropdown ABOVE the button
                const rect = btn.getBoundingClientRect();
                menu.style.position = 'fixed';
                menu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
                menu.style.left = rect.left + 'px';
                menu.style.top = 'auto';

                menu.classList.toggle('active');
            });

            document.addEventListener('click', (e) => {
                if (!btn.contains(e.target) && !menu.contains(e.target)) {
                    menu.classList.remove('active');
                }
            });

            // Options handlers
            const deepThinkBtn = document.getElementById('deepThinkOption');
            if (deepThinkBtn) {
                deepThinkBtn.onclick = () => {
                    this.toggleDeepThink();
                    menu.classList.remove('active');
                };
            }

            const imgGenBtn = document.getElementById('imgGenOption');
            if (imgGenBtn) {
                imgGenBtn.onclick = () => {
                    this.toggleImageGen();
                    menu.classList.remove('active');
                };
            }
        }
    }

    toggleDeepThink() {
        this.deepThinkMode = !this.deepThinkMode;
        if (typeof showNotification === 'function') {
            showNotification(this.deepThinkMode ? 'DeepThink Activated 🧠' : 'DeepThink Deactivated', 'info');
        }
        // Update UI
        const dtBtn = document.getElementById('deepThinkOption');
        if (dtBtn) dtBtn.classList.toggle('selected', this.deepThinkMode);

        // If enabling Deep Think, disable Image Gen
        if (this.deepThinkMode && window.imageGenMode) {
            window.imageGenMode = false;
            const igBtn = document.getElementById('imgGenOption');
            if (igBtn) igBtn.classList.remove('selected');
            const activeImgGen = document.getElementById('activeImgGen');
            if (activeImgGen) activeImgGen.style.display = 'none';
            document.getElementById('messageInput').placeholder = 'What do you want to know?';
        }

        // Update active mode tag
        const activeDeepThink = document.getElementById('activeDeepThink');
        if (activeDeepThink) activeDeepThink.style.display = this.deepThinkMode ? 'flex' : 'none';

        // Update active mode container
        const activeModeContainer = document.getElementById('activeModeContainer');
        if (activeModeContainer) activeModeContainer.style.display = (this.deepThinkMode || window.imageGenMode) ? 'flex' : 'none';

        // Visual feedback on main button
        const mainBtn = document.getElementById('modeDropdownBtn');
        if (mainBtn && this.deepThinkMode) {
            mainBtn.innerHTML = '<i class="fas fa-brain"></i>';
            mainBtn.style.color = '#8b5cf6';
        } else if (mainBtn && !window.imageGenMode) {
            mainBtn.innerHTML = '<i class="fas fa-plus"></i>';
            mainBtn.style.color = '';
        }
    }

    toggleImageGen() {
        window.imageGenMode = !window.imageGenMode;
        if (typeof showNotification === 'function') {
            showNotification(window.imageGenMode ? 'Image Generation Mode On 🎨' : 'Image Generation Mode Off', 'info');
        }
        // Update UI
        const igBtn = document.getElementById('imgGenOption');
        if (igBtn) igBtn.classList.toggle('selected', window.imageGenMode);

        // If enabling Image Gen, disable Deep Think
        if (window.imageGenMode && this.deepThinkMode) {
            this.deepThinkMode = false;
            const dtBtn = document.getElementById('deepThinkOption');
            if (dtBtn) dtBtn.classList.remove('selected');
            const activeDeepThink = document.getElementById('activeDeepThink');
            if (activeDeepThink) activeDeepThink.style.display = 'none';
        }

        // Update placeholder
        const messageInput = document.getElementById('messageInput');
        if (window.imageGenMode) {
            messageInput.placeholder = 'Describe the image you want to generate...';
        } else {
            messageInput.placeholder = 'What do you want to know?';
        }

        // Update active mode tag
        const activeImgGen = document.getElementById('activeImgGen');
        if (activeImgGen) activeImgGen.style.display = window.imageGenMode ? 'flex' : 'none';

        // Update active mode container
        const activeModeContainer = document.getElementById('activeModeContainer');
        if (activeModeContainer) activeModeContainer.style.display = (this.deepThinkMode || window.imageGenMode) ? 'flex' : 'none';

        // Update main button icon
        const mainBtn = document.getElementById('modeDropdownBtn');
        if (mainBtn) {
            if (window.imageGenMode) {
                mainBtn.innerHTML = '<i class="fas fa-image"></i>';
                mainBtn.style.color = '#8b5cf6';
            } else if (this.deepThinkMode) {
                mainBtn.innerHTML = '<i class="fas fa-brain"></i>';
                mainBtn.style.color = '#8b5cf6';
            } else {
                mainBtn.innerHTML = '<i class="fas fa-plus"></i>';
                mainBtn.style.color = '';
            }
        }
    }

    renderChatList(chats) {
        if (!this.chatListContainer) return;
        this.chatListContainer.innerHTML = '';

        if (chats.length === 0) {
            this.chatListContainer.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:0.8rem; text-align:center;">No chats yet</div>';
            return;
        }

        chats.forEach(chat => {
            const item = document.createElement('div');
            item.className = `chat-item ${chat.id === this.chatId ? 'active' : ''}`;
            item.onclick = () => this.loadChat(chat.id);

            item.innerHTML = `
                <i class="far fa-message"></i>
                <span class="chat-title">${this.escapeHtml(chat.title)}</span>
                <button class="delete-chat-btn" onclick="drakon.deleteChat(event, '${chat.id}')">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            this.chatListContainer.appendChild(item);
        });
    }

    async loadChat(chatId) {
        if (this.chatId === chatId) return;

        this.chatId = chatId;
        this.chatMessages.innerHTML = '';
        this.conversationStarted = true;
        this.hideWelcomeScreen();

        this.loadChatList();
        this.closeSidebar();

        let loadingMsg = null;
        try {
            loadingMsg = this.addLoadingMessage();
            const response = await fetch(`/api/chat/${chatId}`);

            if (response.ok) {
                const messages = await response.json();
                console.log(`Loaded ${messages.length} messages for chat ${chatId}`);

                if (loadingMsg) this.removeMessage(loadingMsg);

                if (messages.length === 0) {
                    this.chatMessages.innerHTML = `
                        <div class="empty-chat-state" style="text-align:center; padding: 40px; color: var(--text-secondary);">
                            <i class="fas fa-comment-slash" style="font-size: 2em; margin-bottom: 10px;"></i>
                            <p>No messages here yet. Start the conversation!</p>
                        </div>
                    `;
                    return;
                }

                messages.forEach(msg => {
                    try {
                        if (msg.role === 'user') {
                            this.addUserMessage(msg.content);
                        } else if (msg.role === 'assistant') {
                            this.addAssistantMessage(msg.content);
                        }
                    } catch (err) {
                        console.error('Error rendering message:', err, msg);
                    }
                });
            } else {
                console.error('Failed to load chat:', response.status);
                if (loadingMsg) this.removeMessage(loadingMsg);
                showNotification('Failed to load chat history', 'error');
            }
        } catch (error) {
            if (loadingMsg) this.removeMessage(loadingMsg);
            console.error('Load chat error:', error);
            showNotification('Error loading chat', 'error');
        }
    }

    startNewChat() {
        this.chatId = null;
        this.chatMessages.innerHTML = '';
        this.showWelcomeScreen();
        this.conversationStarted = false;

        const items = this.chatListContainer.querySelectorAll('.chat-item');
        items.forEach(i => i.classList.remove('active'));

        this.closeSidebar();
        if (this.messageInput) this.messageInput.focus();
    }

    deleteChat(event, chatId) {
        if (event) event.stopPropagation();

        // Get chat title for the popup
        const chatItem = event?.target?.closest('.chat-item');
        const chatTitle = chatItem?.querySelector('.chat-title')?.textContent || 'this chat';

        // Show custom confirmation popup
        this.showDeleteConfirm(chatTitle, async () => {
            try {
                const response = await fetch(`/api/chat/${chatId}`, { method: 'DELETE' });
                if (response.ok) {
                    if (this.chatId === chatId) {
                        this.startNewChat();
                    }
                    this.loadChatList();
                    showNotification('Chat deleted', 'success');
                } else {
                    showNotification('Failed to delete chat', 'error');
                }
            } catch (error) {
                console.error('Delete error:', error);
            }
        });
    }

    showDeleteConfirm(chatTitle, onConfirm) {
        // Remove any existing popup
        const existing = document.getElementById('deleteConfirmModal');
        if (existing) existing.remove();

        // Truncate long titles
        const displayTitle = chatTitle.length > 30 ? chatTitle.substring(0, 28) + '...' : chatTitle;

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'deleteConfirmModal';
        modal.className = 'delete-confirm-overlay';
        modal.innerHTML = `
            <div class="delete-confirm-box">
                <div class="delete-confirm-icon">
                    <i class="fas fa-trash-alt"></i>
                </div>
                <h3 class="delete-confirm-title">Delete Chat</h3>
                <p class="delete-confirm-text">Are you sure you want to delete<br><strong>"${displayTitle}"</strong>?</p>
                <p class="delete-confirm-subtext">This action cannot be undone.</p>
                <div class="delete-confirm-actions">
                    <button class="delete-confirm-btn cancel" id="deleteCancel">Cancel</button>
                    <button class="delete-confirm-btn confirm" id="deleteConfirm">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Animate in
        requestAnimationFrame(() => modal.classList.add('active'));

        // Button handlers
        const closeModal = () => {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 200);
        };

        document.getElementById('deleteCancel').onclick = closeModal;
        document.getElementById('deleteConfirm').onclick = () => {
            closeModal();
            onConfirm();
        };

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        // Close on Escape key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    async sendMessage(message = null) {
        // If currently generating, stop it
        if (this.isLoading) {
            this.stopGeneration();
            return;
        }

        // Check if the current model is disabled (e.g. Hushiyar is missing)
        if (this.modelsList) {
            const currentModel = this.modelsList.find(m => m.id === this.selectedModel);
            if (currentModel && currentModel.disabled) {
                const hushiyarModal = document.getElementById('hushiyarModal');
                if (currentModel.disabledReason && currentModel.disabledReason.includes('Hushiyar') && hushiyarModal) {
                    hushiyarModal.classList.add('active');
                } else if (typeof showNotification === 'function') {
                    showNotification(currentModel.disabledReason || 'This model is currently unavailable', 'error');
                }
                return;
            }
        }

        const text = message || this.messageInput.value.trim();
        if (!text) return;

        try {

            this.isLoading = true;
            this.updateSendButtonState(true); // Switch to stop button
            this.messageStartTime = performance.now();

            // Hide welcome screen on first message
            if (!this.conversationStarted) {
                this.hideWelcomeScreen();
                this.conversationStarted = true;
            }

            // Add user message
            this.addUserMessage(text);

            // Clear input
            if (!message && this.messageInput) {
                this.messageInput.value = '';
                this.autoResize(this.messageInput);
            }

            // Add placeholder for assistant message
            const aiMessageId = 'assistant-msg-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

            // Create new chat context if null
            if (!this.chatId) {
                // If we have files, we might want to create the chat FIRST with a simple title
                // For now, let's keep the existing logic but handle files in the next step
                const createRes = await fetch('/api/chat/new', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: text.substring(0, 30) + (text.length > 30 ? '...' : '') })
                });
                if (createRes.ok) {
                    const data = await createRes.json();
                    this.chatId = data.id;
                    this.loadChatList();
                }
            }

            // Check if we have files to send
            if (this.selectedFiles && this.selectedFiles.length > 0) {
                this.prepareAssistantMessage(aiMessageId);

                const formData = new FormData();
                formData.append('message', text);
                formData.append('chat_id', this.chatId);
                formData.append('model', this.selectedModel);
                // formData.append('user_id', ...); // Session handles this usually, but good to be safe if needed

                this.selectedFiles.forEach(file => {
                    formData.append('files', file);
                });

                // Clear files immediately from UI
                this.selectedFiles = [];
                this.renderFilePreview();

                // Send via fetch (no Content-Type header to let browser set boundary)
                await this.streamChatResponse(text, aiMessageId, formData);

            } else {
                // Check if image generation mode is enabled
                if (window.imageGenMode) {
                    this.prepareImageGenerationMessage(aiMessageId);
                    await this.generateImage(text, aiMessageId);
                } else {
                    this.prepareAssistantMessage(aiMessageId);
                    await this.streamChatResponse(text, aiMessageId);
                }
            }

        } catch (error) {
            console.error('Send message error:', error);
        } finally {
            this.isLoading = false;
            this.updateSendButtonState(false); // Switch back to send button
            this.abortController = null;
            if (this.messageInput) {
                this.messageInput.focus();
            }
        }
    }

    stopGeneration() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
            console.log('🛑 Generation stopped by user');
            showNotification('Generation stopped', 'info');
        }
        this.isLoading = false;
        this.updateSendButtonState(false);
    }

    updateSendButtonState(isLoading) {
        if (!this.sendBtn) return;
        const icon = this.sendBtn.querySelector('i');
        if (isLoading) {
            icon.className = 'fas fa-stop';
            this.sendBtn.title = 'Stop Generating';
            this.sendBtn.classList.add('btn-stop');
        } else {
            icon.className = 'fas fa-paper-plane';
            this.sendBtn.title = 'Send Message';
            this.sendBtn.classList.remove('btn-stop');
        }
    }

    async streamChatResponse(text, messageId, formData = null) {
        // Init AbortController
        this.abortController = new AbortController();

        try {
            // Send to API
            let options = {
                method: 'POST',
                signal: this.abortController.signal
            };

            if (formData) {
                options.body = formData;
            } else {
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify({
                    message: text,
                    chat_id: this.chatId,
                    model: this.selectedModel
                });
            }

            const response = await fetch('/chat', options);

            if (!response.ok) {
                console.log('Response not OK:', response.status);
                let errorMsg = `Error: ${response.status}`;
                try {
                    const errorData = await response.json();
                    console.log('Error Data:', errorData);
                    errorMsg = errorData.message || errorData.error || errorMsg;

                    // Check for limit reached
                    if (response.status === 403 || errorData.error === 'LIMIT_REACHED') {
                        // Try to show modal directly
                        if (typeof showLoginModal === 'function') {
                            showLoginModal();
                        } else if (typeof showNotification === 'function') {
                            showNotification(errorMsg || 'You have reached the free limit. Please login to continue.', 'error');
                        }

                        // Clean up the partial message if it was just created
                        const msgDiv = document.getElementById(messageId);
                        if (msgDiv) msgDiv.remove();
                        return;
                    }
                } catch (e) {
                    errorMsg = await response.text();
                }

                this.updateAssistantMessage(messageId, `⚠️ ${errorMsg}`);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedText = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                accumulatedText += chunk;
                this.updateAssistantMessage(messageId, accumulatedText);
                this.scrollToBottom(false); // Disable smooth scroll while streaming
            }

            // Final update
            this.updateAssistantMessage(messageId, accumulatedText, true);

            // Allow the DOM to update with syntax highlighting and action buttons before final scroll
            setTimeout(() => {
                this.scrollToBottom(true);
            }, 50);

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('🛑 Fetch aborted');
                // Optional: Add indicator that message was stopped
                const messageDiv = document.getElementById(messageId);
                if (messageDiv) {
                    const contentDiv = messageDiv.querySelector('.message-content');
                    contentDiv.innerHTML += ' <span style="color:var(--text-secondary); font-size:0.8em;">(Stopped)</span>';
                }
            } else {
                throw error; // Re-throw other errors
            }
        }
    }

    prepareImageGenerationMessage(messageId) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.id = messageId;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = `
            <div class="image-gen-loading">
                <div class="image-gen-spinner"></div>
                <span class="image-gen-text">🎨 Generating your image<span class="thinking-dots"></span></span>
            </div>
        `;

        messageDiv.appendChild(contentDiv);
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    async generateImage(prompt, messageId) {
        try {
            const response = await fetch('/generate-image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt: prompt })
            });

            const data = await response.json();
            const messageDiv = document.getElementById(messageId);
            if (!messageDiv) return;

            const contentDiv = messageDiv.querySelector('.message-content');

            if (data.success && data.image) {
                contentDiv.innerHTML = `
                    <div class="generated-image-container">
                        <img src="${data.image}" alt="${this.escapeHtml(prompt)}" class="generated-image" onclick="drakon.openImageFullscreen(this)"/>
                        <div class="image-caption">
                            <i class="fas fa-image"></i>
                            <span>${this.escapeHtml(prompt)}</span>
                        </div>
                        <div class="image-actions">
                            <button class="action-btn" onclick="drakon.downloadImage('${data.image}', 'drakon-image.png')" title="Download">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="action-btn" onclick="drakon.copyImageToClipboard('${data.image}')" title="Copy">
                                <i class="fas fa-copy"></i>
                            </button>
                        </div>
                    </div>
                `;
                showNotification('✨ Image generated successfully!', 'success');
            } else {
                contentDiv.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Failed to generate image: ${data.error || 'Unknown error'}</span>
                    </div>
                `;
                showNotification('❌ Image generation failed', 'error');
            }

            this.scrollToBottom();
        } catch (error) {
            console.error('Image generation error:', error);
            const messageDiv = document.getElementById(messageId);
            if (messageDiv) {
                const contentDiv = messageDiv.querySelector('.message-content');
                contentDiv.innerHTML = `
                    <div class="error-message">
                        <i class="fas fa-exclamation-circle"></i>
                        <span>Error: ${error.message}</span>
                    </div>
                `;
            }
            showNotification('❌ Image generation failed', 'error');
        }
    }

    downloadImage(dataUrl, filename) {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification('📥 Image downloaded!', 'success');
    }

    async copyImageToClipboard(dataUrl) {
        try {
            const response = await fetch(dataUrl);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
            showNotification('✅ Image copied to clipboard!', 'success');
        } catch (error) {
            console.error('Failed to copy image:', error);
            showNotification('❌ Failed to copy image', 'error');
        }
    }

    openImageFullscreen(img) {
        const overlay = document.createElement('div');
        overlay.className = 'image-fullscreen-overlay';
        overlay.innerHTML = `
            <img src="${img.src}" class="fullscreen-image"/>
            <button class="close-fullscreen"><i class="fas fa-times"></i></button>
        `;
        overlay.onclick = () => overlay.remove();
        document.body.appendChild(overlay);
    }

    prepareAssistantMessage(messageId) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.id = messageId;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        // Initial "Thinking..." state
        contentDiv.innerHTML = `
            <div class="thinking-container">
            <div class="thinking-header">
                <div class="loader">
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                </div>
                <span class="thinking-text" style="display:block; margin-top:10px;">Thinking<span class="thinking-dots"></span></span>
            </div>
        </div>
        `;

        // Actions container (hidden initially)
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.style.display = 'none';
        actionsDiv.innerHTML = this.getActionsHtml();

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(actionsDiv);
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    // Format AI response: convert star bullets to hyphens
    formatResponse(text) {
        // 1. Preserve code blocks from formatting changes
        const codeBlocks = [];
        text = text.replace(/```[\s\S]*?```/g, (match) => {
            codeBlocks.push(match);
            return `__CODEBLOCK_${codeBlocks.length - 1}__`;
        });

        // 2. Preserve inline code
        const inlineCode = [];
        text = text.replace(/`[^`]+`/g, (match) => {
            inlineCode.push(match);
            return `__INLINE_${inlineCode.length - 1}__`;
        });

        // 3. Convert star bullet lines ("* item") to hyphen bullets ("- item")
        text = text.replace(/^(\s*)\*\s+/gm, '$1- ');

        // 4. Restore inline code
        inlineCode.forEach((code, i) => {
            text = text.replace(`__INLINE_${i}__`, code);
        });

        // 5. Restore code blocks
        codeBlocks.forEach((block, i) => {
            text = text.replace(`__CODEBLOCK_${i}__`, block);
        });

        return text;
    }

    updateAssistantMessage(messageId, content, isFinal = false) {
        const messageDiv = document.getElementById(messageId);
        if (!messageDiv) return;

        const contentDiv = messageDiv.querySelector('.message-content');
        let actionsDiv = messageDiv.querySelector('.message-actions');

        // Pre-process DeepSeek <think> tags for cleaner UI
        let displayContent = content;
        const thinkStyle = 'background:rgba(255,255,255,0.05); border-left: 3px solid #666; padding: 10px; margin-bottom: 12px; border-radius: 4px; font-size: 0.9em; color: #aaa;';

        // Handle closed thinking blocks (completed)
        displayContent = displayContent.replace(/<think>([\s\S]*?)<\/think>/gi, (match, p1) => {
            return `<details style="${thinkStyle}"><summary style="cursor:pointer; font-weight:500; opacity:0.8;">💭 Thinking Process</summary><div style="margin-top:8px; white-space: pre-wrap;">${p1}</div></details>`;
        });

        // Handle open thinking blocks (streaming)
        if (displayContent.includes('<think>') && !displayContent.includes('</think>')) {
            displayContent = displayContent.replace(/<think>([\s\S]*)/gi, (match, p1) => {
                return `<div style="${thinkStyle}"><div style="font-weight:500; opacity:0.8; margin-bottom:5px;">💭 Thinking...</div><div style="white-space: pre-wrap;">${p1}</div></div>`;
            });
        }

        // Format: Remove stars/asterisks, use - for bullets
        displayContent = this.formatResponse(displayContent);

        // Parse markdown
        if (typeof marked !== 'undefined') {
            try {
                const parsed = marked.parse(displayContent);
                contentDiv.innerHTML = parsed;
            } catch (err) {
                console.error('❌ marked.parse() failed:', err);
                contentDiv.innerHTML = displayContent.replace(/\n/g, '<br>');
            }

            // OPTIMIZATION: Only run heavy syntax highlighting at the end!
            if (isFinal && typeof hljs !== 'undefined') {
                contentDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
            }
        } else {
            // Fallback: at least convert newlines to <br> tags
            contentDiv.innerHTML = content.replace(/\n/g, '<br>');
        }

        if (isFinal) {
            // Restore actions div if missing (safety check)
            if (!actionsDiv) {
                console.warn('⚠️ Actions div missing, restoring...');
                actionsDiv = document.createElement('div');
                actionsDiv.className = 'message-actions';
                actionsDiv.innerHTML = this.getActionsHtml();
                messageDiv.appendChild(actionsDiv);
            }

            if (actionsDiv) {
                actionsDiv.style.display = 'flex';
            }
            this.addCopyButtons(contentDiv);
        }
    }

    getActionsHtml() {
        return `
            <button class="action-btn" onclick="drakon.regenerateResponse()" title="Regenerate">
                <i class="fas fa-rotate"></i>
            </button>
            <button class="action-btn" onclick="drakon.copyMessage(this)" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
            <button class="action-btn" onclick="drakon.downloadMessage(this)" title="Download">
                <i class="fas fa-download"></i>
            </button>
            <button class="action-btn" onclick="drakon.likeMessage(this)" title="Good response">
                <i class="far fa-thumbs-up"></i>
            </button>
            <button class="action-btn" onclick="drakon.dislikeMessage(this)" title="Bad response">
                <i class="far fa-thumbs-down"></i>
            </button>
            <button class="action-btn" title="More options">
                <i class="fas fa-ellipsis"></i>
            </button>
        `;
    }

    addLoadingMessage() {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-loading';
        messageDiv.id = 'loading-msg-' + Date.now();
        messageDiv.innerHTML = `
            <div class="message-content">
                <div class="loader">
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                    <div class="loader-square"></div>
                </div>
            </div>
        `;
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
        return messageDiv;
    }

    removeMessage(messageDiv) {
        if (messageDiv && messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }

    addUserMessage(content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-user';
        messageDiv.id = 'msg-' + Date.now();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions user-message-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn" onclick="drakon.editUserMessage(this)" title="Edit and Resubmit">
                <i class="fas fa-edit"></i>
            </button>
            <button class="action-btn" onclick="drakon.copyUserMessage(this)" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
        `;

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(actionsDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    copyUserMessage(btn) {
        const messageDiv = btn.closest('.message');
        const contentDiv = messageDiv.querySelector('.message-content');
        const text = contentDiv.textContent;

        this.copyToClipboard(text).then(() => {
            const icon = btn.querySelector('i');
            icon.className = 'fas fa-check';
            icon.style.color = 'var(--success)';
            setTimeout(() => {
                icon.className = 'fas fa-copy';
                icon.style.color = '';
            }, 2000);
            showNotification('Prompt copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showNotification('Failed to copy text', 'error');
        });
    }

    editUserMessage(btn) {
        const messageDiv = btn.closest('.message');
        const contentDiv = messageDiv.querySelector('.message-content');
        const text = contentDiv.textContent;

        const input = document.getElementById('messageInput');
        if (input) {
            input.value = text;
            input.focus();
            autoResize(input);
            // Optional: provide feedback
            showNotification('Prompt ready to edit', 'info');
        }
    }

    addAssistantMessage(content, responseTime = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message message-assistant';
        messageDiv.id = 'msg-' + Date.now();

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Format and parse markdown
        const cleanContent = this.formatResponse(content);
        if (typeof marked !== 'undefined') {
            try {
                contentDiv.innerHTML = marked.parse(cleanContent);

                // Apply syntax highlighting
                if (typeof hljs !== 'undefined') {
                    contentDiv.querySelectorAll('pre code').forEach(block => {
                        hljs.highlightElement(block);
                    });
                }
            } catch (err) {
                console.error('❌ marked.parse() failed in addAssistantMessage:', err);
                contentDiv.innerHTML = cleanContent.replace(/\n/g, '<br>');
            }
        } else {
            // Fallback: at least convert newlines to <br> tags
            contentDiv.innerHTML = cleanContent.replace(/\n/g, '<br>');
        }

        // Create action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn" onclick="drakon.regenerateResponse()" title="Regenerate">
                <i class="fas fa-rotate"></i>
            </button>
            <button class="action-btn" onclick="drakon.copyMessage(this)" title="Copy">
                <i class="fas fa-copy"></i>
            </button>
            <button class="action-btn" onclick="drakon.downloadMessage(this)" title="Download">
                <i class="fas fa-download"></i>
            </button>
            <button class="action-btn" onclick="drakon.likeMessage(this)" title="Good response">
                <i class="far fa-thumbs-up"></i>
            </button>
            <button class="action-btn" onclick="drakon.dislikeMessage(this)" title="Bad response">
                <i class="far fa-thumbs-down"></i>
            </button>
            <button class="action-btn" title="More options">
                <i class="fas fa-ellipsis"></i>
            </button>
            ${responseTime ? `<span class="response-time">${responseTime}s</span>` : ''}
        `;

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(actionsDiv);

        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        // Add copy buttons to code blocks
        setTimeout(() => this.addCopyButtons(contentDiv), 100);
    }

    addLoadingMessage() {
        const loadingDiv = document.createElement('div');
        const loadingId = 'loading-' + Date.now();
        loadingDiv.id = loadingId;
        loadingDiv.className = 'message message-assistant';

        loadingDiv.innerHTML = `
            < div class="message-content loading" >
                <span>Thinking</span>
                <div class="loading-dots">
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                    <div class="loading-dot"></div>
                </div>
            </div >
            `;

        this.chatMessages.appendChild(loadingDiv);
        this.scrollToBottom();

        return loadingId;
    }

    removeMessage(messageId) {
        const element = document.getElementById(messageId);
        if (element) {
            element.remove();
        }
    }

    toggleSidebar() {
        if (this.sidebar) this.sidebar.classList.toggle('active');
        if (this.sidebarOverlay) this.sidebarOverlay.classList.toggle('active');
    }

    closeSidebar() {
        if (this.sidebar) this.sidebar.classList.remove('active');
        if (this.sidebarOverlay) this.sidebarOverlay.classList.remove('active');
    }

    // Action button handlers
    regenerateResponse() {
        showNotification('🔄 Regenerate coming soon!', 'info');
    }

    async copyToClipboard(text) {
        // Try Clipboard API first (secure context)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('Clipboard API failed, trying fallback', err);
            }
        }

        // Fallback to execCommand (insecure context)
        return new Promise((resolve, reject) => {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.opacity = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (successful) resolve(true);
                else reject(new Error('Copy command failed'));
            } catch (err) {
                document.body.removeChild(textArea);
                reject(err);
            }
        });
    }

    copyMessage(button) {
        const messageContent = button.closest('.message').querySelector('.message-content');
        const text = messageContent.textContent || messageContent.innerText;

        this.copyToClipboard(text).then(() => {
            showNotification('✅ Copied to clipboard!', 'success');
            button.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                button.innerHTML = '<i class="fas fa-copy"></i>';
            }, 2000);
        }).catch((err) => {
            console.error('Copy failed:', err);
            showNotification('❌ Failed to copy', 'error');
        });
    }

    copyCode(button) {
        const card = button.closest('.code-card');
        const codeBlock = card.querySelector('code');
        const text = codeBlock.innerText || codeBlock.textContent;

        this.copyToClipboard(text).then(() => {
            button.innerHTML = '<i class="fas fa-check"></i> Copied';
            showNotification('✅ Code copied!', 'success');
            setTimeout(() => {
                button.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
        }).catch((err) => {
            console.error('Copy failed:', err);
            showNotification('❌ Failed to copy', 'error');
        });
    }

    downloadMessage(button) {
        const messageContent = button.closest('.message').querySelector('.message-content');
        const text = messageContent.textContent || messageContent.innerText;

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'drakon-response.txt';
        a.click();
        URL.revokeObjectURL(url);

        showNotification('📥 Downloaded!', 'success');
    }

    likeMessage(button) {
        button.classList.toggle('active');
        if (button.classList.contains('active')) {
            button.innerHTML = '<i class="fas fa-thumbs-up"></i>';
            button.style.color = '#22c55e';
            showNotification('👍 Thanks for the feedback!', 'success');
        } else {
            button.innerHTML = '<i class="far fa-thumbs-up"></i>';
            button.style.color = '';
        }
    }

    dislikeMessage(button) {
        button.classList.toggle('active');
        if (button.classList.contains('active')) {
            button.innerHTML = '<i class="fas fa-thumbs-down"></i>';
            button.style.color = '#ef4444';
            showNotification('📝 We\'ll improve!', 'info');
        } else {
            button.innerHTML = '<i class="far fa-thumbs-down"></i>';
            button.style.color = '';
        }
    }

    addCopyButtons(container) {
        container.querySelectorAll('pre').forEach(pre => {
            if (pre.querySelector('.copy-btn')) return;

            const codeBlock = pre.querySelector('code');
            if (!codeBlock) return;

            const copyBtn = document.createElement('button');
            copyBtn.className = 'copy-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.title = 'Copy code';

            copyBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const code = codeBlock.textContent || codeBlock.innerText;
                this.copyToClipboard(code).then(() => {
                    copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                    showNotification('✅ Code copied!', 'success');
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                    }, 2000);
                }).catch((err) => {
                    console.error('Copy code failed:', err);
                    showNotification('❌ Failed to copy', 'error');
                });
            };

            pre.style.position = 'relative';
            pre.appendChild(copyBtn);
        });
    }

    scrollToBottom(smooth = true) {
        if (!this.chatMessages) return;

        // Use requestAnimationFrame to ensure the DOM has fully rendered the new text
        // before we calculate the new scrollHeight
        requestAnimationFrame(() => {
            const maxScroll = this.chatMessages.scrollHeight + 100; // Extra padding just in case

            if (smooth) {
                this.chatMessages.scrollTo({
                    top: maxScroll,
                    behavior: 'smooth'
                });
            } else {
                // Instant snap for streaming
                this.chatMessages.scrollTop = maxScroll;
            }
        });
    }

    hideWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'none';
        }
    }

    showWelcomeScreen() {
        if (this.welcomeScreen) {
            this.welcomeScreen.style.display = 'flex';
        }
    }

    setupAutoResize() {
        if (this.messageInput) {
            this.messageInput.addEventListener('input', () => {
                this.autoResize(this.messageInput);
            });
        }
    }

    autoResize(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }

    handleKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    async resetConversation() {
        try {
            const response = await fetch('/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                // Remove all messages
                const messages = this.chatMessages.querySelectorAll('.message');
                messages.forEach(msg => msg.remove());

                // Show welcome screen
                this.showWelcomeScreen();
                this.conversationStarted = false;

                showNotification('🔄 New chat!', 'success');
            }
        } catch (error) {
            console.error('Reset error:', error);
            showNotification('❌ Failed to reset', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== FILE HANDLING ====================

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // Add to selected files (prevent duplicates if needed, but allow for now)
        this.selectedFiles = [...this.selectedFiles, ...files];

        // Render preview
        this.renderFilePreview();

        // Reset input for same file selection
        this.fileInput.value = '';

        // Focus input
        this.messageInput.focus();
    }

    renderFilePreview() {
        if (!this.filePreviewArea) return;

        this.filePreviewArea.innerHTML = '';

        if (this.selectedFiles.length === 0) {
            this.filePreviewArea.style.display = 'none';
            return;
        }

        this.filePreviewArea.style.display = 'flex';

        this.selectedFiles.forEach((file, index) => {
            const fileChip = document.createElement('div');
            fileChip.className = 'file-chip';

            let iconClass = 'fa-file';
            let bgClass = 'file-icon-default';
            let fileType = 'FILE';
            let isImage = false;

            if (file.name.endsWith('.pdf')) {
                iconClass = 'fa-file-pdf';
                bgClass = 'file-icon-pdf';
                fileType = 'PDF';
            }
            else if (file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                iconClass = 'fa-image';
                bgClass = 'file-icon-image';
                fileType = 'IMAGE';
                isImage = true;
            }
            else if (file.name.match(/\.(py|js|html|css|json|md|txt)$/i)) {
                iconClass = 'fa-file-code';
                bgClass = 'file-icon-code';
                fileType = 'CODE';
            }

            // Thumbnail for images
            let iconHtml = `<i class="fas ${iconClass}"></i>`;
            if (isImage) {
                const url = URL.createObjectURL(file);
                iconHtml = `<div style="width:100%; height:100%; background-image: url('${url}'); background-size: cover; background-position: center; border-radius: 8px;"></div>`;
            }

            fileChip.innerHTML = `
                <div class="file-icon-container ${bgClass}">
                    ${iconHtml}
                </div>
                <div class="file-info">
                    <span class="file-name">${file.name}</span>
                    <span class="file-meta">${fileType}</span>
                </div>
                <button class="remove-file" onclick="drakon.removeFile(${index})">
                    <i class="fas fa-times"></i>
                </button>
            `;

            this.filePreviewArea.appendChild(fileChip);
        });
    }

    removeFile(index) {
        this.selectedFiles.splice(index, 1);
        this.renderFilePreview();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// ==================== GLOBAL FUNCTIONS ====================

let drakon;

document.addEventListener('DOMContentLoaded', () => {
    drakon = new DrakonInterface();
});

// Global function wrappers
function sendMessage() {
    if (drakon) drakon.sendMessage();
}

function handleKeyPress(event) {
    if (drakon) drakon.handleKeyPress(event);
}

function autoResize(textarea) {
    if (drakon) drakon.autoResize(textarea);
}

function resetConversation() {
    if (drakon) drakon.startNewChat();
}

function sendQuickPrompt(prompt) {
    if (drakon) drakon.sendMessage(prompt);
}

// ==================== NOTIFICATION SYSTEM ====================

function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();

    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification - toast ${type} `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Animate in
    setTimeout(() => notification.classList.add('visible'), 10);

    // Auto remove
    setTimeout(() => {
        notification.classList.remove('visible');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}



// ==================== COPY TO CLIPBOARD ====================

function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('✅ Copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showNotification('✅ Copied to clipboard!', 'success');
    } catch (err) {
        showNotification('❌ Copy failed', 'error');
    }

    document.body.removeChild(textarea);
}

// Export for global access
window.copyToClipboard = copyToClipboard;
window.showNotification = showNotification;

// ==================== SIDEBAR FUNCTIONS ====================

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const openBtn = document.getElementById('sidebarOpenBtn');
    const inputArea = document.querySelector('.input-area');

    // Check if we're on mobile (sidebar uses 'active' to show)
    if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
    } else {
        // Desktop: toggle 'collapsed' class to hide/show
        if (sidebar) {
            const isCurrentlyCollapsed = sidebar.classList.contains('collapsed');

            if (isCurrentlyCollapsed) {
                // Open the sidebar
                sidebar.classList.remove('collapsed');
                if (openBtn) openBtn.style.display = 'none';
                if (inputArea) inputArea.style.left = '260px';
            } else {
                // Close the sidebar
                sidebar.classList.add('collapsed');
                if (openBtn) openBtn.style.display = 'flex';
                if (inputArea) inputArea.style.left = '0';
            }
        }
    }
}

// Initialize sidebar state on page load
document.addEventListener('DOMContentLoaded', function () {
    const sidebar = document.getElementById('sidebar');
    const openBtn = document.getElementById('sidebarOpenBtn');

    // Ensure button visibility matches sidebar state
    if (sidebar && openBtn) {
        const isCollapsed = sidebar.classList.contains('collapsed');
        openBtn.style.display = isCollapsed ? 'flex' : 'none';
    }
});

function startNewChat() {
    if (drakon) drakon.startNewChat();
}

function searchChats() {
    const chatListContainer = document.getElementById('chatList');
    const sidebarSection = document.querySelector('.sidebar-section');

    // Check if search input already exists
    let searchInput = document.getElementById('chatSearchInput');

    if (searchInput) {
        // If search is already showing, focus it
        searchInput.focus();
        return;
    }

    // Create search input
    searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'chatSearchInput';
    searchInput.placeholder = 'Search chats...';
    searchInput.className = 'chat-search-input';
    searchInput.style.cssText = `
        width: 100%;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #fff;
        font-size: 0.875rem;
        margin-bottom: 8px;
        outline: none;
    `;

    // Insert before chat list
    if (sidebarSection && chatListContainer) {
        sidebarSection.insertBefore(searchInput, chatListContainer);
        searchInput.focus();

        // Filter chats on input
        searchInput.addEventListener('input', function () {
            const query = this.value.toLowerCase();
            const chatItems = chatListContainer.querySelectorAll('.chat-item');

            chatItems.forEach(item => {
                const title = item.querySelector('.chat-title');
                if (title) {
                    const text = title.textContent.toLowerCase();
                    item.style.display = text.includes(query) ? 'flex' : 'none';
                }
            });
        });

        // Remove search on blur if empty
        searchInput.addEventListener('blur', function () {
            if (!this.value) {
                setTimeout(() => {
                    this.remove();
                    // Show all chats again
                    const chatItems = chatListContainer.querySelectorAll('.chat-item');
                    chatItems.forEach(item => item.style.display = 'flex');
                }, 200);
            }
        });

        // Remove on Escape
        searchInput.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                this.value = '';
                this.blur();
            }
        });
    }
}

function openImagesMode() {
    // Toggle image generation mode
    window.imageGenMode = !window.imageGenMode;
    const imgGenOption = document.getElementById('imgGenOption');
    const activeImgGen = document.getElementById('activeImgGen');
    const activeModeContainer = document.getElementById('activeModeContainer');
    const messageInput = document.getElementById('messageInput');

    if (imgGenOption) imgGenOption.classList.toggle('selected', window.imageGenMode);
    if (activeImgGen) activeImgGen.style.display = window.imageGenMode ? 'flex' : 'none';
    if (activeModeContainer) activeModeContainer.style.display = window.imageGenMode ? 'flex' : 'none';

    if (messageInput) {
        messageInput.placeholder = window.imageGenMode
            ? 'Describe the image you want to generate...'
            : 'How can DRAKON help?';
        messageInput.focus();
    }

    showNotification(window.imageGenMode ? '🎨 Image mode enabled!' : '💬 Chat mode enabled', 'success');
}

// Wire up the Images nav item
document.addEventListener('DOMContentLoaded', function () {
    const imagesNavItem = document.getElementById('imagesNavItem');
    if (imagesNavItem) {
        imagesNavItem.addEventListener('click', function (e) {
            e.preventDefault();
            openImagesMode();
        });
    }
});

window.toggleSidebar = toggleSidebar;
window.startNewChat = startNewChat;
window.searchChats = searchChats;
window.openImagesMode = openImagesMode;