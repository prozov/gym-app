/**
 * API модуль для работы с Google Sheets
 * С поддержкой Google OAuth авторизации
 */

const API = {
    BASE_URL: 'https://script.google.com/macros/s/AKfycbyd2eK0Empvoc7pWspRMzbZpNzdjbnFuRcZUio9eQzzs5lZ48PB0th0lDfcgHTShw_eVw/exec',

    // Токен хранится в localStorage
    _token: null,
    _currentUser: null,

    /**
     * Инициализация API - загрузка токена из localStorage
     */
    init() {
        this._token = localStorage.getItem('auth_token');
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
     * Проверка авторизации
     */
    isAuthenticated() {
        return !!this._token;
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
    setAuthToken(token, user = null) {
        this._token = token;
        this._currentUser = user;
        localStorage.setItem('auth_token', token);
        if (user) {
            localStorage.setItem('auth_user', JSON.stringify(user));
        }
    },

    /**
     * Очистить токен авторизации (выход)
     */
    clearAuthToken() {
        this._token = null;
        this._currentUser = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
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
    }
};

// Инициализация при загрузке
API.init();
