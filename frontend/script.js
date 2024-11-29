async function fetchContexts() {
    try {
        const response = await fetch('/api/contexts'); // Endpoint backendu
        const data = await response.json();

        const contextList = document.getElementById('context-list');
        contextList.innerHTML = ''; // Czyszczenie listy

        data.forEach(context => {
            const li = document.createElement('li');
            li.textContent = `Sender: ${context.senderName}, Recipient: ${context.recipientName}`;
            contextList.appendChild(li);
        });
    } catch (error) {
        console.error('Error fetching contexts:', error);
    }
}

fetchContexts();
