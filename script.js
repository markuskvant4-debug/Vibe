// Основной объект приложения Vibe
const VibeApp = {
    // Текущий пользователь
    currentUser: null,
    
    // Пользователь, чей профиль просматривается
    viewingUserId: null,
    
    // Состояние звонка
    callTimerInterval: null,
    callStartTime: null,
    callMuted: false,
    callVideoOff: false,
    callActive: false,
    
    // Выбранный пользователь в чате
    selectedChatUser: null,
    
    // Текущая активная страница
    currentPage: null,
    
    // Интервал опроса сообщений чата
    chatPollInterval: null,
    
    // Файлы для отправки в чате
    selectedFiles: [],
    
    // Видимость эмодзи-пикера
    emojiPickerVisible: false,
    
    // Инициализация приложения
    init: function() {
        console.log('Инициализация социальной сети Vibe...');
        
        // Проверяем, есть ли сохраненный пользователь в localStorage
        this.loadUserFromStorage();
        
        // Назначаем обработчики событий
        this.bindEvents();
        
        // Загружаем посты
        this.loadPosts();
        
        // Обновляем статистику
        this.updateStats();
        
        // Обновляем интерфейс в зависимости от авторизации
        this.updateUI();
        
        // Применяем сохраненную тему
        this.applyTheme();
    },
    
    // Загрузка пользователя из localStorage
    loadUserFromStorage: function() {
        const savedUser = localStorage.getItem('vibe_user');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                console.log('Пользователь загружен из localStorage:', this.currentUser.username);
            } catch (e) {
                console.error('Ошибка при загрузке пользователя:', e);
                localStorage.removeItem('vibe_user');
            }
        }
    },
    
    // Сохранение пользователя в localStorage
    saveUserToStorage: function(user) {
        if (user) {
            localStorage.setItem('vibe_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('vibe_user');
        }
    },
    
    // Назначение обработчиков событий
    bindEvents: function() {
        // Кнопки авторизации
        document.getElementById('login-btn').addEventListener('click', () => this.showLoginForm());
        document.getElementById('register-btn').addEventListener('click', () => this.showRegisterForm());
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        
        // Кнопки отмены форм
        document.getElementById('cancel-login').addEventListener('click', () => this.hideAuthForms());
        document.getElementById('cancel-register').addEventListener('click', () => this.hideAuthForms());
        document.getElementById('cancel-post').addEventListener('click', () => this.hideCreatePostForm());
        
        // Формы
        document.getElementById('login-form-element').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('register-form-element').addEventListener('submit', (e) => this.handleRegister(e));
        document.getElementById('post-form').addEventListener('submit', (e) => this.handleCreatePost(e));
        
        // Обработка выбора файлов для поста
        document.getElementById('post-files').addEventListener('change', (e) => this.handlePostFilesSelect(e));
        
        // Кнопка создания поста (дублирующая навигацию, но для гарантии)
        document.getElementById('create-post-btn').addEventListener('click', () => this.showCreatePostForm());
        
        // Обновление ленты
        document.getElementById('refresh-feed').addEventListener('click', () => this.loadPosts());
        
        // Сортировка
        document.getElementById('sort-posts').addEventListener('change', () => this.loadPosts());
        
        // Закрытие модального окна
        document.querySelector('.close-modal').addEventListener('click', () => this.hideVideoModal());
        document.getElementById('media-modal').addEventListener('click', (e) => {
            if (e.target.id === 'media-modal') this.hideVideoModal();
        });

        // Навигация по страницам
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.dataset.page;
                this.showPage(page);
            });
        });

        // Мобильная навигация по страницам
        document.querySelectorAll('.mobile-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = e.currentTarget.dataset.page;
                this.showPage(page);
            });
        });

        // Форма профиля
        document.getElementById('profile-form').addEventListener('submit', (e) => this.handleProfileUpdate(e));
        // Форма настроек
        document.getElementById('settings-form').addEventListener('submit', (e) => this.handleSettingsSubmit(e));
        
        // Чат
        document.getElementById('chat-search-btn').addEventListener('click', () => this.searchChatUsers());
        document.getElementById('chat-search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.searchChatUsers();
        });

        // Звонки (делегирование событий)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.fa-phone')) {
                const userItem = e.target.closest('.chat-user-item');
                if (userItem) {
                    const userId = userItem.dataset.userId;
                    this.startCall(userId, 'audio');
                } else {
                    // Если кнопка в заголовке чата
                    const chatHeader = document.querySelector('.chat-header');
                    if (chatHeader) {
                        const userId = chatHeader.dataset.userId;
                        if (userId) this.startCall(userId, 'audio');
                    }
                }
            }
            if (e.target.closest('.fa-video')) {
                const userItem = e.target.closest('.chat-user-item');
                if (userItem) {
                    const userId = userItem.dataset.userId;
                    this.startCall(userId, 'video');
                } else {
                    const chatHeader = document.querySelector('.chat-header');
                    if (chatHeader) {
                        const userId = chatHeader.dataset.userId;
                        if (userId) this.startCall(userId, 'video');
                    }
                }
            }
        });

        // Закрытие звонка
        document.getElementById('close-call')?.addEventListener('click', () => this.endCall());
        document.getElementById('call-end')?.addEventListener('click', () => this.endCall());
        document.getElementById('call-mute')?.addEventListener('click', () => this.toggleMute());
        document.getElementById('call-video-toggle')?.addEventListener('click', () => this.toggleVideo());
        document.getElementById('chat-send-btn').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Кнопки отправки файлов и эмодзи
        document.getElementById('chat-attach-btn')?.addEventListener('click', () => this.openFileSelector());
        document.getElementById('chat-image-btn')?.addEventListener('click', () => this.openImageSelector());
        document.getElementById('chat-emoji-btn')?.addEventListener('click', () => this.toggleEmojiPicker());
        document.getElementById('chat-file-input')?.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Закрытие эмодзи-пикера при клике вне его
        document.addEventListener('click', (e) => {
            const picker = document.getElementById('emoji-picker');
            const emojiBtn = document.getElementById('chat-emoji-btn');
            if (picker && !picker.contains(e.target) && !emojiBtn?.contains(e.target)) {
                this.hideEmojiPicker();
            }
        });
    },
    
    // Показать форму входа
    showLoginForm: function() {
        this.hideAllForms();
        document.getElementById('login-form').classList.remove('hidden');
    },
    
    // Показать форму регистрации
    showRegisterForm: function() {
        this.hideAllForms();
        document.getElementById('register-form').classList.remove('hidden');
    },
    
    // Показать форму создания поста
    showCreatePostForm: function() {
        if (!this.currentUser) {
            alert('Для создания поста необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        // Показываем страницу ленты
        this.showPage('feed');
        // Скрываем другие формы (логин, регистрация)
        this.hideAllForms();
        // Показываем форму создания поста
        document.getElementById('create-post-form').classList.remove('hidden');
    },
    
    // Скрыть все формы
    hideAllForms: function() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.add('hidden');
        document.getElementById('create-post-form').classList.add('hidden');
    },
    
    // Скрыть формы авторизации
    hideAuthForms: function() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('register-form').classList.add('hidden');
    },
    
    // Скрыть форму создания поста
    hideCreatePostForm: function() {
        const form = document.getElementById('create-post-form');
        form.classList.add('hidden');
        
        // Очищаем форму
        document.getElementById('post-form').reset();
        
        // Очищаем предпросмотр файлов
        const filePreview = document.getElementById('file-preview');
        if (filePreview) filePreview.innerHTML = '';
        
        // Сбрасываем состояние редактирования
        const postForm = document.getElementById('post-form');
        delete postForm.dataset.editPostId;
        
        // Восстанавливаем заголовок и текст кнопки
        const title = form.querySelector('h2');
        if (title) title.textContent = 'Создать новый пост';
        const submitBtn = postForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Опубликовать';
    },
    
    // Обработка входа
    handleLogin: function(e) {
        e.preventDefault();
        
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        
        if (!username || !password) {
            alert('Заполните все поля');
            return;
        }
        
        this.apiRequest('/api/login', 'POST', { username, password })
            .then(data => {
                if (data.success) {
                    this.currentUser = data.user;
                    this.saveUserToStorage(this.currentUser);
                    this.updateUI();
                    this.hideAuthForms();
                    alert('Вход выполнен успешно!');
                    this.loadPosts();
                } else {
                    alert('Ошибка: ' + data.message);
                }
            })
            .catch(error => {
                console.error('Ошибка входа:', error);
                alert('Ошибка соединения с сервером');
            });
    },
    
    // Обработка регистрации
    handleRegister: function(e) {
        e.preventDefault();
        
        const username = document.getElementById('register-username').value.trim();
        const password = document.getElementById('register-password').value.trim();
        const confirmPassword = document.getElementById('register-confirm').value.trim();
        
        if (!username || !password || !confirmPassword) {
            alert('Заполните все поля');
            return;
        }
        
        if (password !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }
        
        if (password.length < 4) {
            alert('Пароль должен содержать минимум 4 символа');
            return;
        }
        
        this.apiRequest('/api/register', 'POST', { username, password })
            .then(data => {
                if (data.success) {
                    alert('Регистрация успешна! Теперь вы можете войти.');
                    this.showLoginForm();
                    // Автоматически заполняем форму входа
                    document.getElementById('login-username').value = username;
                    document.getElementById('login-password').value = password;
                } else {
                    alert('Ошибка: ' + data.message);
                }
            })
            .catch(error => {
                console.error('Ошибка регистрации:', error);
                alert('Ошибка соединения с сервером');
            });
    },
    
    // Выход из системы
    logout: function() {
        this.currentUser = null;
        this.saveUserToStorage(null);
        this.updateUI();
        alert('Вы вышли из системы');
    },
    
    // Обновление интерфейса в зависимости от авторизации
    updateUI: function() {
        const authSection = document.getElementById('auth-section');
        const userSection = document.getElementById('user-section');
        const statsBlock = document.querySelector('.stats');
        
        console.log('updateUI called, currentUser:', this.currentUser);
        console.log('statsBlock found:', !!statsBlock);
        
        if (this.currentUser) {
            authSection.classList.add('hidden');
            userSection.classList.remove('hidden');
            
            // Показываем статистику только для админа testadmin
            if (statsBlock) {
                if (this.currentUser.username === 'testadmin') {
                    console.log('User is admin, showing stats');
                    statsBlock.classList.remove('hidden');
                } else {
                    console.log('User is not admin, hiding stats');
                    statsBlock.classList.add('hidden');
                }
            }
        } else {
            authSection.classList.remove('hidden');
            userSection.classList.add('hidden');
            // Скрываем статистику для неавторизованных
            if (statsBlock) {
                console.log('No user, hiding stats');
                statsBlock.classList.add('hidden');
            }
        }
    },

    // Показать страницу
    showPage: function(page) {
        // Останавливаем опрос чата, если уходим со страницы чата
        if (this.currentPage === 'chat' && page !== 'chat') {
            this.stopChatPolling();
        }
        
        // Скрыть все страницы
        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        // Убрать активный класс у всех пунктов меню
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        // Убрать активный класс у всех мобильных пунктов меню
        document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
        // Активировать текущий пункт меню
        const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (activeNav) activeNav.classList.add('active');
        // Активировать текущий пункт мобильного меню
        const activeMobileNav = document.querySelector(`.mobile-nav-item[data-page="${page}"]`);
        if (activeMobileNav) activeMobileNav.classList.add('active');

        // Сохраняем текущую страницу
        this.currentPage = page;

        switch (page) {
            case 'feed':
                document.getElementById('page-feed').classList.remove('hidden');
                this.loadPosts();
                break;
            case 'popular':
                document.getElementById('page-feed').classList.remove('hidden');
                // В будущем можно добавить фильтрацию популярных постов
                this.loadPosts();
                break;
            case 'profile':
                if (!this.currentUser) {
                    alert('Для просмотра профиля необходимо войти в систему');
                    this.showLoginForm();
                    return;
                }
                document.getElementById('page-profile').classList.remove('hidden');
                const userIdToLoad = this.viewingUserId || this.currentUser.id;
                this.loadProfile(userIdToLoad);
                this.loadProfileStats(userIdToLoad);
                this.loadUserPosts(userIdToLoad);
                // Сбросить viewingUserId после загрузки, чтобы следующий раз загружался профиль текущего пользователя
                this.viewingUserId = null;
                break;
            case 'create-post':
                this.showCreatePostForm();
                break;
            case 'settings':
                document.getElementById('page-settings').classList.remove('hidden');
                this.loadSettings();
                break;
            case 'chat':
                if (!this.currentUser) {
                    alert('Для использования чата необходимо войти в систему');
                    this.showLoginForm();
                    return;
                }
                document.getElementById('page-chat').classList.remove('hidden');
                this.loadChatUsers();
                this.loadChatMessages();
                // Запускаем периодический опрос сообщений
                this.startChatPolling();
                break;
            default:
                document.getElementById('page-feed').classList.remove('hidden');
                this.loadPosts();
        }
    },

    // Загрузка профиля пользователя
    loadProfile: function(userId) {
        this.apiRequest(`/api/profile?user_id=${userId}`, 'GET')
            .then(data => {
                if (data.success) {
                    const user = data.user;
                    document.getElementById('profile-username').textContent = user.username;
                    document.getElementById('profile-bio').textContent = user.bio || '';
                    const avatar = document.getElementById('profile-avatar');
                    if (user.avatar) {
                        avatar.src = user.avatar;
                    } else {
                        avatar.src = '/uploads/default-avatar.jpg';
                    }
                    // Также обновляем поля формы редактирования
                    document.getElementById('profile-username-input').value = user.username;
                    document.getElementById('profile-bio-input').value = user.bio || '';
                }
            })
            .catch(error => console.error('Ошибка загрузки профиля:', error));
    },

    // Просмотр профиля другого пользователя
    viewUserProfile: function(userId) {
        this.viewingUserId = userId;
        this.showPage('profile');
    },

    // Загрузка статистики профиля
    loadProfileStats: function(userId) {
        this.apiRequest(`/api/profile/stats?user_id=${userId}`, 'GET')
            .then(data => {
                if (data.success) {
                    document.getElementById('profile-followers-count').textContent = data.stats.followers_count;
                    document.getElementById('profile-following-count').textContent = data.stats.following_count;
                    document.getElementById('profile-reposts-count').textContent = data.stats.reposts_count;
                    document.getElementById('profile-posts-count').textContent = data.stats.posts_count;
                    document.getElementById('profile-likes-count').textContent = data.stats.total_likes;
                }
            })
            .catch(error => console.error('Ошибка загрузки статистики:', error));
    },

    // Загрузка постов пользователя
    loadUserPosts: function(userId) {
        this.apiRequest(`/api/posts?author_id=${userId}`, 'GET')
            .then(data => {
                if (data.success) {
                    this.renderUserPosts(data.posts);
                }
            })
            .catch(error => console.error('Ошибка загрузки постов пользователя:', error));
    },

    // Отображение постов пользователя
    renderUserPosts: function(posts) {
        const container = document.getElementById('user-posts-container');
        if (posts.length === 0) {
            container.innerHTML = '<div class="loading-posts">У вас пока нет постов.</div>';
            return;
        }
        // Используем существующий метод renderPosts, но рендерим в отдельный контейнер
        const postsContainer = document.createElement('div');
        postsContainer.className = 'posts-container';
        container.innerHTML = '';
        container.appendChild(postsContainer);
        
        // Временно сохраняем оригинальный контейнер
        const originalContainer = document.getElementById('posts-container');
        const tempContainer = document.createElement('div');
        tempContainer.id = 'temp-posts-container';
        document.body.appendChild(tempContainer);
        
        // Используем renderPosts, но с подменой контейнера
        const originalMethod = this.renderPosts;
        this.renderPosts = function(posts) {
            let postsHTML = '';
            posts.forEach(post => {
                const postDate = new Date(post.created_at).toLocaleString('ru-RU');
                const hasVideo = post.video_url && post.video_url.trim() !== '';
                const avatarLetter = post.author ? post.author.charAt(0).toUpperCase() : 'U';
                const likes = post.likes || 0;
                const likesText = likes === 1 ? '1 лайк' : `${likes} лайков`;
                const comments = post.comments || [];
                const commentsText = comments.length === 1 ? '1 комментарий' : `${comments.length} комментариев`;
                
                // Проверяем верификацию пользователя
                const isVerified = post.author_verified || false;
                const verifiedBadge = isVerified ? '<i class="fas fa-check-circle verified-badge" title="Проверенный аккаунт"></i>' : '';
                
                postsHTML += `
                    <div class="post-card" data-post-id="${post.id}">
                        <div class="post-header">
                            <div class="post-author">
                                <div class="author-avatar">${avatarLetter}</div>
                                <div>
                                    <div class="author-name">${post.author || 'Аноним'} ${verifiedBadge}</div>
                                    <div class="post-date">${postDate}</div>
                                </div>
                            </div>
                            ${post.author_id === this.currentUser?.id ? `
                                <div class="post-owner-actions">
                                    <button class="btn btn-icon btn-small edit-post-btn" data-post-id="${post.id}" title="Редактировать">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-icon btn-small delete-post-btn" data-post-id="${post.id}" title="Удалить">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                        
                        <h3 class="post-title">${this.escapeHtml(post.title)}</h3>
                        <div class="post-content">${this.escapeHtml(post.content).replace(/\n/g, '<br>')}</div>
                        
                        ${hasVideo ? `
                            <div class="video-preview" data-video-url="${post.video_url}">
                                <div class="video-overlay">
                                    <i class="fas fa-play-circle"></i>
                                </div>
                                <div class="video-thumbnail" style="background: linear-gradient(90deg, #ff4757, #ff6b81); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                                    <i class="fas fa-video" style="font-size: 3rem;"></i>
                                    <div style="margin-left: 15px;">
                                        <div>Видео прикреплено</div>
                                        <div style="font-size: 0.9rem; margin-top: 5px;">Нажмите для просмотра</div>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${post.files && post.files.length > 0 ? this.renderPostFiles(post.files) : ''}
                        
                        <div class="post-actions">
                            <button class="like-btn ${this.isPostLiked(post.id) ? 'liked' : ''}" data-post-id="${post.id}">
                                <i class="fas fa-heart"></i>
                                <span class="like-count">${likesText}</span>
                            </button>
                            <button class="comment-btn" data-post-id="${post.id}">
                                <i class="fas fa-comment"></i>
                                <span>${commentsText}</span>
                            </button>
                            <button class="repost-btn" data-post-id="${post.id}" title="Репост">
                                <i class="fas fa-retweet"></i>
                                <span class="repost-count">0</span>
                            </button>
                            <button class="bookmark-btn ${this.isPostBookmarked(post.id) ? 'bookmarked' : ''}" data-post-id="${post.id}" title="В закладки">
                                <i class="fas fa-bookmark"></i>
                            </button>
                        </div>
                        
                        <div class="comments-section hidden" id="comments-${post.id}">
                            <h4>Комментарии</h4>
                            <div class="comment-form">
                                <input type="text" class="comment-input" placeholder="Напишите комментарий..." data-post-id="${post.id}">
                                <button class="comment-submit" data-post-id="${post.id}">Отправить</button>
                            </div>
                            <div class="comment-list" id="comment-list-${post.id}">
                                ${this.renderComments(comments)}
                            </div>
                        </div>
                    </div>
                `;
            });
            postsContainer.innerHTML = postsHTML;
            this.bindPostEvents();
        }.bind(this);
        
        this.renderPosts(posts);
        
        // Восстанавливаем оригинальный метод
        this.renderPosts = originalMethod;
        // Удаляем временный контейнер
        document.body.removeChild(tempContainer);
    },

    // Загрузка настроек
    loadSettings: function() {
        // Загружаем сохраненные настройки из localStorage
        const theme = localStorage.getItem('vibe_theme') || 'light';
        const notifications = localStorage.getItem('vibe_notifications') !== 'false';
        const privacy = localStorage.getItem('vibe_privacy') || 'public';
        
        document.getElementById('settings-theme').value = theme;
        document.getElementById('settings-notifications').checked = notifications;
        document.getElementById('settings-privacy').value = privacy;
        
        // Применяем тему
        this.applyTheme();
    },

    // Применение темы
    applyTheme: function() {
        const theme = localStorage.getItem('vibe_theme') || 'light';
        // Удаляем предыдущие классы тем
        document.body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
        // Добавляем текущую тему
        document.body.classList.add(`theme-${theme}`);
    },
    
    // Загрузка постов
    loadPosts: function() {
        const postsContainer = document.getElementById('posts-container');
        const sortBy = document.getElementById('sort-posts').value;
        
        // Показываем индикатор загрузки
        postsContainer.innerHTML = '<div class="loading-posts"><i class="fas fa-spinner fa-spin"></i> Загрузка постов...</div>';
        
        this.apiRequest('/api/posts', 'GET')
            .then(data => {
                if (data.success) {
                    let posts = data.posts;
                    
                    // Сортировка
                    if (sortBy === 'popular') {
                        posts.sort((a, b) => (b.likes || 0) - (a.likes || 0));
                    }
                    
                    this.renderPosts(posts);
                    this.updateStats();
                } else {
                    postsContainer.innerHTML = '<div class="loading-posts">Ошибка загрузки постов</div>';
                }
            })
            .catch(error => {
                console.error('Ошибка загрузки постов:', error);
                postsContainer.innerHTML = '<div class="loading-posts">Ошибка соединения с сервером</div>';
            });
    },
    
    // Отображение постов
    renderPosts: function(posts) {
        const postsContainer = document.getElementById('posts-container');
        
        if (posts.length === 0) {
            postsContainer.innerHTML = '<div class="loading-posts">Пока нет постов. Будьте первым!</div>';
            return;
        }
        
        let postsHTML = '';
        
        posts.forEach(post => {
            const postDate = new Date(post.created_at).toLocaleString('ru-RU');
            const hasVideo = post.video_url && post.video_url.trim() !== '';
            
            // Используем аватар из post.author_avatar, если есть, иначе первую букву
            const avatarUrl = post.author_avatar;
            const avatarLetter = post.author ? post.author.charAt(0).toUpperCase() : 'U';
            const avatarHtml = avatarUrl
                ? `<img src="${avatarUrl}" alt="${this.escapeHtml(post.author)}" class="author-avatar-image">`
                : avatarLetter;

            // Форматируем количество лайков
            const likes = post.likes || 0;
            const likesText = likes === 1 ? '1 лайк' : `${likes} лайков`;

            // Комментарии
            const comments = post.comments || [];
            const commentsText = comments.length === 1 ? '1 комментарий' : `${comments.length} комментариев`;

            postsHTML += `
                <div class="post-card" data-post-id="${post.id}">
                    <div class="post-header">
                        <div class="post-author" data-author-id="${post.author_id}" style="cursor: pointer;">
                            <div class="author-avatar">${avatarHtml}</div>
                            <div>
                                <div class="author-name">${post.author || 'Аноним'}</div>
                                <div class="post-date">${postDate}</div>
                            </div>
                        </div>
                        ${post.author_id === this.currentUser?.id ? `
                            <div class="post-owner-actions">
                                <button class="btn btn-icon btn-small edit-post-btn" data-post-id="${post.id}" title="Редактировать">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-icon btn-small delete-post-btn" data-post-id="${post.id}" title="Удалить">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    
                    <h3 class="post-title">${this.escapeHtml(post.title)}</h3>
                    <div class="post-content">${this.escapeHtml(post.content).replace(/\n/g, '<br>')}</div>
                    
                    ${hasVideo ? `
                        <div class="video-preview" data-video-url="${post.video_url}">
                            <div class="video-overlay">
                                <i class="fas fa-play-circle"></i>
                            </div>
                            <div class="video-thumbnail" style="background: linear-gradient(90deg, #ff4757, #ff6b81); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">
                                <i class="fas fa-video" style="font-size: 3rem;"></i>
                                <div style="margin-left: 15px;">
                                    <div>Видео прикреплено</div>
                                    <div style="font-size: 0.9rem; margin-top: 5px;">Нажмите для просмотра</div>
                                </div>
                            </div>
                        </div>
                    ` : ''}
                    
                    ${post.files && post.files.length > 0 ? this.renderPostFiles(post.files) : ''}
                    
                    <div class="post-actions">
                        <button class="like-btn ${this.isPostLiked(post.id) ? 'liked' : ''}" data-post-id="${post.id}">
                            <i class="fas fa-heart"></i>
                            <span class="like-count">${likesText}</span>
                        </button>
                        <button class="comment-btn" data-post-id="${post.id}">
                            <i class="fas fa-comment"></i>
                            <span>${commentsText}</span>
                        </button>
                        <button class="repost-btn" data-post-id="${post.id}" title="Репост">
                            <i class="fas fa-retweet"></i>
                            <span class="repost-count">0</span>
                        </button>
                        <button class="bookmark-btn ${this.isPostBookmarked(post.id) ? 'bookmarked' : ''}" data-post-id="${post.id}" title="В закладки">
                            <i class="fas fa-bookmark"></i>
                        </button>
                        <button class="follow-btn ${this.isFollowing(post.author_id) ? 'following' : ''}" data-author-id="${post.author_id}" data-author-name="${post.author}" title="Подписаться">
                            <i class="fas fa-user-plus"></i>
                            <span>${this.isFollowing(post.author_id) ? 'Подписан' : 'Подписаться'}</span>
                        </button>
                    </div>
                    
                    <div class="comments-section hidden" id="comments-${post.id}">
                        <h4>Комментарии</h4>
                        <div class="comment-form">
                            <input type="text" class="comment-input" placeholder="Напишите комментарий..." data-post-id="${post.id}">
                            <button class="comment-submit" data-post-id="${post.id}">Отправить</button>
                        </div>
                        <div class="comment-list" id="comment-list-${post.id}">
                            ${this.renderComments(comments)}
                        </div>
                    </div>
                </div>
            `;
        });
        
        postsContainer.innerHTML = postsHTML;
        
        // Назначаем обработчики для новых элементов
        this.bindPostEvents();
    },
    
    // Отображение комментариев
    renderComments: function(comments) {
        if (!comments || comments.length === 0) {
            return '<div class="comment-item">Пока нет комментариев</div>';
        }
        
        return comments.map(comment => {
            const commentDate = new Date(comment.created_at).toLocaleString('ru-RU');
            return `
                <div class="comment-item">
                    <div class="comment-author">${this.escapeHtml(comment.author)}</div>
                    <div class="comment-text">${this.escapeHtml(comment.text)}</div>
                    <div class="comment-date">${commentDate}</div>
                </div>
            `;
        }).join('');
    },

    // Отображение файлов поста
    renderPostFiles: function(files) {
        if (!files || files.length === 0) {
            return '';
        }
        
        let filesHTML = '<div class="post-files">';
        filesHTML += '<div class="post-files-title"><i class="fas fa-paperclip"></i> Прикрепленные файлы</div>';
        filesHTML += '<div class="post-files-list">';
        
        files.forEach(file => {
            const fileType = file.type || 'file';
            const fileName = this.escapeHtml(file.original_name || file.filename);
            const fileUrl = file.url || `/uploads/posts/${file.filename}`;
            
            if (fileType === 'image') {
                filesHTML += `
                    <div class="post-file-item post-file-image" data-file-url="${fileUrl}" data-file-type="image">
                        <div class="file-thumbnail">
                            <img src="${fileUrl}" alt="${fileName}" loading="lazy">
                        </div>
                        <div class="file-info">
                            <div class="file-name">${fileName}</div>
                            <div class="file-actions">
                                <button class="btn btn-icon btn-small view-file-btn" title="Просмотр"><i class="fas fa-eye"></i></button>
                                <a href="${fileUrl}" download="${fileName}" class="btn btn-icon btn-small download-file-btn" title="Скачать"><i class="fas fa-download"></i></a>
                            </div>
                        </div>
                    </div>
                `;
            } else if (fileType === 'video') {
                filesHTML += `
                    <div class="post-file-item post-file-video" data-file-url="${fileUrl}" data-file-type="video">
                        <div class="file-thumbnail">
                            <i class="fas fa-video"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${fileName}</div>
                            <div class="file-actions">
                                <button class="btn btn-icon btn-small view-file-btn" title="Просмотр"><i class="fas fa-play"></i></button>
                                <a href="${fileUrl}" download="${fileName}" class="btn btn-icon btn-small download-file-btn" title="Скачать"><i class="fas fa-download"></i></a>
                            </div>
                        </div>
                    </div>
                `;
            } else if (fileType === 'audio') {
                filesHTML += `
                    <div class="post-file-item post-file-audio" data-file-url="${fileUrl}" data-file-type="audio">
                        <div class="file-thumbnail">
                            <i class="fas fa-music"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${fileName}</div>
                            <div class="file-actions">
                                <audio controls class="audio-player">
                                    <source src="${fileUrl}" type="audio/mpeg">
                                    Ваш браузер не поддерживает аудио элемент.
                                </audio>
                                <a href="${fileUrl}" download="${fileName}" class="btn btn-icon btn-small download-file-btn" title="Скачать"><i class="fas fa-download"></i></a>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                filesHTML += `
                    <div class="post-file-item post-file-other" data-file-url="${fileUrl}" data-file-type="file">
                        <div class="file-thumbnail">
                            <i class="fas fa-file"></i>
                        </div>
                        <div class="file-info">
                            <div class="file-name">${fileName}</div>
                            <div class="file-actions">
                                <a href="${fileUrl}" target="_blank" class="btn btn-icon btn-small view-file-btn" title="Открыть"><i class="fas fa-external-link-alt"></i></a>
                                <a href="${fileUrl}" download="${fileName}" class="btn btn-icon btn-small download-file-btn" title="Скачать"><i class="fas fa-download"></i></a>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        filesHTML += '</div></div>';
        return filesHTML;
    },
    
    // Назначение обработчиков событий для постов
    bindPostEvents: function() {
        // Лайки
        document.querySelectorAll('.like-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                this.likePost(postId);
            });
        });
        
        // Комментарии (показать/скрыть)
        document.querySelectorAll('.comment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                const commentsSection = document.getElementById(`comments-${postId}`);
                commentsSection.classList.toggle('hidden');
            });
        });
        
        // Отправка комментариев
        document.querySelectorAll('.comment-submit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                const input = document.querySelector(`.comment-input[data-post-id="${postId}"]`);
                const text = input.value.trim();
                
                if (!text) {
                    alert('Введите текст комментария');
                    return;
                }
                
                if (!this.currentUser) {
                    alert('Для комментирования необходимо войти в систему');
                    this.showLoginForm();
                    return;
                }
                
                this.addComment(postId, text, input);
            });
        });
        
        // Просмотр видео
        document.querySelectorAll('.video-preview').forEach(video => {
            video.addEventListener('click', (e) => {
                const videoUrl = e.currentTarget.dataset.videoUrl;
                this.showVideoModal(videoUrl);
            });
        });
        
        // Репост
        document.querySelectorAll('.repost-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                this.repostPost(postId);
            });
        });
        
        // Закладки
        document.querySelectorAll('.bookmark-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                this.bookmarkPost(postId);
            });
        });
        
        // Подписка
        document.querySelectorAll('.follow-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const authorId = parseInt(e.currentTarget.dataset.authorId);
                const authorName = e.currentTarget.dataset.authorName;
                this.followUser(authorId, authorName);
            });
        });

        // Клик на автора поста (аватар или имя)
        document.querySelectorAll('.post-author').forEach(authorElement => {
            authorElement.addEventListener('click', (e) => {
                const authorId = parseInt(e.currentTarget.dataset.authorId);
                if (authorId && !isNaN(authorId)) {
                    this.viewUserProfile(authorId);
                }
            });
        });

        // Редактирование поста
        document.querySelectorAll('.edit-post-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                this.editPost(postId);
            });
        });

        // Удаление поста
        document.querySelectorAll('.delete-post-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const postId = e.currentTarget.dataset.postId;
                if (confirm('Вы уверены, что хотите удалить этот пост? Это действие нельзя отменить.')) {
                    this.deletePost(postId);
                }
            });
        });

        // Просмотр файлов
        document.querySelectorAll('.view-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileItem = e.currentTarget.closest('.post-file-item');
                const fileUrl = fileItem.dataset.fileUrl;
                const fileType = fileItem.dataset.fileType;
                this.showFileModal(fileUrl, fileType);
            });
        });

        // Клик на изображение для просмотра
        document.querySelectorAll('.file-thumbnail img').forEach(img => {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileItem = e.currentTarget.closest('.post-file-item');
                const fileUrl = fileItem.dataset.fileUrl;
                this.showFileModal(fileUrl, 'image');
            });
        });
    },

    // Показать модальное окно с файлом
    showFileModal: function(fileUrl, fileType) {
        const modal = document.getElementById('media-modal');
        const title = document.getElementById('media-modal-title');
        const player = document.getElementById('media-player');
        const description = document.getElementById('media-description');
        
        if (fileType === 'image') {
            player.innerHTML = `<img src="${fileUrl}" style="max-width: 100%; max-height: 80vh; object-fit: contain;" alt="Изображение">`;
            title.textContent = 'Просмотр изображения';
            description.textContent = 'Изображение из поста';
        } else if (fileType === 'video') {
            player.innerHTML = `
                <video controls style="width: 100%; max-height: 80vh;">
                    <source src="${fileUrl}" type="video/mp4">
                    Ваш браузер не поддерживает видео элемент.
                </video>
            `;
            title.textContent = 'Просмотр видео';
            description.textContent = 'Видео из поста';
        } else if (fileType === 'audio') {
            player.innerHTML = `
                <audio controls style="width: 100%;">
                    <source src="${fileUrl}" type="audio/mpeg">
                    Ваш браузер не поддерживает аудио элемент.
                </audio>
            `;
            title.textContent = 'Прослушивание аудио';
            description.textContent = 'Аудио из поста';
        } else {
            player.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <i class="fas fa-file" style="font-size: 3rem; color: #ff4757; margin-bottom: 20px;"></i>
                    <div>Файл: ${fileUrl.split('/').pop()}</div>
                    <div style="margin-top: 20px;">
                        <a href="${fileUrl}" target="_blank" class="btn btn-primary">Открыть в новой вкладке</a>
                        <a href="${fileUrl}" download class="btn btn-outline" style="margin-left: 10px;">Скачать</a>
                    </div>
                </div>
            `;
            title.textContent = 'Файл';
            description.textContent = 'Документ из поста';
        }
        
        modal.classList.remove('hidden');
    },
    
    // Лайк поста
    likePost: function(postId) {
        if (!this.currentUser) {
            alert('Для оценки поста необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        this.apiRequest(`/api/posts/${postId}/like`, 'POST')
            .then(data => {
                if (data.success) {
                    // Обновляем счетчик лайков
                    const likeBtn = document.querySelector(`.like-btn[data-post-id="${postId}"]`);
                    const likeCount = likeBtn.querySelector('.like-count');
                    const likes = data.likes;
                    likeCount.textContent = likes === 1 ? '1 лайк' : `${likes} лайков`;
                    
                    // Добавляем визуальный эффект
                    likeBtn.classList.add('liked');
                    likeBtn.querySelector('i').classList.remove('fa-heart');
                    likeBtn.querySelector('i').classList.add('fa-heart', 'fas');
                    
                    // Обновляем общую статистику
                    this.updateStats();
                }
            })
            .catch(error => {
                console.error('Ошибка лайка:', error);
            });
    },
    
    // Добавление комментария
    addComment: function(postId, text, inputElement) {
        this.apiRequest(`/api/posts/${postId}/comment`, 'POST', {
            author: this.currentUser.username,
            text: text
        })
        .then(data => {
            if (data.success) {
                // Очищаем поле ввода
                inputElement.value = '';
                
                // Добавляем новый комментарий в список
                const commentList = document.getElementById(`comment-list-${postId}`);
                const commentDate = new Date(data.comment.created_at).toLocaleString('ru-RU');
                
                const commentHTML = `
                    <div class="comment-item">
                        <div class="comment-author">${this.escapeHtml(data.comment.author)}</div>
                        <div class="comment-text">${this.escapeHtml(data.comment.text)}</div>
                        <div class="comment-date">${commentDate}</div>
                    </div>
                `;
                
                // Если первый комментарий был "Пока нет комментариев", заменяем его
                if (commentList.innerHTML.includes('Пока нет комментариев')) {
                    commentList.innerHTML = commentHTML;
                } else {
                    commentList.innerHTML += commentHTML;
                }
                
                // Обновляем счетчик комментариев
                const commentBtn = document.querySelector(`.comment-btn[data-post-id="${postId}"]`);
                const currentText = commentBtn.querySelector('span').textContent;
                const match = currentText.match(/\d+/);
                if (match) {
                    const count = parseInt(match[0]) + 1;
                    commentBtn.querySelector('span').textContent = count === 1 ? '1 комментарий' : `${count} комментариев`;
                }
            }
        })
        .catch(error => {
            console.error('Ошибка добавления комментария:', error);
            alert('Ошибка при добавлении комментария');
        });
    },
    
    // Создание или редактирование поста
    handleCreatePost: function(e) {
        e.preventDefault();
        
        if (!this.currentUser) {
            alert('Для создания поста необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        const title = document.getElementById('post-title').value.trim();
        const content = document.getElementById('post-content').value.trim();
        const videoUrl = document.getElementById('post-video').value.trim();
        const fileInput = document.getElementById('post-files');
        
        if (!title || !content) {
            alert('Заполните заголовок и содержание поста');
            return;
        }
        
        const form = document.getElementById('post-form');
        const editPostId = form.dataset.editPostId;
        
        // Если есть ID редактируемого поста, отправляем PUT-запрос (без файлов)
        if (editPostId) {
            this.apiRequest(`/api/posts/${editPostId}`, 'PUT', {
                title: title,
                content: content,
                video_url: videoUrl
            })
            .then(data => {
                if (data.success) {
                    alert('Пост успешно обновлен!');
                    this.hideCreatePostForm();
                    this.loadPosts();
                } else {
                    alert('Ошибка: ' + data.message);
                }
            })
            .catch(error => {
                console.error('Ошибка обновления поста:', error);
                alert('Ошибка соединения с сервером');
            });
        } else {
            try {
                // Создание нового поста с поддержкой файлов
                const formData = new FormData();
                formData.append('title', title);
                formData.append('content', content);
                formData.append('video_url', videoUrl);
                formData.append('author', this.currentUser.username);
                formData.append('author_id', this.currentUser.id);
                
                // Добавляем файлы
                if (fileInput && fileInput.files && fileInput.files.length > 0) {
                    for (let i = 0; i < fileInput.files.length; i++) {
                        formData.append('file' + i, fileInput.files[i]);
                    }
                }
                
                // Используем специальный метод для отправки FormData
                console.log('Отправка поста с FormData:', {
                    title,
                    content,
                    videoUrl,
                    author: this.currentUser.username,
                    author_id: this.currentUser.id,
                    fileCount: fileInput ? fileInput.files.length : 0
                });
                // Выводим содержимое FormData для отладки
                for (let pair of formData.entries()) {
                    console.log(pair[0] + ': ' + (pair[0].startsWith('file') ? '[File]' : pair[1]));
                }
                
                fetch('/api/posts', {
                    method: 'POST',
                    body: formData
                })
                .then(response => {
                    console.log('Ответ сервера:', response.status, response.statusText);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    console.log('Данные ответа:', data);
                    if (data.success) {
                        alert('Пост успешно создан!');
                        this.hideCreatePostForm();
                        this.loadPosts();
                    } else {
                        alert('Ошибка: ' + data.message);
                    }
                })
                .catch(error => {
                    console.error('Ошибка создания поста:', error);
                    alert('Ошибка соединения с сервером: ' + error.message);
                });
            } catch (syncError) {
                console.error('Синхронная ошибка при создании поста:', syncError);
                alert('Ошибка при подготовке данных: ' + syncError.message);
            }
        }
    },
    
    // Показать модальное окно с видео
    showVideoModal: function(videoUrl) {
        const modal = document.getElementById('media-modal');
        const title = document.getElementById('media-modal-title');
        const player = document.getElementById('media-player');
        const description = document.getElementById('media-description');
        
        // Извлекаем ID видео из YouTube URL
        let videoId = '';
        if (videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
            const match = videoUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/);
            videoId = match ? match[1] : '';
        }
        
        if (videoId) {
            player.innerHTML = `
                <iframe width="100%" height="100%"
                    src="https://www.youtube.com/embed/${videoId}"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
                </iframe>
            `;
            title.textContent = 'Просмотр видео';
            description.textContent = 'Видео загружено из YouTube. Наслаждайтесь просмотром!';
        } else {
            player.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ff4757; margin-bottom: 20px;"></i>
                    <div>Не удалось загрузить видео</div>
                    <div style="margin-top: 10px; font-size: 0.9rem;">Ссылка: ${videoUrl}</div>
                </div>
            `;
            title.textContent = 'Ошибка загрузки видео';
            description.textContent = 'Проверьте ссылку на видео и попробуйте снова.';
        }
        
        modal.classList.remove('hidden');
    },
    
    // Скрыть модальное окно с видео
    hideVideoModal: function() {
        document.getElementById('media-modal').classList.add('hidden');
        // Останавливаем видео
        const iframe = document.querySelector('#media-player iframe');
        if (iframe) {
            iframe.src = iframe.src; // Перезагружаем iframe чтобы остановить видео
        }
    },
    
    // Обновление статистики
    updateStats: function() {
        this.apiRequest('/api/posts', 'GET')
            .then(data => {
                if (data.success) {
                    const posts = data.posts;
                    const today = new Date().toDateString();
                    
                    // Посты сегодня
                    const postsToday = posts.filter(post => {
                        const postDate = new Date(post.created_at).toDateString();
                        return postDate === today;
                    }).length;
                    
                    document.getElementById('posts-today').textContent = postsToday;
                    
                    // Всего лайков
                    const totalLikes = posts.reduce((sum, post) => sum + (post.likes || 0), 0);
                    document.getElementById('total-likes').textContent = totalLikes;
                    
                    // Пользователей (загружаем отдельно)
                    this.apiRequest('/api/users', 'GET')
                        .then(userData => {
                            if (userData.success) {
                                document.getElementById('total-users').textContent = userData.users.length;
                            }
                        })
                        .catch(() => {
                            // Если endpoint /api/users не существует, используем приблизительное значение
                            document.getElementById('total-users').textContent = Math.max(1, Math.floor(posts.length / 2));
                        });
                }
            })
            .catch(error => {
                console.error('Ошибка обновления статистики:', error);
            });
    },
    
    // Проверка, лайкнул ли пользователь пост (упрощенная версия)
    isPostLiked: function(postId) {
        // В реальном приложении здесь была бы проверка на сервере
        // Для демо просто проверяем localStorage
        const likedPosts = JSON.parse(localStorage.getItem('vibe_liked_posts') || '[]');
        return likedPosts.includes(postId);
    },
    
    // Проверка, находится ли пост в закладках
    isPostBookmarked: function(postId) {
        if (!this.currentUser) return false;
        const bookmarks = JSON.parse(localStorage.getItem(`vibe_bookmarks_${this.currentUser.id}`) || '[]');
        return bookmarks.includes(postId);
    },
    
    // Проверка, подписан ли на пользователя
    isFollowing: function(authorId) {
        if (!this.currentUser) return false;
        const following = JSON.parse(localStorage.getItem(`vibe_following_${this.currentUser.id}`) || '[]');
        return following.includes(authorId);
    },
    
    // Подписаться/отписаться от пользователя
    followUser: function(authorId, authorName) {
        if (!this.currentUser) {
            alert('Для подписки необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        this.apiRequest(`/api/users/${authorId}/follow`, 'POST', {
            follower_id: this.currentUser.id
        })
        .then(data => {
            if (data.success) {
                // Обновляем локальное хранилище
                const key = `vibe_following_${this.currentUser.id}`;
                let following = JSON.parse(localStorage.getItem(key) || '[]');
                const isFollowing = following.includes(authorId);
                
                if (isFollowing) {
                    following = following.filter(id => id !== authorId);
                } else {
                    following.push(authorId);
                }
                localStorage.setItem(key, JSON.stringify(following));
                
                // Обновляем кнопку
                const followBtn = document.querySelector(`.follow-btn[data-author-id="${authorId}"]`);
                if (followBtn) {
                    const icon = followBtn.querySelector('i');
                    const span = followBtn.querySelector('span');
                    if (isFollowing) {
                        followBtn.classList.remove('following');
                        icon.className = 'fas fa-user-plus';
                        span.textContent = 'Подписаться';
                    } else {
                        followBtn.classList.add('following');
                        icon.className = 'fas fa-user-check';
                        span.textContent = 'Подписан';
                    }
                }
                
                alert(isFollowing ? `Вы отписались от ${authorName}` : `Вы подписались на ${authorName}`);
            }
        })
        .catch(error => {
            console.error('Ошибка подписки:', error);
            alert('Ошибка при выполнении подписки');
        });
    },
    
    // Добавить/удалить пост из закладок
    bookmarkPost: function(postId) {
        if (!this.currentUser) {
            alert('Для добавления в закладки необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        this.apiRequest(`/api/posts/${postId}/bookmark`, 'POST', {
            user_id: this.currentUser.id
        })
        .then(data => {
            if (data.success) {
                // Обновляем локальное хранилище
                const key = `vibe_bookmarks_${this.currentUser.id}`;
                let bookmarks = JSON.parse(localStorage.getItem(key) || '[]');
                const isBookmarked = bookmarks.includes(postId);
                
                if (isBookmarked) {
                    bookmarks = bookmarks.filter(id => id !== postId);
                } else {
                    bookmarks.push(postId);
                }
                localStorage.setItem(key, JSON.stringify(bookmarks));
                
                // Обновляем кнопку
                const bookmarkBtn = document.querySelector(`.bookmark-btn[data-post-id="${postId}"]`);
                if (bookmarkBtn) {
                    if (isBookmarked) {
                        bookmarkBtn.classList.remove('bookmarked');
                        bookmarkBtn.querySelector('i').className = 'fas fa-bookmark';
                    } else {
                        bookmarkBtn.classList.add('bookmarked');
                        bookmarkBtn.querySelector('i').className = 'fas fa-bookmark';
                    }
                }
                
                alert(isBookmarked ? 'Пост удален из закладок' : 'Пост добавлен в закладки');
            }
        })
        .catch(error => {
            console.error('Ошибка закладки:', error);
            alert('Ошибка при добавлении в закладки');
        });
    },
    
    // Репост поста
    repostPost: function(postId) {
        if (!this.currentUser) {
            alert('Для репоста необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        if (!confirm('Вы уверены, что хотите сделать репост этого поста?')) {
            return;
        }
        
        this.apiRequest(`/api/posts/${postId}/repost`, 'POST', {
            user_id: this.currentUser.id
        })
        .then(data => {
            if (data.success) {
                alert('Пост успешно репостнут!');
                this.loadPosts(); // Обновляем ленту
            } else {
                alert('Ошибка: ' + data.message);
            }
        })
        .catch(error => {
            console.error('Ошибка репоста:', error);
            alert('Ошибка при репосте');
        });
    },
    
    // Обновление профиля
    handleProfileUpdate: function(e) {
        e.preventDefault();
        if (!this.currentUser) {
            alert('Для обновления профиля необходимо войти в систему');
            this.showLoginForm();
            return;
        }

        const username = document.getElementById('profile-username-input').value.trim();
        const bio = document.getElementById('profile-bio-input').value.trim();
        const password = document.getElementById('profile-password').value;
        const confirmPassword = document.getElementById('profile-password-confirm').value;
        const avatarInput = document.getElementById('profile-avatar-input');
        const avatarFile = avatarInput.files[0];

        if (password && password !== confirmPassword) {
            alert('Пароли не совпадают');
            return;
        }

        // Используем FormData для поддержки загрузки файлов
        const formData = new FormData();
        formData.append('user_id', this.currentUser.id);
        if (username) formData.append('username', username);
        if (bio) formData.append('bio', bio);
        if (password) formData.append('password', password);
        if (avatarFile) formData.append('avatar', avatarFile);

        // Специальный запрос для FormData (не JSON)
        fetch('/api/profile/update', {
            method: 'POST',
            body: formData
        })
            .then(response => response.json())
            .then(response => {
                if (response.success) {
                    alert('Профиль успешно обновлен');
                    if (response.user) {
                        this.currentUser = response.user;
                        this.saveUserToStorage(this.currentUser);
                        this.updateUI();
                        // Обновляем аватар на странице профиля
                        const avatarImg = document.getElementById('profile-avatar');
                        if (response.user.avatar) {
                            avatarImg.src = response.user.avatar;
                        }
                    }
                } else {
                    alert('Ошибка: ' + response.message);
                }
            })
            .catch(error => {
                console.error('Ошибка обновления профиля:', error);
                alert('Ошибка соединения с сервером');
            });
    },

    // Сохранение настроек
    handleSettingsSubmit: function(e) {
        e.preventDefault();
        const theme = document.getElementById('settings-theme').value;
        const notifications = document.getElementById('settings-notifications').checked;
        const privacy = document.getElementById('settings-privacy').value;

        localStorage.setItem('vibe_theme', theme);
        localStorage.setItem('vibe_notifications', notifications);
        localStorage.setItem('vibe_privacy', privacy);

        // Применяем тему
        document.body.classList.remove('theme-light', 'theme-dark');
        document.body.classList.add(`theme-${theme}`);

        alert('Настройки сохранены');
    },

    // Универсальный запрос к API
    apiRequest: async function(endpoint, method = 'GET', data = null) {
        const url = endpoint.startsWith('http') ? endpoint : `${endpoint}`;
        
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }
        
        try {
            const response = await fetch(url, options);
            return await response.json();
        } catch (error) {
            console.error(`API request error (${endpoint}):`, error);
            throw error;
        }
    },
    
    // Загрузка пользователей для чата
    loadChatUsers: function() {
        this.apiRequest('/api/users', 'GET')
            .then(data => {
                if (data.success) {
                    this.renderChatUsers(data.users);
                }
            })
            .catch(error => console.error('Ошибка загрузки пользователей чата:', error));
    },

    // Отображение пользователей чата
    renderChatUsers: function(users) {
        const container = document.getElementById('chat-users-list');
        if (!container) return;
        
        // Определяем, является ли текущий пользователь админом
        const isAdmin = this.currentUser?.username === 'testadmin';
        
        let filteredUsers;
        if (isAdmin) {
            // Админ видит всех пользователей, кроме демо-пользователей и себя
            filteredUsers = users.filter(user =>
                user.id !== this.currentUser?.id &&
                !['Alex', 'Maria', 'VibeAdmin'].includes(user.username)
            );
        } else {
            // Обычные пользователи видят только официальный чат Vibe (is_official = true)
            filteredUsers = users.filter(user =>
                user.is_official === true && user.id !== this.currentUser?.id
            );
        }
        
        if (filteredUsers.length === 0) {
            container.innerHTML = '<div class="chat-no-users">Нет доступных пользователей</div>';
            return;
        }

        let html = '';
        filteredUsers.forEach(user => {
            const lastMessage = user.is_official ? 'Официальные уведомления' : 'Привет! Как дела?';
            const time = '12:30';
            const avatarHtml = user.avatar
                ? `<img src="${user.avatar}" alt="${this.escapeHtml(user.username)}" class="avatar-image">`
                : user.username.charAt(0).toUpperCase();
            html += `
            <div class="chat-user-item" data-user-id="${user.id}" data-is-official="${user.is_official || false}">
                <div class="chat-user-avatar">${avatarHtml}</div>
                <div class="chat-user-info">
                    <div class="chat-user-name">
                        ${this.escapeHtml(user.username)}
                        ${user.is_official ? '<span class="verified-badge"><i class="fas fa-check-circle"></i></span>' : ''}
                        <i class="fas fa-user-circle profile-link-icon" title="Просмотр профиля" data-user-id="${user.id}"></i>
                    </div>
                    <div class="chat-user-last">${lastMessage}</div>
                </div>
                <div class="chat-user-time">${time}</div>
            </div>
        `;
        });
        container.innerHTML = html;

        // Добавляем обработчики клика
        container.querySelectorAll('.chat-user-item').forEach(item => {
            item.addEventListener('click', () => {
                const userId = item.dataset.userId;
                this.selectChatUser(userId);
            });
        });

        // Обработчики для иконки просмотра профиля
        container.querySelectorAll('.profile-link-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation(); // предотвращаем всплытие, чтобы не вызывался selectChatUser
                const userId = parseInt(icon.dataset.userId);
                if (userId && !isNaN(userId)) {
                    this.viewUserProfile(userId);
                }
            });
        });
    },

    // Выбор пользователя для чата
    selectChatUser: function(userId) {
        // Загружаем информацию о пользователе через API
        this.apiRequest(`/api/profile?user_id=${userId}`, 'GET')
            .then(data => {
                if (!data.success || !data.user) return;
                const user = data.user;
                
                // Обновляем заголовок чата
                document.querySelector('.chat-header-name').textContent = user.username;
                const headerAvatar = document.querySelector('.chat-header-avatar');
                if (user.avatar) {
                    headerAvatar.innerHTML = `<img src="${user.avatar}" alt="${this.escapeHtml(user.username)}" class="avatar-image">`;
                } else {
                    headerAvatar.textContent = user.username.charAt(0).toUpperCase();
                }
                document.querySelector('.chat-header-status').textContent = 'был(а) в сети 5 минут назад';
                
                // Сохраняем выбранного пользователя для проверки официального чата
                this.selectedChatUser = user;
                
                // Показываем демо-сообщения (в реальном приложении загружаем историю)
                this.loadChatMessages();
            })
            .catch(error => console.error('Ошибка загрузки пользователя:', error));
    },

    // Загрузка сообщений чата
    loadChatMessages: function() {
        if (!this.currentUser || !this.selectedChatUser) return;
        
        // Загружаем реальные сообщения с сервера
        this.apiRequest(`/api/chat/messages?user1_id=${this.currentUser.id}&user2_id=${this.selectedChatUser.id}`, 'GET')
            .then(data => {
                if (data.success && data.messages) {
                    // Преобразуем формат сообщений для отображения
                    const formattedMessages = data.messages.map(msg => {
                        const incoming = msg.sender_id !== this.currentUser.id;
                        const senderName = incoming ? this.selectedChatUser.username : this.currentUser.username;
                        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return {
                            id: msg.id,
                            sender: senderName,
                            text: msg.text,
                            time: time,
                            incoming: incoming
                        };
                    });
                    this.renderChatMessages(formattedMessages);
                } else {
                    // Если сообщений нет, показываем пустой список
                    this.renderChatMessages([]);
                }
            })
            .catch(error => {
                console.error('Ошибка загрузки сообщений:', error);
                this.renderChatMessages([]);
            });
    },

    // Отображение сообщений
    renderChatMessages: function(messages) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        let html = '';
        messages.forEach(msg => {
            const className = msg.incoming ? 'message-incoming' : 'message-outgoing';
            const avatar = msg.incoming ? msg.sender.charAt(0).toUpperCase() : 'Я';
            html += `
                <div class="message ${className}" data-message-id="${msg.id}">
                    ${msg.incoming ? `<div class="message-avatar">${avatar}</div>` : ''}
                    <div class="message-content">
                        <div class="message-text">${this.escapeHtml(msg.text)}</div>
                        <div class="message-time">${msg.time}</div>
                    </div>
                    ${!msg.incoming ? `<div class="message-avatar">${avatar}</div>` : ''}
                </div>
            `;
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
    },

    // Поиск пользователей в чате
    searchChatUsers: function() {
        const query = document.getElementById('chat-search-input').value.trim().toLowerCase();
        if (!query) {
            this.loadChatUsers();
            return;
        }

        this.apiRequest('/api/users', 'GET')
            .then(data => {
                if (data.success) {
                    const filtered = data.users.filter(user =>
                        user.id !== this.currentUser?.id &&
                        !['Alex', 'Maria', 'VibeAdmin'].includes(user.username) &&
                        user.username.toLowerCase().includes(query)
                    );
                    this.renderChatUsers(filtered);
                }
            })
            .catch(error => console.error('Ошибка поиска:', error));
    },

    // Отправка сообщения
    sendChatMessage: function() {
        const input = document.getElementById('chat-message-input');
        const text = input.value.trim();
        if (!text || !this.currentUser) return;

        // Проверяем, если выбран официальный чат (Vibe)
        if (this.selectedChatUser && this.selectedChatUser.is_official) {
            // Только админ (testadmin) может отправлять сообщения в официальный чат
            if (this.currentUser.username !== 'testadmin') {
                alert('Вы не можете отправлять сообщения в официальный чат Vibe. Этот чат только для уведомлений.');
                input.value = '';
                return;
            }
        }

        // Отправляем сообщение на сервер
        this.apiRequest('/api/chat/send', 'POST', {
            sender_id: this.currentUser.id,
            receiver_id: this.selectedChatUser.id,
            text: text
        })
        .then(data => {
            if (data.success) {
                // Добавляем сообщение в интерфейс
                const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const container = document.getElementById('chat-messages');
                const messageId = data.chat_message?.id || Date.now();
                const html = `
                    <div class="message message-outgoing" data-message-id="${messageId}">
                        <div class="message-content">
                            <div class="message-text">${this.escapeHtml(text)}</div>
                            <div class="message-time">${time}</div>
                        </div>
                        <div class="message-avatar">Я</div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
                container.scrollTop = container.scrollHeight;

                // Очищаем поле ввода
                input.value = '';

                // Обновляем последнее сообщение в списке пользователей (опционально)
                this.updateLastMessageInList(text, time);
            } else {
                alert('Не удалось отправить сообщение: ' + (data.message || 'Ошибка сервера'));
            }
        })
        .catch(error => {
            console.error('Ошибка отправки сообщения:', error);
            alert('Ошибка соединения с сервером');
        });
    },

    // Обновление последнего сообщения в списке пользователей
    updateLastMessageInList: function(text, time) {
        const userItems = document.querySelectorAll('.chat-user-item');
        userItems.forEach(item => {
            if (item.dataset.userId == this.selectedChatUser.id) {
                const lastMsgEl = item.querySelector('.chat-user-last');
                if (lastMsgEl) {
                    lastMsgEl.textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
                }
                const timeEl = item.querySelector('.chat-user-time');
                if (timeEl) {
                    timeEl.textContent = time;
                }
            }
        });
    },

    // Запуск периодического опроса сообщений чата
    startChatPolling: function() {
        // Останавливаем предыдущий интервал, если есть
        this.stopChatPolling();
        // Запускаем новый интервал каждые 3 секунды
        this.chatPollInterval = setInterval(() => {
            this.pollChatMessages();
        }, 3000);
        console.log('Опрос чата запущен');
    },

    // Остановка опроса чата
    stopChatPolling: function() {
        if (this.chatPollInterval) {
            clearInterval(this.chatPollInterval);
            this.chatPollInterval = null;
            console.log('Опрос чата остановлен');
        }
    },

    // Опрос новых сообщений
    pollChatMessages: function() {
        if (!this.currentUser || !this.selectedChatUser || this.currentPage !== 'chat') {
            return;
        }
        // Загружаем сообщения без перезагрузки всего UI
        this.apiRequest(`/api/chat/messages?user1_id=${this.currentUser.id}&user2_id=${this.selectedChatUser.id}`, 'GET')
            .then(data => {
                if (data.success && data.messages) {
                    // Получаем текущие ID сообщений в контейнере
                    const container = document.getElementById('chat-messages');
                    if (!container) return;
                    const existingIds = new Set();
                    container.querySelectorAll('.message').forEach(msgEl => {
                        const id = msgEl.dataset.messageId;
                        if (id) existingIds.add(parseInt(id));
                    });
                    // Добавляем только новые сообщения
                    let newMessagesAdded = false;
                    data.messages.forEach(msg => {
                        if (!existingIds.has(msg.id)) {
                            const incoming = msg.sender_id !== this.currentUser.id;
                            const senderName = incoming ? this.selectedChatUser.username : this.currentUser.username;
                            const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const className = incoming ? 'message-incoming' : 'message-outgoing';
                            const avatar = incoming ? senderName.charAt(0).toUpperCase() : 'Я';
                            const html = `
                                <div class="message ${className}" data-message-id="${msg.id}">
                                    ${incoming ? `<div class="message-avatar">${avatar}</div>` : ''}
                                    <div class="message-content">
                                        <div class="message-text">${this.escapeHtml(msg.text)}</div>
                                        <div class="message-time">${time}</div>
                                    </div>
                                    ${!incoming ? `<div class="message-avatar">${avatar}</div>` : ''}
                                </div>
                            `;
                            container.insertAdjacentHTML('beforeend', html);
                            newMessagesAdded = true;
                        }
                    });
                    if (newMessagesAdded) {
                        container.scrollTop = container.scrollHeight;
                    }
                }
            })
            .catch(error => {
                console.error('Ошибка опроса сообщений:', error);
            });
    },

    // Функции звонков
    startCall: function(userId, type) {
        if (!this.currentUser) {
            alert('Для звонка необходимо войти в систему');
            this.showLoginForm();
            return;
        }
        
        // Загружаем информацию о пользователе
        this.apiRequest(`/api/profile?user_id=${userId}`, 'GET')
            .then(data => {
                if (!data.success) {
                    alert('Пользователь не найден');
                    return;
                }
                
                const user = data.user;
                this.callActive = true;
                this.callMuted = false;
                this.callVideoOff = false;
                this.callStartTime = new Date();
                
                // Обновляем UI модального окна
                document.getElementById('call-title').textContent = type === 'video' ? 'Видеозвонок' : 'Аудиозвонок';
                document.getElementById('call-username').textContent = user.username;
                document.getElementById('call-status').textContent = type === 'video' ? 'Видеозвонок...' : 'Аудиозвонок...';
                
                // Устанавливаем аватар
                const avatarLetter = document.getElementById('call-avatar-letter');
                const avatarImage = document.getElementById('call-avatar-image');
                if (user.avatar && user.avatar !== '/uploads/default-avatar.jpg') {
                    avatarLetter.classList.add('hidden');
                    avatarImage.classList.remove('hidden');
                    avatarImage.style.backgroundImage = `url(${user.avatar})`;
                } else {
                    avatarLetter.classList.remove('hidden');
                    avatarImage.classList.add('hidden');
                    avatarLetter.textContent = user.username.charAt(0).toUpperCase();
                }
                
                // Показываем модальное окно
                document.getElementById('call-modal').classList.remove('hidden');
                
                // Запускаем таймер
                this.updateCallTimer();
                if (this.callTimerInterval) clearInterval(this.callTimerInterval);
                this.callTimerInterval = setInterval(() => this.updateCallTimer(), 1000);
                
                // Обновляем текст кнопок
                this.updateCallButtons();
                
                // В реальном приложении здесь инициализация WebRTC
                console.log(`Начало ${type}-звонка с пользователем ${user.username} (ID: ${userId})`);
            })
            .catch(error => {
                console.error('Ошибка загрузки профиля:', error);
                alert('Не удалось начать звонок');
            });
    },
    
    endCall: function() {
        if (!this.callActive) return;
        
        this.callActive = false;
        if (this.callTimerInterval) {
            clearInterval(this.callTimerInterval);
            this.callTimerInterval = null;
        }
        
        // Скрываем модальное окно
        document.getElementById('call-modal').classList.add('hidden');
        
        // Сбрасываем таймер
        document.getElementById('call-timer').textContent = '00:00';
        
        console.log('Звонок завершен');
    },
    
    toggleMute: function() {
        if (!this.callActive) return;
        
        this.callMuted = !this.callMuted;
        const btn = document.getElementById('call-mute');
        const icon = btn.querySelector('i');
        
        if (this.callMuted) {
            btn.innerHTML = '<i class="fas fa-microphone-slash"></i> Вкл. звук';
            btn.classList.add('btn-muted');
        } else {
            btn.innerHTML = '<i class="fas fa-microphone"></i> Выкл. звук';
            btn.classList.remove('btn-muted');
        }
        
        console.log('Микрофон:', this.callMuted ? 'выключен' : 'включен');
    },
    
    toggleVideo: function() {
        if (!this.callActive) return;
        
        this.callVideoOff = !this.callVideoOff;
        const btn = document.getElementById('call-video-toggle');
        const icon = btn.querySelector('i');
        
        if (this.callVideoOff) {
            btn.innerHTML = '<i class="fas fa-video-slash"></i> Вкл. видео';
            btn.classList.add('btn-muted');
        } else {
            btn.innerHTML = '<i class="fas fa-video"></i> Выкл. видео';
            btn.classList.remove('btn-muted');
        }
        
        console.log('Видео:', this.callVideoOff ? 'выключено' : 'включено');
    },
    
    updateCallTimer: function() {
        if (!this.callStartTime) return;
        
        const now = new Date();
        const diff = Math.floor((now - this.callStartTime) / 1000); // секунды
        const minutes = Math.floor(diff / 60);
        const seconds = diff % 60;
        
        const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('call-timer').textContent = formatted;
        
        // Обновляем статус после 3 секунд
        if (diff > 3) {
            document.getElementById('call-status').textContent = 'В процессе...';
        }
    },
    
    updateCallButtons: function() {
        // Обновляем текст кнопок в соответствии с текущим состоянием
        this.toggleMute();
        this.toggleVideo();
    },

    // Открытие селектора файлов
    openFileSelector: function() {
        const fileInput = document.getElementById('chat-file-input');
        if (fileInput) {
            fileInput.click();
        }
    },

    // Открытие селектора изображений
    openImageSelector: function() {
        const fileInput = document.getElementById('chat-file-input');
        if (fileInput) {
            fileInput.accept = 'image/*';
            fileInput.click();
        }
    },

    // Обработка выбора файлов
    handleFileSelect: function(event) {
        const files = event.target.files;
        if (!files.length) return;

        // Сбрасываем accept
        const fileInput = document.getElementById('chat-file-input');
        fileInput.accept = 'image/*,video/*,audio/*,.pdf,.txt';

        // Добавляем файлы в список
        for (let i = 0; i < files.length; i++) {
            this.selectedFiles.push(files[i]);
        }

        // Показываем индикатор загрузки
        this.showFileUploadIndicator();

        // В реальном приложении здесь загрузка на сервер
        console.log('Выбрано файлов:', files.length);
        
        // Очищаем input для возможности повторного выбора тех же файлов
        event.target.value = '';
    },

    // Обработка выбора файлов для поста
    handlePostFilesSelect: function(event) {
        const files = event.target.files;
        if (!files.length) return;

        const previewContainer = document.getElementById('file-preview');
        previewContainer.innerHTML = '';

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileItem = document.createElement('div');
            fileItem.className = 'file-preview-item';
            
            const fileName = document.createElement('div');
            fileName.className = 'file-preview-name';
            fileName.textContent = file.name;
            
            const fileSize = document.createElement('div');
            fileSize.className = 'file-preview-size';
            fileSize.textContent = this.formatFileSize(file.size);
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn btn-icon btn-small';
            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
            removeBtn.addEventListener('click', () => {
                fileItem.remove();
                // Удалить файл из input? сложно, проще пересоздать input
                this.updatePostFilesInput();
            });
            
            fileItem.appendChild(fileName);
            fileItem.appendChild(fileSize);
            fileItem.appendChild(removeBtn);
            previewContainer.appendChild(fileItem);
        }
    },

    // Форматирование размера файла
    formatFileSize: function(bytes) {
        if (bytes === 0) return '0 Б';
        const k = 1024;
        const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    // Обновление input файлов поста (удаление удаленных файлов)
    updatePostFilesInput: function() {
        // В реальном приложении нужно управлять FileList, что невозможно
        // Поэтому просто оставляем как есть, удаление файлов из input невозможно без пересоздания
        // Для простоты оставим как есть, файлы останутся в input, но визуально скрыты
        // В продакшене нужно использовать FormData и управлять файлами отдельно
    },

    // Показать индикатор загрузки файла
    showFileUploadIndicator: function() {
        const input = document.getElementById('chat-message-input');
        const indicator = document.createElement('div');
        indicator.className = 'file-upload-indicator';
        indicator.innerHTML = `
            <i class="fas fa-spinner fa-spin"></i>
            <span>Загружено ${this.selectedFiles.length} файл(ов)</span>
            <button class="btn btn-icon btn-small" id="clear-files-btn"><i class="fas fa-times"></i></button>
        `;
        
        // Удаляем предыдущий индикатор
        const existing = document.querySelector('.file-upload-indicator');
        if (existing) existing.remove();
        
        // Вставляем перед полем ввода
        input.parentNode.insertBefore(indicator, input.nextSibling);

        // Обработчик очистки файлов
        document.getElementById('clear-files-btn')?.addEventListener('click', () => {
            this.selectedFiles = [];
            indicator.remove();
        });
    },

    // Переключение эмодзи-пикера
    toggleEmojiPicker: function() {
        const picker = document.getElementById('emoji-picker');
        if (!picker) return;

        if (this.emojiPickerVisible) {
            this.hideEmojiPicker();
        } else {
            this.showEmojiPicker();
        }
    },

    // Показать эмодзи-пикер
    showEmojiPicker: function() {
        const picker = document.getElementById('emoji-picker');
        if (!picker) return;

        picker.classList.remove('hidden');
        this.emojiPickerVisible = true;

        // Добавляем обработчики для эмодзи
        picker.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', (e) => {
                const emojiChar = e.target.textContent;
                this.insertEmoji(emojiChar);
            });
        });
    },

    // Скрыть эмодзи-пикер
    hideEmojiPicker: function() {
        const picker = document.getElementById('emoji-picker');
        if (picker) {
            picker.classList.add('hidden');
        }
        this.emojiPickerVisible = false;
    },

    // Вставить эмодзи в поле ввода
    insertEmoji: function(emoji) {
        const input = document.getElementById('chat-message-input');
        if (!input) return;

        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + emoji + text.substring(end);
        input.focus();
        input.selectionStart = input.selectionEnd = start + emoji.length;
    },

    // Отправка сообщения с поддержкой файлов
    sendChatMessage: function() {
        const input = document.getElementById('chat-message-input');
        const text = input.value.trim();
        if ((!text && this.selectedFiles.length === 0) || !this.currentUser) return;

        // Проверяем, если выбран официальный чат (Vibe)
        if (this.selectedChatUser && this.selectedChatUser.is_official) {
            // Только админ (testadmin) может отправлять сообщения в официальный чат
            if (this.currentUser.username !== 'testadmin') {
                alert('Вы не можете отправлять сообщения в официальный чат Vibe. Этот чат только для уведомлений.');
                input.value = '';
                return;
            }
        }

        // В реальном приложении отправляем на сервер
        const newMessage = {
            id: Date.now(),
            sender: this.currentUser.username,
            text: text,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            incoming: false,
            files: this.selectedFiles.length > 0 ? [...this.selectedFiles] : []
        };

        // Добавляем в интерфейс
        this.renderChatMessage(newMessage);

        // Очищаем поле ввода и файлы
        input.value = '';
        this.selectedFiles = [];
        this.hideEmojiPicker();
        
        // Удаляем индикатор загрузки файлов
        const indicator = document.querySelector('.file-upload-indicator');
        if (indicator) indicator.remove();
    },

    // Рендер сообщения с файлами
    renderChatMessage: function(message) {
        const container = document.getElementById('chat-messages');
        if (!container) return;

        let fileHtml = '';
        if (message.files && message.files.length > 0) {
            fileHtml = `
                <div class="message-file">
                    <a href="#" target="_blank">
                        <i class="fas fa-paperclip message-file-icon"></i>
                        <span>${message.files.length} файл(ов)</span>
                    </a>
                </div>
            `;
        }

        const html = `
            <div class="message message-outgoing">
                <div class="message-content">
                    <div class="message-text">${this.escapeHtml(message.text)}</div>
                    ${fileHtml}
                    <div class="message-time">${message.time}</div>
                </div>
                <div class="message-avatar">Я</div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
        container.scrollTop = container.scrollHeight;
    },

    // Редактирование поста
    editPost: function(postId) {
        if (!this.currentUser) {
            alert('Для редактирования поста необходимо войти в систему');
            return;
        }

        // Загружаем данные поста
        this.apiRequest(`/api/posts/${postId}`, 'GET')
            .then(data => {
                if (!data.success || !data.post) {
                    alert('Не удалось загрузить пост для редактирования');
                    return;
                }

                const post = data.post;
                // Проверяем, что текущий пользователь является автором
                if (post.author_id !== this.currentUser.id) {
                    alert('Вы не можете редактировать чужой пост');
                    return;
                }

                // Показываем форму редактирования (можно использовать существующую форму создания поста)
                this.showEditPostForm(post);
            })
            .catch(error => {
                console.error('Ошибка загрузки поста:', error);
                alert('Ошибка загрузки поста');
            });
    },

    // Показать форму редактирования поста
    showEditPostForm: function(post) {
        // Скрываем все формы
        this.hideAllForms();

        // Показываем форму создания поста (переименуем заголовок)
        const form = document.getElementById('create-post-form');
        const title = form.querySelector('h2');
        if (title) title.textContent = 'Редактирование поста';

        // Заполняем поля
        document.getElementById('post-title').value = post.title || '';
        document.getElementById('post-content').value = post.content || '';
        document.getElementById('post-video').value = post.video_url || '';

        // Сохраняем ID редактируемого поста в data-атрибут формы
        const postForm = document.getElementById('post-form');
        postForm.dataset.editPostId = post.id;

        // Меняем текст кнопки отправки
        const submitBtn = postForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.textContent = 'Сохранить изменения';

        // Показываем форму
        form.classList.remove('hidden');
    },

    // Обработка отправки формы редактирования
    handleEditPost: function(postId, formData) {
        this.apiRequest(`/api/posts/${postId}`, 'PUT', formData)
            .then(data => {
                if (data.success) {
                    alert('Пост успешно обновлен');
                    this.hideCreatePostForm();
                    this.loadPosts(); // Перезагружаем ленту
                } else {
                    alert('Ошибка обновления поста: ' + (data.message || 'Неизвестная ошибка'));
                }
            })
            .catch(error => {
                console.error('Ошибка обновления поста:', error);
                alert('Ошибка обновления поста');
            });
    },

    // Удаление поста
    deletePost: function(postId) {
        if (!this.currentUser) {
            alert('Для удаления поста необходимо войти в систему');
            return;
        }

        this.apiRequest(`/api/posts/${postId}`, 'DELETE')
            .then(data => {
                if (data.success) {
                    alert('Пост успешно удален');
                    // Удаляем пост из интерфейса
                    const postElement = document.querySelector(`.post-card[data-post-id="${postId}"]`);
                    if (postElement) {
                        postElement.remove();
                    }
                    // Перезагружаем ленту для обновления статистики
                    this.loadPosts();
                } else {
                    alert('Ошибка удаления поста: ' + (data.message || 'Неизвестная ошибка'));
                }
            })
            .catch(error => {
                console.error('Ошибка удаления поста:', error);
                alert('Ошибка удаления поста');
            });
    },

    // Экранирование HTML для безопасности
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Полное обновление всех данных (команда "update everything")
    updateEverything: function() {
        console.log('Выполняется полное обновление всех данных...');
        
        // Очищаем локальное хранилище (удаляем только ключи Vibe)
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('vibe_') || key === 'currentUser') {
                localStorage.removeItem(key);
            }
        });
        
        // Принудительно перезагружаем страницу с сервера (без кэша)
        location.reload(true);
    }
};

// Глобальная команда для консоли
window.updateEverything = function() {
    VibeApp.updateEverything();
};

// Запуск приложения после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    VibeApp.init();
});