const axios = require('axios');

async function addTaskToTodoist(taskTitle) {
    const taskData = {
        content: taskTitle,
        due_string: 'today', // Optional: Adjust the due date logic here
    };

    try {
        console.log('📤 Wysyłanie zadania do Todoist:', taskData);
        const response = await axios.post('https://api.todoist.com/rest/v2/tasks', taskData, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.TODOIST_API_KEY}`,
            },
        });

        console.log(`✅ Zadanie dodane do Todoist: ${taskTitle}`);
        return response.data;
    } catch (error) {
        console.error('❌ Błąd podczas dodawania zadania do Todoist:', error.message);
    }
}

module.exports = { addTaskToTodoist };
