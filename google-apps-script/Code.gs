/**
 * Дневник тренировок - Google Apps Script API
 *
 * ИНСТРУКЦИЯ:
 * 1. Откройте Google Таблицу
 * 2. Расширения → Apps Script
 * 3. Вставьте этот код
 * 4. Замените SPREADSHEET_ID на ID вашей таблицы
 * 5. Замените GOOGLE_CLIENT_ID на ваш Client ID из Google Cloud Console
 * 6. Развернуть → Новое развёртывание → Веб-приложение
 * 7. Доступ: "Все" → Развернуть
 * 8. Скопируйте URL веб-приложения
 */

// ============================================
// НАСТРОЙКИ - ЗАМЕНИТЕ НА СВОИ
// ============================================
const SPREADSHEET_ID = '1ZBKB2sjkfgU2fQlPwim3uyn442c3vV5s3qL-dn0uQRc';

// Срок жизни сессии (30 дней в миллисекундах)
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

// Количество итераций для хеширования пароля
const HASH_ITERATIONS = 10000;

// ============================================
// ХЕШИРОВАНИЕ ПАРОЛЕЙ
// ============================================

/**
 * Генерация случайного salt
 */
function generateSalt(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let salt = '';
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

/**
 * Хеширование пароля с salt (итеративный SHA-256)
 */
function hashPassword(password, salt) {
  let hash = password + salt;
  for (let i = 0; i < HASH_ITERATIONS; i++) {
    const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      hash,
      Utilities.Charset.UTF_8
    );
    hash = digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  }
  return hash;
}

/**
 * Проверка пароля
 */
function verifyPassword(password, salt, storedHash) {
  const hash = hashPassword(password, salt);
  return hash === storedHash;
}

// ============================================
// УПРАВЛЕНИЕ СЕССИЯМИ
// ============================================

/**
 * Генерация сессионного токена
 */
function generateSessionToken() {
  const timestamp = Date.now().toString(36);
  const random1 = Math.random().toString(36).substr(2, 15);
  const random2 = Math.random().toString(36).substr(2, 15);
  return timestamp + '_' + random1 + random2;
}

/**
 * Создание сессии
 */
function createSession(userId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sessionsSheet = ss.getSheetByName('Sessions');

  if (!sessionsSheet) {
    sessionsSheet = ss.insertSheet('Sessions');
    sessionsSheet.getRange(1, 1, 1, 4).setValues([[
      'token', 'user_id', 'created_at', 'expires_at'
    ]]);
    sessionsSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  const token = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  sessionsSheet.appendRow([
    token,
    userId,
    now.toISOString(),
    expiresAt.toISOString()
  ]);

  return {
    token: token,
    expires_at: expiresAt.toISOString()
  };
}

/**
 * Проверка сессионного токена
 */
function verifySessionToken(token) {
  if (!token) {
    return { error: 'No token provided' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessionsSheet = ss.getSheetByName('Sessions');

  if (!sessionsSheet) {
    return { error: 'Invalid token' };
  }

  const data = sessionsSheet.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      const expiresAt = new Date(data[i][3]);
      if (now > expiresAt) {
        // Удаляем просроченную сессию
        sessionsSheet.deleteRow(i + 1);
        return { error: 'Token expired' };
      }
      return {
        success: true,
        user_id: data[i][1]
      };
    }
  }

  return { error: 'Invalid token' };
}

/**
 * Удаление сессии (выход)
 */
function deleteSession(token) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sessionsSheet = ss.getSheetByName('Sessions');

  if (!sessionsSheet) return { success: true };

  const data = sessionsSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === token) {
      sessionsSheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { success: true };
}

// ============================================
// АВТОРИЗАЦИЯ (логин/пароль)
// ============================================

/**
 * Регистрация нового пользователя
 */
