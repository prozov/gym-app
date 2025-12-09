/**
 * API модуль для работы с Google Sheets
 */

const API = {
    BASE_URL: 'https://script.google.com/macros/s/AKfycbx82OnXnecwQquZo_tTPZDJ2uJnArioS9OPBWDRXHQprSEH4fJPIqkZfF6tV9NRZ4wLhA/exec',
    SECRET_KEY: 'xK9mP2nL5qR8',

    /**
     * GET запрос к API
     */
    async get(action, params = {}) {
        const url = new URL(this.BASE_URL);
        url.searchParams.set('action', action);
        url.searchParams.set('key', this.SECRET_KEY);

        for (const [key, value] of Object.entries(params)) {
            if (value !== undefined && value !== null) {
                url.searchParams.set(key, value);
            }
        }

        try {
            const response = await fetch(url.toString());
            const data = await response.json();

            if (data.error) {
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
        try {
            const response = await fetch(this.BASE_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                },
                body: JSON.stringify({
                    action,
                    key: this.SECRET_KEY,
                    ...payload
                })
            });

            const data = await response.json();

            if (data.error) {
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
