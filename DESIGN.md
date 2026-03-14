# tui-mud Design Document

## What is tui-mud?

**tui-mud** is a terminal-based chat interface for Claude (Anthropic's AI). It creates a split-screen TUI (Terminal User Interface) that combines a real-time chat area with a dedicated visual rendering area — similar in spirit to a MUD (Multi-User Dungeon), where an AI can describe, draw, and interact within a bounded terminal world.

Key capabilities:
- Chat with Claude in a scrollable history pane
- Claude can render visual content (ASCII art, diagrams, UI mockups) to a dedicated screen area
- Claude can execute shell commands and read/write files on the local machine
- Full keyboard navigation: type, scroll, resize-aware layout

---

## File Structure

```
tui-mud/
├── chat_tui.mjs          Entry point — creates and starts the UI
├── package.json          Dependencies (only @anthropic-ai/sdk)
├── lib/
│   ├── ui.mjs            Terminal rendering, layout, keyboard input
│   └── client.mjs        Anthropic API communication, tool-use loop
└── tools/
    ├── index.mjs         Tool registry and dispatcher
    ├── screen.mjs        render_screen tool — writes to visual area
    ├── shell.mjs         bash tool — executes shell commands
    └── filesystem.mjs    read_file / write_file / edit_file tools
```

---

## Components

### `chat_tui.mjs` — Entry Point

Minimal bootstrapper. Creates a `ChatTUI` instance and calls `init()`.

---

### `lib/ui.mjs` — `ChatTUI` class

Owns the entire terminal display and all user input. Responsible for:

- **Layout calculation**: Divides terminal rows into header, screen area, chat area, and input row. Recalculates on resize.
- **Rendering**: Writes ANSI escape sequences directly to `process.stdout` to draw borders, color-coded text, and cursor positioning.
- **Input handling**: Enables raw mode on `process.stdin`, captures keystrokes. Handles printable characters, Backspace, Enter, arrow keys (scroll), and Ctrl+C.
- **State**:
  - `inputBuffer` — the text being typed
  - `chatHistory` — array of rendered lines (user messages, Claude replies, tool notices)
  - `screenContent` — lines currently shown in the visual rendering area
  - `scrollOffset` / `screenScrollOffset` — scroll positions
  - `isWaiting` — blocks new input while Claude is responding

**Layout** (rows, top to bottom):

```
┌──────────────────────────────────┐
│ Header (3 rows)                  │
├──────────────────────────────────┤
│                                  │
│  Screen Area  (render_screen)    │  ~40% of terminal height
│                                  │
├──────────────────────────────────┤
│                                  │
│  Chat History  (scrollable)      │  ~remaining rows
│                                  │
└──────────────────────────────────┘
> input line
```

---

### `lib/client.mjs` — `MessageClient` class

Owns the conversation with Claude. Responsible for:

- **Message history**: Maintains the full `messages[]` array in Anthropic API format.
- **API calls**: Sends requests to `claude-sonnet-4-20250514` with `max_tokens: 8096`.
- **Tool-use loop**: After each API response, checks `stop_reason`. If `tool_use`, extracts tool calls, dispatches them via `tools/index.mjs`, collects results, and sends a follow-up `tool_result` message. Repeats until Claude stops calling tools.
- **UI bridge**: Holds a reference to the `ChatTUI` instance so it can call `addMessage()` for tool notifications and pass current screen dimensions to tools.

---

### `tools/index.mjs` — Tool Registry & Dispatcher

- Exports `toolDefinitions` — combined array of all tool schemas (used in API calls so Claude knows what tools are available).
- Exports `executeTool(name, input, uiInstance)` — routes a tool call by name to the correct handler module.
- Exports `getToolsWithScreenInfo(ui)` — injects live screen dimensions into the `render_screen` tool description so Claude knows the actual canvas size.

---

### `tools/screen.mjs` — `render_screen` tool

Accepts a `content` string from Claude, word-wraps it to the screen area width, and calls `ui.renderScreen(lines)` to update the visual pane. Each call replaces the previous content entirely.

---

### `tools/shell.mjs` — `bash` tool

Runs an arbitrary shell command via `execSync`. Returns combined stdout/stderr (up to 10 MB). Claude uses this for file operations, git, running scripts, etc.

---

### `tools/filesystem.mjs` — `read_file`, `write_file`, `edit_file` tools

| Tool | Behavior |
|------|----------|
| `read_file` | Returns full file contents given a path |
| `write_file` | Creates or overwrites a file |
| `edit_file` | String-replace within a file (validates exactly one match before replacing) |

---

## Component Interaction Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         Terminal (stdout/stdin)                   │
└───────────────────────────────┬──────────────────────────────────┘
                                │ keypress / resize events
                                ▼
                    ┌───────────────────────┐
                    │   ChatTUI  (ui.mjs)   │
                    │                       │
                    │  - renders layout     │
                    │  - manages input      │◄──────────────────────┐
                    │  - stores history     │                       │
                    └──────────┬────────────┘                       │
                               │ sendMessage()                      │
                               │ (user presses Enter)               │
                               ▼                                    │
                    ┌───────────────────────┐                       │
                    │ MessageClient         │                       │
                    │  (client.mjs)         │     addMessage()      │
                    │                       │  (tool notices,       │
                    │  - holds messages[]   │───reply text)─────────┘
                    │  - calls Anthropic    │
                    │  - runs tool loop     │
                    └──────────┬────────────┘
                               │ HTTPS  (@anthropic-ai/sdk)
                               ▼
                    ┌───────────────────────┐
                    │   Anthropic API       │
                    │  (Claude Sonnet 4)    │
                    └──────────┬────────────┘
                               │ response (text or tool_use blocks)
                               ▼
                    ┌───────────────────────┐
                    │  Tool Dispatcher      │
                    │  (tools/index.mjs)    │
                    └──────┬───────┬────────┘
              ┌────────────┘       └─────────────────┐
              ▼                                       ▼
  ┌─────────────────────┐              ┌──────────────────────────┐
  │  render_screen      │              │  bash / read_file /      │
  │  (tools/screen.mjs) │              │  write_file / edit_file  │
  │                     │              │  (shell.mjs /            │
  │  calls ui.render    │              │   filesystem.mjs)        │
  │  Screen(lines)      │              │                          │
  └──────────┬──────────┘              └──────────────────────────┘
             │ updates visual pane
             ▼
   ┌──────────────────────┐
   │   Screen Area in     │
   │   Terminal Display   │
   └──────────────────────┘
```

---

## Data Flow: User Message → Reply

1. User types text and presses **Enter**
2. `ChatTUI.sendMessage()` adds the message to `chatHistory`, calls `MessageClient.sendMessage(text)`
3. `MessageClient` appends `{role: 'user', content: text}` to `messages[]`, calls Anthropic API
4. API returns a response
5. **If `stop_reason === 'tool_use'`**:
   - Extract each `tool_use` block (tool name + input)
   - Call `executeTool(name, input, ui)` → runs the appropriate handler
   - `render_screen` updates the visual pane immediately; `bash`/filesystem tools return results as strings
   - Append `{role: 'assistant', content: <tool_use blocks>}` and `{role: 'user', content: <tool_result blocks>}` to `messages[]`
   - Call API again with updated history
   - Repeat until `stop_reason !== 'tool_use'`
6. Extract the final text response, call `ChatTUI.addMessage('claude', text)`
7. `ChatTUI.render()` redraws the terminal

---

## State Summary

| Location | State | Purpose |
|----------|-------|---------|
| `ChatTUI` | `inputBuffer` | Characters typed so far |
| `ChatTUI` | `chatHistory[]` | All rendered chat lines |
| `ChatTUI` | `screenContent[]` | Current visual pane lines |
| `ChatTUI` | `scrollOffset`, `screenScrollOffset` | Scroll positions |
| `ChatTUI` | `isWaiting` | Locks input during API call |
| `MessageClient` | `messages[]` | Full conversation history sent to API |

---

## Configuration

| Setting | Location | Value |
|---------|----------|-------|
| Model | `lib/client.mjs` | `claude-sonnet-4-20250514` |
| Max tokens | `lib/client.mjs` | `8096` |
| API key | `lib/client.mjs` | `ANTHROPIC_API_KEY` env var |
| Shell buffer | `tools/shell.mjs` | 10 MB |
| Min terminal size | `lib/ui.mjs` | 20 cols × 15 rows |
