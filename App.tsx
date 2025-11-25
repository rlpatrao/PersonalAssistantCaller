import React, { useState, useEffect } from 'react';
import LiveAgent from './components/LiveAgent';
import Dashboard from './components/Dashboard';
import { getCalls, getMemory, clearHistory } from './services/storageService';
import { CallRecord, UserMemory } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'agent'>('dashboard');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [memory, setMemory] = useState<UserMemory>({ preferences: [], lastInteraction: 0 });
  const [initialContext, setInitialContext] = useState('');

  // Hydrate state on load
  const loadData = () => {
    setCalls(getCalls());
    setMemory(getMemory());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear all history and memory?')) {
      clearHistory();
      loadData();
    }
  };

  const handleCallComplete = () => {
    loadData();
    // Optional: Auto switch to dashboard?
    // setActiveTab('dashboard');
  };

  const handleStartCallTask = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveTab('agent');
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans selection:bg-blue-500 selection:text-white">
      
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight">VoxAgent</h1>
          </div>
          
          <nav className="flex gap-1 bg-gray-800 p-1 rounded-lg">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'dashboard' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('agent')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                activeTab === 'agent' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-white'
              }`}
            >
              Live Agent
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <div className="space-y-12">
            
            {/* Quick Action Hero */}
            <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-500/20 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-white">Who needs to be called?</h2>
                <p className="text-gray-300 max-w-lg">
                  Enter a quick context to prime the agent before connecting. E.g., "Call Domino's and order a pepperoni pizza."
                </p>
              </div>
              <form onSubmit={handleStartCallTask} className="flex-1 w-full max-w-md flex flex-col gap-3">
                <input 
                  type="text" 
                  value={initialContext}
                  onChange={(e) => setInitialContext(e.target.value)}
                  placeholder="E.g., Book a dentist appointment for next week..."
                  className="w-full bg-gray-900/80 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition placeholder-gray-500"
                />
                <button 
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg shadow-lg shadow-blue-600/20 transition"
                >
                  Open Agent
                </button>
              </form>
            </div>

            <Dashboard 
              calls={calls} 
              memory={memory} 
              onClearHistory={handleClearHistory} 
            />
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
             <div className="text-center space-y-2">
               <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
                 Voice Command Center
               </h2>
               <p className="text-gray-400">
                 {initialContext ? `Context: "${initialContext}"` : "Talk to the agent to initiate calls, manage tasks, or update preferences."}
               </p>
             </div>
             
             <LiveAgent 
                onCallComplete={handleCallComplete} 
                initialContext={initialContext}
             />

             <div className="max-w-lg text-center text-sm text-gray-500">
               <p>The agent uses Gemini 2.5 Live API to understand your voice in real-time. It can "execute" calls (simulated) and remember details about you.</p>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;