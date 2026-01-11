import { execSync } from 'child_process';

export const shellTools = [
  {
    name: "bash",
    description: "Execute a bash command in the shell. Use this for file operations (ls, find, grep, mv, rm, cp), running scripts, package management, git operations, and any other shell commands.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute"
        }
      },
      required: ["command"]
    }
  }
];

export function executeShellTool(toolName, toolInput) {
  if (toolName === "bash") {
    try {
      const output = execSync(toolInput.command, {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      return output;
    } catch (error) {
      return `Error: ${error.message}\nStderr: ${error.stderr || ''}`;
    }
  }

  return null;
}