function register(username, password, name) {
  // Валидация
  if (!username || username.length < 3) {
    return { error: 'Логин должен быть минимум 3 символа' };
  }
  if (!password || password.length < 6) {
    return { error: 'Пароль должен быть минимум 6 символов' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let usersSheet = ss.getSheetByName('Users');

  // Создаём таблицу Users если её нет
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.getRange(1, 1, 1, 6).setValues([[
      'user_id', 'username', 'password_hash', 'password_salt', 'name', 'created_at'
    ]]);
    usersSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  const data = usersSheet.getDataRange().getValues();

  // Проверяем уникальность username (регистронезависимо)
  const usernameLower = username.toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toLowerCase() === usernameLower) {
      return { error: 'Этот логин уже занят' };
    }
  }

  // Создаём пользователя
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  const userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  usersSheet.appendRow([
    userId,
    username,
    hash,
    salt,
    name || username,
    new Date().toISOString()
  ]);

  // Создаём сессию
  const session = createSession(userId);

  return {
    success: true,
    user: {
      user_id: userId,
      username: username,
      name: name || username
    },
    token: session.token,
    expires_at: session.expires_at
  };
}

/**
 * Вход по логину и паролю
 */
function login(username, password) {
  if (!username || !password) {
    return { error: 'Введите логин и пароль' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { error: 'Неверный логин или пароль' };
  }

  const data = usersSheet.getDataRange().getValues();
  const usernameLower = username.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toLowerCase() === usernameLower) {
      const storedHash = data[i][2];
      const salt = data[i][3];

      if (verifyPassword(password, salt, storedHash)) {
        const session = createSession(data[i][0]);
        return {
          success: true,
          user: {
            user_id: data[i][0],
            username: data[i][1],
            name: data[i][4]
          },
          token: session.token,
          expires_at: session.expires_at
        };
      }
      break;
    }
  }

  return { error: 'Неверный логин или пароль' };
}

/**
 * Выход (удаление сессии)
 */
function logout(token) {
  return deleteSession(token);
}

/**
 * Получить пользователя по ID
 */
function getUserById(userId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { error: 'User not found' };
  }

  const data = usersSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === userId) {
      return {
        user_id: data[i][0],
        username: data[i][1],
        name: data[i][4],
        created_at: data[i][5]
      };
    }
  }

  return { error: 'User not found' };
}

/**
 * Извлечь пользователя из запроса по токену сессии
 */
function getUserFromRequest(e, isPost = false) {
  let token;

  if (isPost) {
    token = e.token;
  } else {
    token = e.parameter.token;
  }

  if (!token) {
    return { error: 'Authorization required' };
  }

  const sessionResult = verifySessionToken(token);
  if (sessionResult.error) {
    return sessionResult;
  }

  return getUserById(sessionResult.user_id);
}

// ============================================
// АДМИНИСТРАТИВНЫЕ ФУНКЦИИ
// ============================================

/**
 * Сброс пароля пользователя (для администратора)
 * Вызывать вручную из редактора Apps Script
 */
