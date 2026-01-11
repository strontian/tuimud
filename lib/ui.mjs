import readline from 'readline';
import process from 'process';
import { MessageClient } from './client.mjs';

// ANSI escape codes
const CLEAR_SCREEN = '\x1b[2J';
const MOVE_CURSOR = (row, col) => `\x1b[${row};${col}H`;
const CLEAR_LINE = '\x1b[2K';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const ALT_SCREEN = '\x1b[?1049h'; // Enable alternate screen buffer
const MAIN_SCREEN = '\x1b[?1049l'; // Restore main screen buffer
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';

export class ChatTUI {
  constructor() {
    this.client = new MessageClient(this);
    this.chatHistory = [];
    this.inputBuffer = '';
    this.width = process.stdout.columns;
    this.height = process.stdout.rows;

    // Calculate split-screen layout
    const availableHeight = this.height - 5; // Total minus header(3) + input(2)
    this.screenAreaHeight = Math.floor(availableHeight / 2);
    this.chatAreaHeight = availableHeight - this.screenAreaHeight - 1; // -1 for middle separator

    this.screenContent = [];
    this.screenScrollOffset = 0;
    this.scrollOffset = 0;
    this.isWaiting = false;
  }

  init() {
    // Enable alternate screen buffer (prevents terminal scrollback)
    process.stdout.write(ALT_SCREEN);

    // Setup raw mode
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // Handle resize
    process.stdout.on('resize', () => {
      this.width = process.stdout.columns;
      this.height = process.stdout.rows;

      // Recalculate split-screen layout
      const availableHeight = this.height - 5;
      this.screenAreaHeight = Math.floor(availableHeight / 2);
      this.chatAreaHeight = availableHeight - this.screenAreaHeight - 1;

      this.render();
    });

    // Handle keypress
    process.stdin.on('keypress', (str, key) => {
      this.handleKeypress(str, key);
    });

    // Initial render
    this.render();
    this.addSystemMessage('Welcome to Claude Chat! Type your message and press Enter. Press Ctrl+C to exit.');
  }

  handleKeypress(str, key) {
    // Always allow Ctrl+C to exit
    if (key.ctrl && key.name === 'c') {
      this.cleanup();
      process.exit(0);
    }

    // Always allow scrolling with arrow keys
    if (key.name === 'up') {
      // Scroll chat up (see older messages)
      this.scrollOffset = Math.min(this.scrollOffset + 1, Math.max(0, this.chatHistory.length - this.chatAreaHeight));
      this.render();
      return;
    } else if (key.name === 'down') {
      // Scroll chat down (see newer messages)
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.render();
      return;
    } else if (key.name === 'left') {
      // Scroll screen up (see older content)
      this.screenScrollOffset = Math.min(this.screenScrollOffset + 1, Math.max(0, this.screenContent.length - this.screenAreaHeight));
      this.render();
      return;
    } else if (key.name === 'right') {
      // Scroll screen down (see newer content)
      this.screenScrollOffset = Math.max(0, this.screenScrollOffset - 1);
      this.render();
      return;
    }

    // Block other input when waiting
    if (this.isWaiting) return;

    if (key.name === 'return') {
      if (this.inputBuffer.trim()) {
        this.sendMessage(this.inputBuffer.trim());
        this.inputBuffer = '';
      }
    } else if (key.name === 'backspace') {
      this.inputBuffer = this.inputBuffer.slice(0, -1);
    } else if (str && !key.ctrl && !key.meta) {
      this.inputBuffer += str;
    }

    this.render();
  }

  wrapText(text, width) {
    // Minimum width to prevent crashes
    const minWidth = 10;
    const safeWidth = Math.max(width, minWidth);

    const allLines = [];
    // First split by newlines to preserve them
    const paragraphs = text.split('\n');

    for (const paragraph of paragraphs) {
      if (paragraph === '') {
        // Preserve empty lines
        allLines.push('');
        continue;
      }

      const words = paragraph.split(' ');
      let currentLine = '';

      for (const word of words) {
        // If word is longer than width, truncate it
        const truncatedWord = word.length > safeWidth ? word.substring(0, safeWidth - 3) + '...' : word;

        if (currentLine.length + truncatedWord.length + 1 <= safeWidth) {
          currentLine += (currentLine ? ' ' : '') + truncatedWord;
        } else {
          if (currentLine) allLines.push(currentLine);
          currentLine = truncatedWord;
        }
      }
      if (currentLine) allLines.push(currentLine);
    }

    return allLines.length > 0 ? allLines : [''];
  }

  addMessage(role, content) {
    const prefix = role === 'user' ? `${BOLD}${BLUE}You:${RESET} ` : `${BOLD}${GREEN}Claude:${RESET} `;
    const prefixLen = role === 'user' ? 5 : 8;
    const contentWidth = this.width - prefixLen - 2;
    const lines = this.wrapText(content, contentWidth);

    this.chatHistory.push(prefix + lines[0]);
    for (let i = 1; i < lines.length; i++) {
      this.chatHistory.push(' '.repeat(prefixLen) + lines[i]);
    }

    // Auto-scroll to bottom when new message arrives
    this.scrollOffset = 0;
  }

