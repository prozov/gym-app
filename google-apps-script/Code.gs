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
const GOOGLE_CLIENT_ID = '170990227936-afe8ef92mc5aji5npde0hfcq512p86ee.apps.googleusercontent.com';

// ============================================
// АВТОРИЗАЦИЯ
// ============================================

/**
 * Проверка Google ID Token
 */
function verifyGoogleToken(idToken) {
  if (!idToken) {
    return { error: 'No token provided' };
  }

  try {
    const response = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + idToken
    );
    const tokenInfo = JSON.parse(response.getContentText());

    // Проверяем что токен выдан для нашего приложения
    if (tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      return { error: 'Invalid token audience' };
    }

    return {
      success: true,
      user_id: tokenInfo.sub,
      email: tokenInfo.email,
      name: tokenInfo.name || tokenInfo.email.split('@')[0],
      picture: tokenInfo.picture || ''
    };
  } catch (error) {
    return { error: 'Invalid token: ' + error.message };
  }
}

/**
 * Получить или создать пользователя
 */
function getOrCreateUser(googleUser) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let usersSheet = ss.getSheetByName('Users');

  // Создаём таблицу Users если её нет
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.getRange(1, 1, 1, 5).setValues([[
      'user_id', 'email', 'name', 'picture', 'created_at'
    ]]);
    usersSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  }

  const data = usersSheet.getDataRange().getValues();

  // Ищем существующего пользователя
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === googleUser.user_id) {
      return {
        user_id: data[i][0],
        email: data[i][1],
        name: data[i][2],
        picture: data[i][3],
        created_at: data[i][4]
      };
    }
  }

  // Создаём нового пользователя
  const newUser = {
    user_id: googleUser.user_id,
    email: googleUser.email,
    name: googleUser.name,
    picture: googleUser.picture,
    created_at: new Date().toISOString()
  };

  usersSheet.appendRow([
    newUser.user_id,
    newUser.email,
    newUser.name,
    newUser.picture,
    newUser.created_at
  ]);

  return newUser;
}

/**
 * Извлечь user_id из запроса
 */
function getUserFromRequest(e, isPost = false) {
  let token;

  if (isPost) {
    // Для POST запросов токен в теле
    token = e.token;
  } else {
    // Для GET запросов токен в параметрах
    token = e.parameter.token;
  }

  if (!token) {
    return { error: 'Authorization required' };
  }

  const tokenResult = verifyGoogleToken(token);
  if (tokenResult.error) {
    return tokenResult;
  }

  // Получаем или создаём пользователя
  const user = getOrCreateUser(tokenResult);
  return user;
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

  // Проверка авторизации
  const user = getUserFromRequest(data, true);
  if (user.error) {
    return jsonResponse({ error: user.error });
  }

  const action = data.action;
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

  // Создаём лист Users
  let usersSheet = ss.getSheetByName('Users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('Users');
    usersSheet.getRange(1, 1, 1, 5).setValues([[
      'user_id', 'email', 'name', 'picture', 'created_at'
    ]]);
    usersSheet.getRange(1, 1, 1, 5).setFontWeight('bold');
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
