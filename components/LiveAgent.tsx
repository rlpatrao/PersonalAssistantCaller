import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, decodeAudioData } from '../utils/audioUtils';
import { EXECUTE_CALL_TOOL, FIND_NUMBER_TOOL, SAVE_MEMORY_TOOL, SYSTEM_INSTRUCTION } from '../constants';
import { getMemory, saveCall, updateMemory } from '../services/storageService';
import Visualizer from './Visualizer';
import { CallRecord, LogEntry, TranscriptEntry, AgentState } from '../types';

interface LiveAgentProps {
  onCallComplete: () => void;
  initialContext?: string;
}

const LiveAgent: React.FC<LiveAgentProps> = ({ onCallComplete, initialContext }) => {
  const [agentState, setAgentState] = useState<AgentState>(AgentState.IDLE);
  const agentStateRef = useRef<AgentState>(AgentState.IDLE);
  const [error, setError] = useState<string | null>(null);
  
  // Audio State
  const [isMicMuted, setIsMicMuted] = useState(false);
  const isMicMutedRef = useRef(false);

  // Data for UI
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [activeCallDetails, setActiveCallDetails] = useState<{ recipient: string, number: string } | null>(null);
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  
  // State tracking for partial transcripts
  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');

  // Initialization state
  const isInitializingRef = useRef(false);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);

  // Sync ref with state
  useEffect(() => {
    agentStateRef.current = agentState;
  }, [agentState]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  // --- Helper Methods ---

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [
      ...prev, 
      { id: Math.random().toString(36).substr(2, 9), time: new Date().toLocaleTimeString(), message, type }
    ]);
  };

  const updateTranscript = (speaker: 'user' | 'agent', text: string, isFinal: boolean) => {
    setTranscripts(prev => {
      const last = prev[prev.length - 1];
      // If the last entry is from the same speaker and not final, update it
      if (last && last.speaker === speaker && !last.isFinal) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: text, isFinal: isFinal, timestamp: new Date().toLocaleTimeString() }
        ];
      }
      // Otherwise add new entry
      return [
        ...prev,
        { 
          id: Math.random().toString(36).substr(2, 9), 
          speaker, 
          text, 
          timestamp: new Date().toLocaleTimeString(), 
          isFinal 
        }
      ];
    });
  };

  // Scroll to bottom of logs/transcripts
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);


  // --- Audio Lifecycle ---

  const stopAudio = useCallback(() => {
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (inputContextRef.current) {
      inputContextRef.current.close();
      inputContextRef.current = null;
    }
    sourcesRef.current.forEach(source => {
      try { source.stop(); } catch(e) {}
    });
    sourcesRef.current.clear();
    setAgentState(AgentState.IDLE);
    setActiveCallDetails(null);
    isInitializingRef.current = false;
    addLog("Session ended", 'alert');
  }, []);

  const connectToLiveAPI = async () => {
    if (isInitializingRef.current || agentState !== AgentState.IDLE) return;
    isInitializingRef.current = true;
    setError(null);
    setAgentState(AgentState.CONNECTING);
    addLog("Initializing audio contexts...", 'info');

    try {
      if (!process.env.API_KEY) throw new Error("API Key not found in environment.");

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioContextClass({ sampleRate: 16000 });
      const outputCtx = new AudioContextClass({ sampleRate: 24000 });
      
      inputContextRef.current = inputCtx;
      audioContextRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      addLog("Requesting microphone access...", 'info');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = inputCtx.createMediaStreamSource(stream);
      const scriptProcessor = inputCtx.createScriptProcessor(4096, 1, 1);
      
      source.connect(scriptProcessor);
      scriptProcessor.connect(inputCtx.destination);

      const memory = getMemory();
      const memoryStr = memory.preferences.length > 0 ? memory.preferences.join("; ") : "No prior preferences.";
      const fullSystemInstruction = SYSTEM_INSTRUCTION.replace("{{USER_MEMORY}}", memoryStr) + (initialContext ? `\nUser's Current Request Context: ${initialContext}` : "");

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            addLog("Connected to Gemini Live API", 'success');
            setAgentState(AgentState.LISTENING);
            isInitializingRef.current = false;
            
            scriptProcessor.onaudioprocess = (e) => {
              if (!sessionRef.current) return;
              
              // MUTE LOGIC: If muted, do not send audio data
              if (isMicMutedRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionRef.current.sendRealtimeInput({ media: pcmBlob });
            };
          },
          onmessage: async (message: LiveServerMessage) => {
             // 1. Handle Transcription
             if (message.serverContent?.outputTranscription) {
                const text = message.serverContent.outputTranscription.text;
                currentOutputTransRef.current += text;
                updateTranscript('agent', currentOutputTransRef.current, false);
             } else if (message.serverContent?.inputTranscription) {
                const text = message.serverContent.inputTranscription.text;
                currentInputTransRef.current += text;
                updateTranscript('user', currentInputTransRef.current, false);
             }

             if (message.serverContent?.turnComplete) {
                if (currentInputTransRef.current) {
                  updateTranscript('user', currentInputTransRef.current, true);
                  currentInputTransRef.current = '';
                }
                if (currentOutputTransRef.current) {
                   updateTranscript('agent', currentOutputTransRef.current, true);
                   currentOutputTransRef.current = '';
                   setAgentState(AgentState.LISTENING); // Back to listening after turn
                }
             }

             // 2. Handle Tool Calls
             if (message.toolCall) {
               addLog("Tool Triggered", 'tool');
               const functionResponses = [];
               for (const fc of message.toolCall.functionCalls) {
                 addLog(`Executing: ${fc.name}`, 'info');
                 let result: any = { result: "Success" };
                 
                 if (fc.name === 'execute_call') {
                   const { recipientName, phoneNumber, objective, callScript } = fc.args as any;
                   setActiveCallDetails({ recipient: recipientName, number: phoneNumber });
                   setAgentState(AgentState.IN_CALL);
                   
                   // Auto-mute user when call starts so they can hear the simulation
                   setIsMicMuted(true); 
                   addLog(`📞 Call Active: ${recipientName}. Mic Muted for listening.`, 'alert');
                   
                   // Simulate a delay for the "connection"
                   await new Promise(r => setTimeout(r, 1500));
                   addLog("📞 Connected - Agent Simulating Conversation", 'success');

                   const newCall: CallRecord = {
                     id: Math.random().toString(36).substr(2, 9),
                     timestamp: Date.now(),
                     recipient: recipientName,
                     summary: `Called ${phoneNumber}. Objective: ${objective}.`,
                     status: 'completed',
                     context: callScript || objective
                   };
                   saveCall(newCall);
                   onCallComplete();
                   
                   result = { status: "Call executed.", note: "You are now connected. ACT OUT the conversation audibly for the user." };
                 } else if (fc.name === 'find_business_number') {
                   addLog(`Searching for: ${(fc.args as any).query}`, 'info');
                   await new Promise(r => setTimeout(r, 1000)); // Simulate search latency
                   result = { phoneNumber: "555-0199", businessName: (fc.args as any).query, address: "123 Mock Lane" };
                   addLog("Found number: 555-0199", 'success');
                 } else if (fc.name === 'save_user_preference') {
                   const { preference } = fc.args as any;
                   updateMemory([preference]);
                   addLog(`Memory Updated: ${preference}`, 'success');
                   result = { status: "Memory saved" };
                 }

                 functionResponses.push({
                   id: fc.id,
                   name: fc.name,
                   response: result
                 });
               }
               
               if (sessionRef.current) {
                 sessionRef.current.sendToolResponse({ functionResponses });
               }
             }

             // 3. Handle Audio Output
             const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
             if (base64Audio && outputCtx) {
                if (agentStateRef.current !== AgentState.IN_CALL) {
                   setAgentState(AgentState.SPEAKING);
                }
                const audioBuffer = await decodeAudioData(
                  base64ToUint8Array(base64Audio),
                  outputCtx
                );
                
                const sourceNode = outputCtx.createBufferSource();
                sourceNode.buffer = audioBuffer;
                sourceNode.connect(analyser);
                analyser.connect(outputCtx.destination);

                sourceNode.addEventListener('ended', () => {
                  sourcesRef.current.delete(sourceNode);
                });

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                sourceNode.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
                sourcesRef.current.add(sourceNode);
             }
             
             // 4. Handle Interruption
             if (message.serverContent?.interrupted) {
               addLog("Agent interrupted by user", 'alert');
               sourcesRef.current.forEach(s => s.stop());
               sourcesRef.current.clear();
               nextStartTimeRef.current = 0;
               currentOutputTransRef.current = ''; // Clear partial output transcript
               setAgentState(AgentState.LISTENING);
             }
          },
          onclose: () => {
            addLog("Connection closed", 'alert');
            stopAudio();
          },
          onerror: (err: any) => {
            console.error('Live API Error', err);
            setError("Connection error. Check console.");
            addLog(`Error: ${err.message}`, 'error');
            stopAudio();
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {}, 
          outputAudioTranscription: {},
          systemInstruction: fullSystemInstruction,
          tools: [
             { functionDeclarations: [EXECUTE_CALL_TOOL, FIND_NUMBER_TOOL, SAVE_MEMORY_TOOL] }
          ]
        }
      };

      const sessionPromise = ai.live.connect(config);
      sessionPromise.then(session => {
        sessionRef.current = session;
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to start session");
      addLog(`Setup Error: ${err.message}`, 'error');
      isInitializingRef.current = false;
      setAgentState(AgentState.IDLE);
    }
  };

  const base64ToUint8Array = (base64: string) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  const toggleMute = () => {
    const newState = !isMicMuted;
    setIsMicMuted(newState);
    addLog(newState ? "Microphone Muted" : "Microphone Active", 'info');
  };

  const handleTakeOver = () => {
    setIsMicMuted(false);
    addLog("User Taking Over - Mic Active", 'alert');
  };

  // --- Render ---

  return (
    <div className="w-full max-w-6xl mx-auto h-[70vh] flex gap-4">
       
       {/* Left Column: Visualizer, Status, Controls */}
       <div className="w-1/3 flex flex-col gap-4">
          
          {/* Main Visualizer Card */}
          <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 flex flex-col items-center justify-between min-h-[300px] relative overflow-hidden">
             
             {/* Status Badge */}
             <div className="absolute top-4 left-4 flex gap-2">
                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                  agentState === AgentState.IDLE ? 'bg-gray-700 text-gray-400' :
                  agentState === AgentState.CONNECTING ? 'bg-blue-900 text-blue-300 animate-pulse' :
                  agentState === AgentState.IN_CALL ? 'bg-green-900 text-green-300 animate-pulse' :
                  agentState === AgentState.SPEAKING ? 'bg-purple-900 text-purple-300' :
                  'bg-yellow-900 text-yellow-300'
                }`}>
                  {agentState.replace('_', ' ')}
                </div>
                {agentState !== AgentState.IDLE && (
                   <div className={`px-2 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                     isMicMuted ? 'border-red-500 text-red-400' : 'border-green-500 text-green-400'
                   }`}>
                     {isMicMuted ? 'Mic Off' : 'Mic On'}
                   </div>
                )}
             </div>

             {/* Center Graphic */}
             <div className="w-full h-32 my-auto relative flex items-center justify-center">
                {agentState === AgentState.IDLE ? (
                   <div className="text-gray-600 text-6xl">🎙️</div>
                ) : (
                   <Visualizer analyser={analyserRef.current} isActive={true} />
                )}
             </div>

             {/* Controls */}
             <div className="w-full mt-4 flex justify-center gap-2">
                {agentState === AgentState.IDLE ? (
                   <button 
                     onClick={connectToLiveAPI}
                     className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg transition transform hover:scale-105 flex items-center justify-center gap-2"
                   >
                     <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                     Start Session
                   </button>
                ) : (
                   <>
                      <button 
                        onClick={toggleMute}
                        className={`p-4 rounded-xl font-bold shadow-lg transition transform hover:scale-105 flex items-center justify-center ${isMicMuted ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-700 hover:bg-gray-600'}`}
                        title={isMicMuted ? "Unmute" : "Mute"}
                      >
                         {isMicMuted ? (
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor"/><line x1="17" y1="17" x2="23" y2="23" stroke="currentColor" strokeWidth={2}/></svg>
                         ) : (
                           <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                         )}
                      </button>
                      <button 
                        onClick={stopAudio}
                        className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg transition transform hover:scale-105 flex items-center justify-center gap-2"
                      >
                        End
                      </button>
                   </>
                )}
             </div>
             
             {error && <div className="absolute bottom-16 text-red-400 text-xs px-2 text-center w-full">{error}</div>}
          </div>

          {/* Active Call Details Card (Simulation) */}
          {activeCallDetails && (
             <div className="bg-green-900/20 border border-green-500/30 rounded-2xl p-6 shadow-lg animate-pulse-slow relative overflow-hidden">
                <div className="flex items-center gap-3 mb-2 relative z-10">
                   <div className="w-3 h-3 bg-green-500 rounded-full animate-ping"></div>
                   <h3 className="text-green-400 font-bold uppercase text-sm">On Call</h3>
                </div>
                <div className="text-white text-xl font-bold truncate relative z-10">{activeCallDetails.recipient}</div>
                <div className="text-green-300/70 font-mono relative z-10">{activeCallDetails.number}</div>
                <div className="mt-4 text-xs text-gray-400 relative z-10">
                   <p className="mb-2">Agent is enacting the call. Listen in...</p>
                </div>
                
                {/* Take Over Control */}
                <button 
                   onClick={handleTakeOver}
                   disabled={!isMicMuted}
                   className={`relative z-10 mt-2 w-full py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${
                      !isMicMuted 
                      ? 'bg-blue-600/50 text-blue-200 cursor-default' 
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg animate-bounce'
                   }`}
                >
                  {!isMicMuted ? (
                     <><span>🎤 You are Live</span></>
                  ) : (
                     <><span>✋ Take Over Call</span></>
                  )}
                </button>

                {/* Background decoration */}
                <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-green-500/10 rounded-full blur-2xl"></div>
             </div>
          )}

       </div>

       {/* Middle Column: Transcript */}
       <div className="w-1/3 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-800 bg-gray-800/50">
             <h3 className="text-gray-400 text-xs font-bold uppercase tracking-wider">Live Transcription</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth" ref={transcriptContainerRef}>
             {transcripts.length === 0 && (
                <div className="h-full flex items-center justify-center text-gray-600 text-sm italic text-center px-6">
                   Conversation will appear here...
                </div>
             )}
             {transcripts.map((t) => (
                <div key={t.id} className={`flex flex-col ${t.speaker === 'user' ? 'items-end' : 'items-start'}`}>
                   <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      t.speaker === 'user' 
                      ? 'bg-blue-600 text-white rounded-br-none' 
                      : 'bg-gray-700 text-gray-200 rounded-bl-none'
                   }`}>
                      {t.text}
                   </div>
                   <span className="text-[10px] text-gray-500 mt-1 px-1">
                      {t.speaker === 'user' ? 'You' : 'Agent'} • {t.timestamp}
                   </span>
                </div>
             ))}
          </div>
       </div>

       {/* Right Column: Logs */}
       <div className="w-1/3 bg-black rounded-2xl border border-gray-800 overflow-hidden flex flex-col font-mono">
          <div className="p-4 border-b border-gray-900 bg-gray-900">
             <h3 className="text-gray-500 text-xs font-bold uppercase tracking-wider">System Logs</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2 text-xs" ref={logsContainerRef}>
             {logs.length === 0 && (
                <div className="text-gray-700 italic">System ready. Waiting for session...</div>
             )}
             {logs.map((log) => (
                <div key={log.id} className="flex gap-2">
                   <span className="text-gray-600 shrink-0">[{log.time}]</span>
                   <span className={`${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'alert' ? 'text-yellow-400' :
                      log.type === 'tool' ? 'text-purple-400' :
                      'text-blue-300'
                   }`}>
                      {log.type === 'tool' && '🔧 '}
                      {log.message}
                   </span>
                </div>
             ))}
          </div>
       </div>
       
    </div>
  );
};

export default LiveAgent;