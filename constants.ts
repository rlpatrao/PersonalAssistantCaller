import { FunctionDeclaration, Type } from "@google/genai";

// Tool to "execute" a phone call
export const EXECUTE_CALL_TOOL: FunctionDeclaration = {
  name: 'execute_call',
  description: 'Simulates making a phone call to a business or person. Use this when you have gathered all necessary information (recipient, number, objective). TRIGGER this tool to start the call process.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      recipientName: {
        type: Type.STRING,
        description: 'The name of the person or business to call.',
      },
      phoneNumber: {
        type: Type.STRING,
        description: 'The phone number to dial.',
      },
      objective: {
        type: Type.STRING,
        description: 'The primary goal or reason for the call.',
      },
      callScript: {
        type: Type.STRING,
        description: 'The exact script or questions you will say during the call.',
      },
    },
    required: ['recipientName', 'phoneNumber', 'objective'],
  },
};

// Tool to "search" for a number
export const FIND_NUMBER_TOOL: FunctionDeclaration = {
  name: 'find_business_number',
  description: 'Finds the phone number for a specific business or professional.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The name and location of the business to search for.',
      },
    },
    required: ['query'],
  },
};

// Tool to save user preferences to long term memory
export const SAVE_MEMORY_TOOL: FunctionDeclaration = {
  name: 'save_user_preference',
  description: 'Saves a detail about the user to long-term memory for future reference.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      preference: {
        type: Type.STRING,
        description: 'The fact or preference to remember (e.g., "User likes morning appointments", "User is allergic to penicillin").',
      },
    },
    required: ['preference'],
  },
};

export const SYSTEM_INSTRUCTION = `
You are VoxAgent, an advanced AI executive assistant.
Your goal is to manage phone calls on behalf of the user.

Operational Style:
1. **Voice First**: You are speaking to the user. Be concise, professional, and helpful.
2. **Transparent**: Narrate your actions so the user knows what you are doing. Say "I am searching for the number..." or "Dialing now...".
3. **Execution**: When you have the details, use the 'execute_call' tool. 
4. **Audible Simulation (CRITICAL)**: Since you cannot make real PSTN calls, you will SIMULATE the call audibly for the user to hear.
   - When you trigger 'execute_call', switching to "Call Mode".
   - You MUST ACT OUT the conversation. Speak your part (Assistant) AND simulate the response of the Recipient.
   - Use a slightly different tone or explicitly say "Recipient says: [text]" to distinguish the voices.
   - Example: "Hi, this is VoxAgent calling for John... (pause)... Recipient: Hello, how can I help?... Me: I'd like to book a table."
   - The user is LISTENING to this enactment.

5. **User Interruption / Taking Over**:
   - The user may speak to "Take Over" or give instructions mid-call.
   - If the user speaks, STOP your simulation immediately.
   - Listen to their instruction (e.g., "Ask for a booth instead").
   - Resume the simulation incorporating their new instruction.

Current User Memory Context:
{{USER_MEMORY}}

Task:
1. Understand who to call and why.
2. Search for info if missing.
3. Call (Simulate) and perform the task audibly.
4. Report back to the user.
`;