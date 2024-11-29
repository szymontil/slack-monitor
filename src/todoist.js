const axios = require('axios');

async function addTaskToTodoist(taskTitle) {
    if (!process.env.TODOIST_API_KEY) {
        throw new Error('Brak klucza API Todoist w zmiennych środowiskowych');
    }

    const taskData = {
        content: taskTitle,
        due_string: 'today',
    };

    try {
        console.log('📤 Wysyłanie zadania do Todoist:', taskData);
        const response = await axios.post('https://api.todoist.com/rest/v2/tasks', taskData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
            },
        });

        console.log('📥 Odpowiedź z Todoist:', {
            status: response.status,
            data: response.data
        });

        return response.data;
    } catch (error) {
        console.error('❌ Błąd podczas dodawania zadania do Todoist:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers
        });
        throw error;
    }
}

async function verifyTodoistConnection() {
    try {
        const response = await axios.get('https://api.todoist.com/rest/v2/projects', {
            headers: {
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
            },
        });
        console.log('✅ Połączenie z Todoist działa poprawnie');
        return true;
    } catch (error) {
        console.error('❌ Błąd połączenia z Todoist:', error.message);
        return false;
    }
}

module.exports = { 
    addTaskToTodoist,
    verifyTodoistConnection
};