import fs from 'fs';

export const filesystemTools = [
  {
    name: "read_file",
    description: "Read the complete contents of a file from the filesystem. Returns the full file content as a string.",
    input_schema: {
      type: "object",
      properties: {
        filepath: {
          type: "string",
          description: "Absolute or relative path to the file to read"
        }
      },
      required: ["filepath"]
    }
  },
  {
    name: "write_file",
    description: "Create a new file or completely overwrite an existing file with provided content. Use this for new files or when you want to replace entire file contents.",
    input_schema: {
      type: "object",
      properties: {
        filepath: {
          type: "string",
          description: "Path where the file should be created or overwritten"
        },
        content: {
          type: "string",
          description: "Complete content to write to the file"
        }
      },
      required: ["filepath", "content"]
    }
  },
  {
    name: "edit_file",
    description: "Edit a file by replacing a specific string with new content. The old_str must exist exactly once in the file. Use this for surgical edits to avoid rewriting entire files.",
    input_schema: {
      type: "object",
      properties: {
        filepath: {
          type: "string",
          description: "Path to the file to edit"
        },
        old_str: {
          type: "string",
          description: "Exact string to find and replace (must appear exactly once in the file)"
        },
        new_str: {
          type: "string",
          description: "String to replace old_str with (use empty string to delete)"
        }
      },
      required: ["filepath", "old_str", "new_str"]
    }
  }
];

export function executeFilesystemTool(toolName, toolInput) {
  if (toolName === "read_file") {
    try {
      return fs.readFileSync(toolInput.filepath, 'utf8');
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  if (toolName === "write_file") {
    try {
      fs.writeFileSync(toolInput.filepath, toolInput.content, 'utf8');
      return `Successfully wrote to ${toolInput.filepath}`;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  if (toolName === "edit_file") {
    try {
      const content = fs.readFileSync(toolInput.filepath, 'utf8');
      const occurrences = (content.match(new RegExp(
        toolInput.old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'
      )) || []).length;

      if (occurrences === 0) {
        return `Error: String not found in file`;
      }
      if (occurrences > 1) {
        return `Error: String appears ${occurrences} times (must be unique)`;
      }

      const newContent = content.replace(toolInput.old_str, toolInput.new_str);
      fs.writeFileSync(toolInput.filepath, newContent, 'utf8');
      return `Successfully edited ${toolInput.filepath}`;
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  return null;
}