function adminResetPassword(username, newPassword) {
  if (!username || !newPassword) {
    return { error: 'Username and newPassword are required' };
  }

  if (newPassword.length < 6) {
    return { error: 'Password must be at least 6 characters' };
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const usersSheet = ss.getSheetByName('Users');

  if (!usersSheet) {
    return { error: 'Users sheet not found' };
  }

  const data = usersSheet.getDataRange().getValues();
  const usernameLower = username.toLowerCase();

  for (let i = 1; i < data.length; i++) {
    if (data[i][1] && data[i][1].toLowerCase() === usernameLower) {
      // Генерируем новый salt и hash
      const newSalt = generateSalt();
      const newHash = hashPassword(newPassword, newSalt);

      // Обновляем password_hash (колонка 3) и password_salt (колонка 4)
      usersSheet.getRange(i + 1, 3).setValue(newHash);
      usersSheet.getRange(i + 1, 4).setValue(newSalt);

      return { success: true, message: 'Password updated for user: ' + username };
    }
  }

  return { error: 'User not found: ' + username };
}

// ============================================
// ОБРАБОТКА ЗАПРОСОВ
// ============================================

// GET запросы (получение данных)
function doGet(e) {
  // Проверка авторизации
  const user = getUserFromRequest(e, false);
  if (user.error) {
    return jsonResponse({ error: user.error });
  }

  const action = e.parameter.action;
  let result;

  try {
    switch(action) {
      case 'getExercises':
        result = getExercises(user.user_id);
        break;
      case 'getWorkouts':
        result = getWorkouts(user.user_id, e.parameter.startDate, e.parameter.endDate);
        break;
      case 'getStats':
        result = getStats(user.user_id, e.parameter.exerciseId);
        break;
      case 'getBodyMetrics':
        result = getBodyMetrics(user.user_id, e.parameter.startDate, e.parameter.endDate);
        break;
      case 'getCurrentUser':
        result = { user: user };
        break;
      case 'init':
        result = initializeSheets();
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch(error) {
    result = { error: error.message };
  }

  return jsonResponse(result);
}

// POST запросы (сохранение данных)
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch(error) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  const action = data.action;

  // Actions без авторизации
  if (action === 'register') {
    return jsonResponse(register(data.username, data.password, data.name));
  }
  if (action === 'login') {
    return jsonResponse(login(data.username, data.password));
  }
  if (action === 'logout') {
    return jsonResponse(logout(data.token));
  }

  // Проверка авторизации для остальных actions
  const user = getUserFromRequest(data, true);
  if (user.error) {
    return jsonResponse({ error: user.error });
  }

  let result;

  try {
    switch(action) {
      case 'addWorkout':
        result = addWorkout(user.user_id, data.workout);
        break;
      case 'addWorkouts':
        result = addWorkouts(user.user_id, data.workouts);
        break;
      case 'deleteWorkout':
        result = deleteWorkout(user.user_id, data.id);
        break;
      case 'addExercise':
        result = addExercise(user.user_id, data.exercise);
        break;
      case 'addBodyMetric':
        result = addBodyMetric(user.user_id, data.metric);
        break;
      case 'deleteBodyMetric':
        result = deleteBodyMetric(user.user_id, data.id);
        break;
      default:
        result = { error: 'Unknown action: ' + action };
    }
  } catch(error) {
    result = { error: error.message };
  }

  return jsonResponse(result);
}

// Формат JSON ответа
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ ТАБЛИЦЫ
// ============================================

function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Создаём лист Users (новая структура для логин/пароль)
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.getRange(1, 1, 1, 6).setValues([[
      'user_id', 'username', 'password_hash', 'password_salt', 'name', 'created_at'
    ]]);
    usersSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  // Создаём лист Sessions
  let sessionsSheet = ss.getSheetByName('Sessions');
  if (!sessionsSheet) {
    sessionsSheet = ss.insertSheet('Sessions');
    sessionsSheet.getRange(1, 1, 1, 4).setValues([[
      'token', 'user_id', 'created_at', 'expires_at'
    ]]);
    sessionsSheet.getRange(1, 1, 1, 4).setFontWeight('bold');
  }

  // Создаём лист Workouts (с user_id)
  let workoutsSheet = ss.getSheetByName('Workouts');
  if (!workoutsSheet) {
    workoutsSheet = ss.insertSheet('Workouts');
    workoutsSheet.getRange(1, 1, 1, 10).setValues([[
      'id', 'user_id', 'date', 'exercise_id', 'exercise_name',
      'set_number', 'weight', 'reps', 'notes', 'created_at'
    ]]);
    workoutsSheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  } else {
    // Добавляем колонку user_id если её нет
    const headers = workoutsSheet.getRange(1, 1, 1, workoutsSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('user_id') === -1) {
      workoutsSheet.insertColumnAfter(1);
      workoutsSheet.getRange(1, 2).setValue('user_id');
      workoutsSheet.getRange(1, 2).setFontWeight('bold');
    }
  }

  // Создаём лист Exercises (с user_id для custom)
  let exercisesSheet = ss.getSheetByName('Exercises');
  if (!exercisesSheet) {
    exercisesSheet = ss.insertSheet('Exercises');
    exercisesSheet.getRange(1, 1, 1, 7).setValues([[
      'id', 'name', 'category', 'muscle_group', 'type', 'is_custom', 'user_id'
    ]]);
    exercisesSheet.getRange(1, 1, 1, 7).setFontWeight('bold');

    // Заполняем базовые упражнения (без user_id - доступны всем)
    const exercises = [
      // Базовые - Грудь
      ['ex_chest_dips', 'Брусья', 'Грудь', 'chest', 'base', false, ''],
      ['ex_chest_press', 'Жим на грудь в тренажёре сидя', 'Грудь', 'chest', 'base', false, ''],

      // Базовые - Спина
      ['ex_pullups', 'Подтягивания', 'Спина', 'back', 'base', false, ''],
      ['ex_horizontal_rows', 'Горизонтальные тяги', 'Спина', 'back', 'base', false, ''],

      // Базовые - Плечи
      ['ex_dumbbell_press', 'Жим гантелей сидя', 'Плечи', 'shoulders', 'base', false, ''],
      ['ex_shoulder_press', 'Жим в тренажёре на плечи', 'Плечи', 'shoulders', 'base', false, ''],

      // Базовые - Ноги
      ['ex_leg_press', 'Жим ногами', 'Ноги', 'legs', 'base', false, ''],
      ['ex_hack_squat', 'Гакк-приседания', 'Ноги', 'legs', 'base', false, ''],

      // Изолирующие
      ['ex_butterfly', 'Бабочка', 'Грудь', 'chest', 'isolation', false, ''],
      ['ex_reverse_fly', 'Обратное разведение рук', 'Спина', 'back', 'isolation', false, ''],
      ['ex_calf_raise', 'Подъём на носки', 'Икры', 'calves', 'isolation', false, ''],
      ['ex_bicep_curl', 'Сгибание рук с гантелями', 'Руки', 'arms', 'isolation', false, ''],
      ['ex_tricep_ext', 'Разгибание рук на блоке', 'Руки', 'arms', 'isolation', false, ''],
      ['ex_crunches', 'Скручивания', 'Кор', 'core', 'isolation', false, ''],
      ['ex_plank', 'Планка', 'Кор', 'core', 'isolation', false, ''],
    ];

    exercisesSheet.getRange(2, 1, exercises.length, 7).setValues(exercises);
  } else {
    // Добавляем колонку user_id если её нет
    const headers = exercisesSheet.getRange(1, 1, 1, exercisesSheet.getLastColumn()).getValues()[0];
    if (headers.indexOf('user_id') === -1) {
      const lastCol = exercisesSheet.getLastColumn() + 1;
      exercisesSheet.getRange(1, lastCol).setValue('user_id');
      exercisesSheet.getRange(1, lastCol).setFontWeight('bold');
    }
  }

  // Создаём лист BodyMetrics
  let bodyMetricsSheet = ss.getSheetByName('BodyMetrics');
  if (!bodyMetricsSheet) {
    bodyMetricsSheet = ss.insertSheet('BodyMetrics');
    bodyMetricsSheet.getRange(1, 1, 1, 9).setValues([[
      'id', 'user_id', 'date', 'height', 'weight', 'neck', 'waist', 'body_fat_percent', 'created_at'
    ]]);
    bodyMetricsSheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  }

  // Удаляем дефолтный Sheet1 если есть
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Лист1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  return { success: true, message: 'Sheets initialized with user support' };
}

// ============================================
// УПРАЖНЕНИЯ
// ============================================

function getExercises(userId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Exercises');
  if (!sheet) return { error: 'Exercises sheet not found. Run init first.' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const userIdCol = headers.indexOf('user_id');

  return data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    })
    .filter(ex => {
      // Базовые упражнения (без user_id) доступны всем
      // Custom упражнения - только владельцу
      return !ex.user_id || ex.user_id === '' || ex.user_id === userId;
    });
}

