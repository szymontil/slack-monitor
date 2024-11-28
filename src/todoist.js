const axios = require('axios');

async function addTaskToTodoist(taskContent) {
    try {
        const response = await axios.post('https://api.todoist.com/rest/v2/tasks', {
            content: taskContent,
            due_string: 'today',
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
            },
        });

        console.log('✅ Zadanie dodane do Todoist:', response.data);
    } catch (error) {
        console.error('❌ Błąd podczas dodawania zadania do Todoist:', error.message);
    }
}

module.exports = { addTaskToTodoist };
