import { config } from 'dotenv';
config();

import { ChatTUI } from './lib/ui.mjs';

// Start the chat
const chat = new ChatTUI();
chat.init();