function addExercise(userId, exercise) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Exercises');
  if (!sheet) return { error: 'Exercises sheet not found' };

  const id = 'ex_custom_' + Date.now();

  sheet.appendRow([
    id,
    exercise.name,
    exercise.category,
    exercise.muscle_group || exercise.category.toLowerCase(),
    'custom',
    true,
    userId  // Привязываем к пользователю
  ]);

  return { success: true, id: id };
}

// ============================================
// ТРЕНИРОВКИ
// ============================================

function addWorkout(userId, workout) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const id = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  sheet.appendRow([
    id,
    userId,  // Привязываем к пользователю
    workout.date,
    workout.exercise_id,
    workout.exercise_name,
    workout.set_number,
    workout.weight,
    workout.reps,
    workout.notes || '',
    new Date().toISOString()
  ]);

  return { success: true, id: id };
}

// Добавить несколько подходов за раз (для всей тренировки)
function addWorkouts(userId, workouts) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const timestamp = new Date().toISOString();
  const ids = [];

  const rows = workouts.map(workout => {
    const id = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    ids.push(id);
    return [
      id,
      userId,  // Привязываем к пользователю
      workout.date,
      workout.exercise_id,
      workout.exercise_name,
      workout.set_number,
      workout.weight,
      workout.reps,
      workout.notes || '',
      timestamp
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 10).setValues(rows);
  }

  return { success: true, ids: ids, count: rows.length };
}