  addSystemMessage(content) {
    const lines = this.wrapText(`${DIM}${content}${RESET}`, this.width - 2);
    this.chatHistory.push(...lines);
    this.scrollOffset = 0;
  }

  updateScreen(content) {
    // Replace mode: clear existing screenContent
    this.screenContent = [];

    // Split content into lines and wrap each line to fit width
    const lines = content.split('\n');
    for (const line of lines) {
      const wrapped = this.wrapText(line, this.width - 2);
      this.screenContent.push(...wrapped);
    }

    // Auto-scroll to top on new render
    this.screenScrollOffset = 0;
    this.render();
  }

  async sendMessage(text) {
    this.addMessage('user', text);
    this.isWaiting = true;
    this.render();

    try {
      const response = await this.client.sendMessage(text, (toolName) => {
        this.addSystemMessage(`[Tool: ${toolName}]`);
        this.render();
      });

      this.addMessage('assistant', response);
    } catch (error) {
      this.addSystemMessage(`Error: ${error.message}`);
    }

    this.isWaiting = false;
    this.render();
  }

  render() {
    // Minimum dimensions to prevent crashes
    const minWidth = 20;
    const minHeight = 15;

    if (this.width < minWidth || this.height < minHeight) {
      let output = CLEAR_SCREEN;
      output += MOVE_CURSOR(1, 1);
      output += `${BOLD}${YELLOW}Terminal too small!${RESET}`;
      output += MOVE_CURSOR(2, 1);
      output += `Min: ${minWidth}x${minHeight}`;
      output += MOVE_CURSOR(3, 1);
      output += `Current: ${this.width}x${this.height}`;
      process.stdout.write(output);
      return;
    }

    let output = CLEAR_SCREEN;

    // Draw header
    output += MOVE_CURSOR(1, 1);
    output += `${BOLD}${CYAN}${'='.repeat(this.width)}${RESET}`;
    output += MOVE_CURSOR(2, 1);
    const title = ' Claude Chat TUI ';
    const padding = Math.floor((this.width - title.length) / 2);
    output += `${BOLD}${CYAN}${' '.repeat(Math.max(0, padding))}${title}${' '.repeat(Math.max(0, this.width - padding - title.length))}${RESET}`;
    output += MOVE_CURSOR(3, 1);
    output += `${BOLD}${CYAN}${'='.repeat(this.width)}${RESET}`;

    // Draw screen area
    const screenStartRow = 4;
    const screenStartIdx = Math.max(0, this.screenContent.length - this.screenAreaHeight - this.screenScrollOffset);
    const screenEndIdx = Math.min(this.screenContent.length, screenStartIdx + this.screenAreaHeight);

    for (let i = 0; i < this.screenAreaHeight; i++) {
      output += MOVE_CURSOR(screenStartRow + i, 1);
      output += CLEAR_LINE;
      const lineIdx = screenStartIdx + i;
      if (lineIdx < screenEndIdx) {
        output += this.screenContent[lineIdx];
      }
    }

    // Draw middle separator
    const middleSeparatorRow = screenStartRow + this.screenAreaHeight;
    output += MOVE_CURSOR(middleSeparatorRow, 1);
    output += `${BOLD}${CYAN}${'='.repeat(this.width)}${RESET}`;

    // Draw chat area
    const chatStartRow = middleSeparatorRow + 1;
    const chatStartIdx = Math.max(0, this.chatHistory.length - this.chatAreaHeight - this.scrollOffset);
    const chatEndIdx = Math.min(this.chatHistory.length, chatStartIdx + this.chatAreaHeight);

    for (let i = 0; i < this.chatAreaHeight; i++) {
      output += MOVE_CURSOR(chatStartRow + i, 1);
      output += CLEAR_LINE;
      const lineIdx = chatStartIdx + i;
      if (lineIdx < chatEndIdx) {
        output += this.chatHistory[lineIdx];
      }
    }

    // Draw input area
    const inputRow = this.height - 1;
    output += MOVE_CURSOR(inputRow, 1);
    output += `${BOLD}${CYAN}${'='.repeat(this.width)}${RESET}`;

    output += MOVE_CURSOR(this.height, 1);
    output += CLEAR_LINE;
    const prompt = this.isWaiting ? `${YELLOW}[Waiting...]${RESET} ` : `${BOLD}${YELLOW}>${RESET} `;
    const displayInput = this.inputBuffer.length > this.width - 10
      ? '...' + this.inputBuffer.slice(-(this.width - 13))
      : this.inputBuffer;
    output += prompt + displayInput;

    // Position cursor at end of input
    const cursorCol = (this.isWaiting ? 15 : 3) + displayInput.length;
    output += MOVE_CURSOR(this.height, Math.min(cursorCol, this.width));
    output += SHOW_CURSOR;

    process.stdout.write(output);
  }

  cleanup() {
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(MAIN_SCREEN); // Restore main screen buffer
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  }
}
