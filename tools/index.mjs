import { filesystemTools, executeFilesystemTool } from './filesystem.mjs';
import { shellTools, executeShellTool } from './shell.mjs';
import { screenTools, executeScreenTool } from './screen.mjs';

export const tools = [...filesystemTools, ...shellTools, ...screenTools];

export function executeTool(toolName, toolInput, uiInstance = null) {
  const result =
    executeFilesystemTool(toolName, toolInput) ||
    executeShellTool(toolName, toolInput) ||
    executeScreenTool(toolName, toolInput, uiInstance);

  if (result === null) {
    return `Error: Unknown tool ${toolName}`;
  }

  return result;
}

export function getToolsWithScreenInfo(width, height) {
  return tools.map(tool => {
    if (tool.name === 'render_screen') {
      // Calculate actual screen area dimensions
      const availableHeight = height - 5;
      const screenHeight = Math.floor(availableHeight / 2);
      const screenWidth = width - 2;

      return {
        ...tool,
        description: tool.description
          .replace('{WIDTH}', screenWidth)
          .replace('{HEIGHT}', screenHeight)
      };
    }
    return tool;
  });
}