function getWorkouts(userId, startDate, endDate) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const userIdCol = headers.indexOf('user_id');

  let workouts = data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    })
    .filter(w => w.user_id === userId);  // Только тренировки пользователя

  // Фильтрация по датам
  if (startDate) {
    const start = new Date(startDate);
    workouts = workouts.filter(w => new Date(w.date) >= start);
  }

  if (endDate) {
    const end = new Date(endDate);
    workouts = workouts.filter(w => new Date(w.date) <= end);
  }

  // Сортировка по дате (новые сверху)
  workouts.sort((a, b) => new Date(b.date) - new Date(a.date));

  return workouts;
}

function deleteWorkout(userId, id) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const userIdCol = headers.indexOf('user_id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // Проверяем что тренировка принадлежит пользователю
      if (data[i][userIdCol] !== userId) {
        return { error: 'Access denied' };
      }
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { error: 'Workout not found' };
}

// ============================================
// СТАТИСТИКА
// ============================================

function getStats(userId, exerciseId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { workouts: [], maxWeight: 0, totalSets: 0, totalReps: 0 };

  const headers = data[0];

  let workouts = data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    })
    .filter(w => w.user_id === userId && w.exercise_id === exerciseId)  // Фильтр по пользователю
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (workouts.length === 0) {
    return { workouts: [], maxWeight: 0, totalSets: 0, totalReps: 0, lastWorkout: null };
  }

  const weights = workouts.map(w => parseFloat(w.weight) || 0);
  const reps = workouts.map(w => parseInt(w.reps) || 0);

  return {
    workouts: workouts,
    maxWeight: Math.max(...weights),
    totalSets: workouts.length,
    totalReps: reps.reduce((sum, r) => sum + r, 0),
    lastWorkout: workouts[workouts.length - 1],
    firstWorkout: workouts[0]
  };
}

// ============================================
// ПАРАМЕТРЫ ТЕЛА
// ============================================

function getBodyMetrics(userId, startDate, endDate) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('BodyMetrics');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];

  let metrics = data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i];
      });
      return obj;
    })
    .filter(m => m.user_id === userId);

  if (startDate) {
    metrics = metrics.filter(m => new Date(m.date) >= new Date(startDate));
  }
  if (endDate) {
    metrics = metrics.filter(m => new Date(m.date) <= new Date(endDate));
  }

  // Сортировка по дате (новые сверху)
  metrics.sort((a, b) => new Date(b.date) - new Date(a.date));
  return metrics;
}

function addBodyMetric(userId, metric) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('BodyMetrics');
  if (!sheet) return { error: 'BodyMetrics sheet not found. Run init first.' };

  const id = 'bm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  sheet.appendRow([
    id,
    userId,
    metric.date,
    metric.height,
    metric.weight,
    metric.neck,
    metric.waist,
    metric.body_fat_percent,
    new Date().toISOString()
  ]);

  return { success: true, id: id };
}

function deleteBodyMetric(userId, id) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('BodyMetrics');
  if (!sheet) return { error: 'BodyMetrics sheet not found' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      // Проверяем что запись принадлежит пользователю
      if (data[i][1] !== userId) {
        return { error: 'Access denied' };
      }
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { error: 'Metric not found' };
}
