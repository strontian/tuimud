export const screenTools = [
  {
    name: "render_screen",
    description: "Render content to the top screen area of the TUI. Use this to display ASCII art, UI mockups, diagrams, or any visual content. The screen area is {WIDTH} columns wide by {HEIGHT} rows tall. Content will be displayed in a dedicated viewport above the chat area. Each call replaces previous content.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content to render. Can be multi-line. Will be wrapped to fit screen width. Use newlines (\\n) to control line breaks."
        }
      },
      required: ["content"]
    }
  }
];

export function executeScreenTool(toolName, toolInput, uiInstance) {
  if (toolName === "render_screen") {
    if (!uiInstance) {
      return "Error: UI instance not available";
    }

    uiInstance.updateScreen(toolInput.content);
    return `Screen updated with ${toolInput.content.split('\n').length} lines`;
  }

  return null;
}
