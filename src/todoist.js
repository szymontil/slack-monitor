const axios = require('axios');

async function addTaskToTodoist(taskContent) {
    try {
        const response = await axios.post('https://api.todoist.com/rest/v2/tasks', {
            content: taskContent,
            due_string: 'today',
            priority: 3,
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });

        console.log('✅ Zadanie zostało dodane do Todoist:', response.data);
    } catch (error) {
        console.error('❌ Błąd podczas dodawania zadania do Todoist:', error.response ? error.response.data : error.message);
    }
}

module.exports = { addTaskToTodoist };
