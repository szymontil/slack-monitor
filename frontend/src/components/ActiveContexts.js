import React, { useState, useEffect } from 'react';

const ActiveContexts = () => {
    const [contexts, setContexts] = useState([]);

    useEffect(() => {
        const fetchContexts = async () => {
            try {
                const response = await fetch('/api/contexts');
                const data = await response.json();
                setContexts(data);
            } catch (error) {
                console.error('❌ Error fetching contexts:', error);
            }
        };
        fetchContexts();
    }, []);

    return (
        <div className="contexts-container">
            <h2>Active Contexts</h2>
            {contexts.length === 0 ? (
                <p>No active contexts found.</p>
            ) : (
                contexts.map((context, index) => (
                    <div className="context-item" key={index}>
                        <p><strong>Sender:</strong> {context.sender}</p>
                        <p><strong>Recipient:</strong> {context.recipient}</p>
                    </div>
                ))
            )}
        </div>
    );
};

export default ActiveContexts;
