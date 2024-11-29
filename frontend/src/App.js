import React from 'react';
import ActiveContexts from './components/ActiveContexts';
import LogDisplay from './components/LogDisplay';
import Header from './components/Header';
import './App.css';

const App = () => {
    return (
        <div className="app-container">
            <Header />
            <main className="main-content">
                <ActiveContexts />
                <LogDisplay />
            </main>
        </div>
    );
};

export default App;
