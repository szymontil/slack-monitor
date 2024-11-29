import React, { useState, useEffect } from 'react';

const LogDisplay = () => {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await fetch('/api/logs');
                const data = await response.json();
                setLogs(data);
            } catch (error) {
                console.error('❌ Error fetching logs:', error);
            }
        };
        fetchLogs();
    }, []);

    return (
        <div className="logs-container">
            <h2>System Logs</h2>
            {logs.length === 0 ? (
                <p>No logs found.</p>
            ) : (
                logs.map((log, index) => (
                    <div className="log-item" key={index}>
                        <p><strong>Time:</strong> {log.timestamp}</p>
                        <p>{log.message}</p>
                    </div>
                ))
            )}
        </div>
    );
};

export default LogDisplay;
