/**
 * Дневник тренировок - Google Apps Script API
 *
 * ИНСТРУКЦИЯ:
 * 1. Откройте Google Таблицу
 * 2. Расширения → Apps Script
 * 3. Вставьте этот код
 * 4. Замените SPREADSHEET_ID на ID вашей таблицы
 * 5. Развернуть → Новое развёртывание → Веб-приложение
 * 6. Доступ: "Все" → Развернуть
 * 7. Скопируйте URL веб-приложения
 */

// ============================================
// НАСТРОЙКИ - ЗАМЕНИТЕ НА СВОИ
// ============================================
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const SECRET_KEY = 'YOUR_SECRET_KEY_HERE'; // Придумайте свой ключ (любая строка)

// ============================================
// ОБРАБОТКА ЗАПРОСОВ
// ============================================

// Проверка секретного ключа
function checkAuth(key) {
  return key === SECRET_KEY;
}

// GET запросы (получение данных)
function doGet(e) {
  // Проверка авторизации
  if (!checkAuth(e.parameter.key)) {
    return jsonResponse({ error: 'Unauthorized' });
  }

  const action = e.parameter.action;
  let result;

  try {
    switch(action) {
      case 'getExercises':
        result = getExercises();
        break;
      case 'getWorkouts':
        result = getWorkouts(e.parameter.startDate, e.parameter.endDate);
        break;
      case 'getStats':
        result = getStats(e.parameter.exerciseId);
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
  if (!checkAuth(data.key)) {
    return jsonResponse({ error: 'Unauthorized' });
  }

  const action = data.action;
  let result;

  try {
    switch(action) {
      case 'addWorkout':
        result = addWorkout(data.workout);
        break;
      case 'addWorkouts':
        result = addWorkouts(data.workouts);
        break;
      case 'deleteWorkout':
        result = deleteWorkout(data.id);
        break;
      case 'addExercise':
        result = addExercise(data.exercise);
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

  // Создаём лист Workouts
  let workoutsSheet = ss.getSheetByName('Workouts');
  if (!workoutsSheet) {
    workoutsSheet = ss.insertSheet('Workouts');
    workoutsSheet.getRange(1, 1, 1, 9).setValues([[
      'id', 'date', 'exercise_id', 'exercise_name',
      'set_number', 'weight', 'reps', 'notes', 'created_at'
    ]]);
    workoutsSheet.getRange(1, 1, 1, 9).setFontWeight('bold');
  }

  // Создаём лист Exercises
  let exercisesSheet = ss.getSheetByName('Exercises');
  if (!exercisesSheet) {
    exercisesSheet = ss.insertSheet('Exercises');
    exercisesSheet.getRange(1, 1, 1, 6).setValues([[
      'id', 'name', 'category', 'muscle_group', 'type', 'is_custom'
    ]]);
    exercisesSheet.getRange(1, 1, 1, 6).setFontWeight('bold');

    // Заполняем базовые упражнения
    const exercises = [
      // Базовые - Грудь
      ['ex_chest_dips', 'Брусья', 'Грудь', 'chest', 'base', false],
      ['ex_chest_press', 'Жим на грудь в тренажёре сидя', 'Грудь', 'chest', 'base', false],

      // Базовые - Спина
      ['ex_pullups', 'Подтягивания', 'Спина', 'back', 'base', false],
      ['ex_horizontal_rows', 'Горизонтальные тяги', 'Спина', 'back', 'base', false],

      // Базовые - Плечи
      ['ex_dumbbell_press', 'Жим гантелей сидя', 'Плечи', 'shoulders', 'base', false],
      ['ex_shoulder_press', 'Жим в тренажёре на плечи', 'Плечи', 'shoulders', 'base', false],

      // Базовые - Ноги
      ['ex_leg_press', 'Жим ногами', 'Ноги', 'legs', 'base', false],
      ['ex_hack_squat', 'Гакк-приседания', 'Ноги', 'legs', 'base', false],

      // Изолирующие
      ['ex_butterfly', 'Бабочка', 'Грудь', 'chest', 'isolation', false],
      ['ex_reverse_fly', 'Обратное разведение рук', 'Спина', 'back', 'isolation', false],
      ['ex_calf_raise', 'Подъём на носки', 'Икры', 'calves', 'isolation', false],
      ['ex_bicep_curl', 'Сгибание рук с гантелями', 'Бицепс', 'biceps', 'isolation', false],
      ['ex_tricep_ext', 'Разгибание рук на блоке', 'Трицепс', 'triceps', 'isolation', false],
      ['ex_crunches', 'Скручивания', 'Кор', 'core', 'isolation', false],
      ['ex_plank', 'Планка', 'Кор', 'core', 'isolation', false],
    ];

    exercisesSheet.getRange(2, 1, exercises.length, 6).setValues(exercises);
  }

  // Удаляем дефолтный Sheet1 если есть
  const defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Лист1');
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  return { success: true, message: 'Sheets initialized' };
}

// ============================================
// УПРАЖНЕНИЯ
// ============================================

function getExercises() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Exercises');
  if (!sheet) return { error: 'Exercises sheet not found. Run init first.' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];

  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });
}

function addExercise(exercise) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Exercises');
  if (!sheet) return { error: 'Exercises sheet not found' };

  const id = 'ex_custom_' + Date.now();

  sheet.appendRow([
    id,
    exercise.name,
    exercise.category,
    exercise.muscle_group || exercise.category.toLowerCase(),
    'custom',
    true
  ]);

  return { success: true, id: id };
}

// ============================================
// ТРЕНИРОВКИ
// ============================================

function addWorkout(workout) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const id = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

  sheet.appendRow([
    id,
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
function addWorkouts(workouts) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const timestamp = new Date().toISOString();
  const ids = [];

  const rows = workouts.map(workout => {
    const id = 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    ids.push(id);
    return [
      id,
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
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
  }

  return { success: true, ids: ids, count: rows.length };
}

function getWorkouts(startDate, endDate) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];

  let workouts = data.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i];
    });
    return obj;
  });

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

function deleteWorkout(id) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Workouts');
  if (!sheet) return { error: 'Workouts sheet not found' };

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }

  return { error: 'Workout not found' };
}

// ============================================
// СТАТИСТИКА
// ============================================

function getStats(exerciseId) {
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
    .filter(w => w.exercise_id === exerciseId)
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
