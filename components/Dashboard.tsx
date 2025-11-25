import React from 'react';
import { CallRecord, UserMemory } from '../types';

interface DashboardProps {
  calls: CallRecord[];
  memory: UserMemory;
  onClearHistory: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ calls, memory, onClearHistory }) => {
  return (
    <div className="w-full max-w-4xl mx-auto space-y-8">
      
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h3 className="text-gray-400 text-sm font-medium uppercase">Total Calls</h3>
          <p className="text-3xl font-bold text-white mt-2">{calls.length}</p>
        </div>
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h3 className="text-gray-400 text-sm font-medium uppercase">Successful</h3>
          <p className="text-3xl font-bold text-green-400 mt-2">
            {calls.filter(c => c.status === 'completed').length}
          </p>
        </div>
        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
          <h3 className="text-gray-400 text-sm font-medium uppercase">Knowledge Bits</h3>
          <p className="text-3xl font-bold text-purple-400 mt-2">{memory.preferences.length}</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Call History */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Call History</h2>
            <button 
              onClick={onClearHistory}
              className="text-xs text-red-400 hover:text-red-300 underline"
            >
              Clear Data
            </button>
          </div>
          
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden min-h-[300px]">
            {calls.length === 0 ? (
              <div className="flex items-center justify-center h-full p-8 text-gray-500">
                No calls made yet. Start a session to make a call.
              </div>
            ) : (
              <ul className="divide-y divide-gray-700">
                {calls.map(call => (
                  <li key={call.id} className="p-4 hover:bg-gray-750 transition">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-white">{call.recipient}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        call.status === 'completed' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'
                      }`}>
                        {call.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mb-2">{new Date(call.timestamp).toLocaleString()}</p>
                    <p className="text-sm text-gray-300 bg-gray-900 p-3 rounded-lg border border-gray-700">
                      {call.summary}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Long Term Memory */}
        <div className="space-y-4">
           <h2 className="text-xl font-bold text-white">Learned Preferences</h2>
           <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 min-h-[300px]">
             {memory.preferences.length === 0 ? (
                <p className="text-gray-500 text-sm text-center mt-10">
                  The agent hasn't learned anything about you yet. Tell it your preferences during a call.
                </p>
             ) : (
               <ul className="space-y-2">
                 {memory.preferences.map((pref, idx) => (
                   <li key={idx} className="flex items-start gap-2 text-sm text-gray-300">
                     <span className="text-purple-400 mt-1">•</span>
                     <span>{pref}</span>
                   </li>
                 ))}
               </ul>
             )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;