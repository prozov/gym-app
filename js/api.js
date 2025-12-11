/**
 * API модуль для работы с Google Sheets
 * Авторизация по логину и паролю
 */

const API = {
    BASE_URL: 'https://script.google.com/macros/s/AKfycbxhKePMfW2DZ8HXMW2AJxusVpqKbLAe-4pYSRzwE2mkT2VcrI9K3wpefFj64RVLU676xw/exec',

    // Токен и данные пользователя хранятся в localStorage
    _token: null,
    _currentUser: null,
    _tokenExpiresAt: null,

    /**
     * Инициализация API - загрузка данных из localStorage
     */
    init() {
        this._token = localStorage.getItem('auth_token');
        this._tokenExpiresAt = localStorage.getItem('token_expires_at');
        const userStr = localStorage.getItem('auth_user');
        if (userStr) {
            try {
                this._currentUser = JSON.parse(userStr);
            } catch (e) {
                this._currentUser = null;
            }
        }
    },

    /**
     * Получить время истечения токена (ISO строка)
     */
    getTokenExpiration() {
        return this._tokenExpiresAt;
    },

    /**
     * Проверить, истёк ли токен
     * @param {number} bufferSeconds - буфер в секундах до истечения (по умолчанию 5 минут)
     */
    isTokenExpired(bufferSeconds = 300) {
        if (!this._tokenExpiresAt) return true;
        const expiresTime = new Date(this._tokenExpiresAt).getTime();
        const now = Date.now();
        return now >= (expiresTime - bufferSeconds * 1000);
    },

    /**
     * Получить оставшееся время жизни токена в секундах
     */
    getTokenTimeLeft() {
        if (!this._tokenExpiresAt) return 0;
        const expiresTime = new Date(this._tokenExpiresAt).getTime();
        const now = Date.now();
        return Math.max(0, Math.floor((expiresTime - now) / 1000));
    },

    /**
     * Проверка авторизации (учитывает срок жизни токена)
     */
    isAuthenticated() {
        return !!this._token && !this.isTokenExpired();
    },

    /**
     * Получить текущего пользователя
     */
    getCurrentUser() {
        return this._currentUser;
    },

    /**
     * Установить токен авторизации
     */
    setAuthToken(token, user = null, expiresAt = null) {
        this._token = token;
        this._currentUser = user;
        this._tokenExpiresAt = expiresAt;
        localStorage.setItem('auth_token', token);
        if (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
        }
        if (expiresAt) {
            localStorage.setItem('token_expires_at', expiresAt);
        }
    },

    /**
     * Очистить токен авторизации (выход)
     */
    clearAuthToken() {
        this._token = null;
        this._currentUser = null;
        this._tokenExpiresAt = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        localStorage.removeItem('token_expires_at');
    },

    // ============================================
    // АВТОРИЗАЦИЯ
    // ============================================

    /**
     * Регистрация нового пользователя
     */
    async register(username, password, name) {
        try {
            const response = await fetch(this.BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'register',
                    username,
                    password,
                    name
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Сохраняем токен и пользователя
            this.setAuthToken(data.token, data.user, data.expires_at);

            return data;
        } catch (error) {
            console.error('API register error:', error);
            throw error;
        }
    },

    /**
     * Вход по логину и паролю
     */
    async login(username, password) {
        try {
            const response = await fetch(this.BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    action: 'login',
                    username,
                    password
                })
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Сохраняем токен и пользователя
            this.setAuthToken(data.token, data.user, data.expires_at);

            return data;
        } catch (error) {
            console.error('API login error:', error);
            throw error;
        }
    },

    /**
     * Выход (удаление сессии на сервере)
     */
    async logout() {
        if (this._token) {
            try {
                await fetch(this.BASE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        action: 'logout',
                        token: this._token
                    })
                });
            } catch (e) {
                // Игнорируем ошибки при выходе
                console.error('Logout error:', e);
            }
        }
        this.clearAuthToken();
    },

    /**
     * GET запрос к API
     */
    async get(action, params = {}) {
        if (!this._token) {
            throw new Error('Not authenticated');
        }

        const url = new URL(this.BASE_URL);
        url.searchParams.set('action', action);
        url.searchParams.set('token', this._token);

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value);
            }
        }

        try {
            const response = await fetch(url.toString());
            const data = await response.json();

            if (data.error) {
                // Если токен невалидный - разлогиниваем
                if (data.error.includes('token') || data.error === 'Authorization required') {
                    this.clearAuthToken();
                    window.dispatchEvent(new CustomEvent('auth:logout'));
                }
                throw new Error(data.error);
            }
            return data;
        } catch (error) {
            console.error('API GET error:', error);
            throw error;
        }
    },

    /**
     * POST запрос к API
     */
    async post(action, payload = {}) {
        if (!this._token) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await fetch(this.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({
                    action,
                    token: this._token,
                    ...payload
                })
            });

            const data = await response.json();

            if (data.error) {
                // Если токен невалидный - разлогиниваем
                if (data.error.includes('token') || data.error === 'Authorization required') {
                    this.clearAuthToken();
                    window.dispatchEvent(new CustomEvent('auth:logout'));
                }
                throw new Error(data.error);
            }
            return data;
        } catch (error) {
            console.error('API POST error:', error);
            throw error;
        }
    },

    // ============================================
    // УПРАЖНЕНИЯ
    // ============================================

    /**
     * Получить список всех упражнений
     */
    async getExercises() {
        return await this.get('getExercises');
    },

    /**
     * Добавить своё упражнение
     */
    async addExercise(exercise) {
        return await this.post('addExercise', { exercise });
    },

    // ============================================
    // ТРЕНИРОВКИ
    // ============================================

    /**
     * Добавить один подход
     */
    async addWorkout(workout) {
        return await this.post('addWorkout', { workout });
    },

    /**
     * Добавить несколько подходов (всю тренировку)
     */
    async addWorkouts(workouts) {
        return await this.post('addWorkouts', { workouts });
    },

    /**
     * Получить историю тренировок
     */
    async getWorkouts(startDate = null, endDate = null) {
        return await this.get('getWorkouts', { startDate, endDate });
    },

    /**
     * Удалить запись тренировки
     */
    async deleteWorkout(id) {
        return await this.post('deleteWorkout', { id });
    },

    // ============================================
    // СТАТИСТИКА
    // ============================================

    /**
     * Получить статистику по упражнению
     */
    async getStats(exerciseId) {
        return await this.get('getStats', { exerciseId });
    },

    // ============================================
    // ПАРАМЕТРЫ ТЕЛА
    // ============================================

    /**
     * Получить историю измерений тела
     */
    async getBodyMetrics(startDate = null, endDate = null) {
        return await this.get('getBodyMetrics', { startDate, endDate });
    },

    /**
     * Добавить измерение тела
     */
    async addBodyMetric(metric) {
        return await this.post('addBodyMetric', { metric });
    },

    /**
     * Удалить измерение тела
     */
    async deleteBodyMetric(id) {
        return await this.post('deleteBodyMetric', { id });
    }
};

// Инициализация при загрузке
API.init();
