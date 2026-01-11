import Anthropic from '@anthropic-ai/sdk';
import { tools, executeTool, getToolsWithScreenInfo } from '../tools/index.mjs';

const client = new Anthropic({
  apiKey: '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'//process.env.ANTHROPIC_API_KEY,
});

export class MessageClient {
  constructor(uiInstance = null) {
    this.messages = [];
    this.uiInstance = uiInstance;
  }

  async sendMessage(text, onToolUse = null) {
    this.messages.push({ role: 'user', content: text });

    // Get tools with current screen dimensions
    const toolsToUse = this.uiInstance
      ? getToolsWithScreenInfo(this.uiInstance.width, this.uiInstance.height)
      : tools;

    let response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8096,
      messages: this.messages,
      tools: toolsToUse
    });

    // Handle tool use loop
    while (response.stop_reason === 'tool_use') {
      const assistantContent = response.content;
      this.messages.push({ role: 'assistant', content: assistantContent });

      // Notify about tool usage
      if (onToolUse) {
        const toolUseBlocks = assistantContent.filter(block => block.type === 'tool_use');
        for (const toolBlock of toolUseBlocks) {
          onToolUse(toolBlock.name);
        }
      }

      // Execute all tools and collect results
      const toolResults = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          const result = executeTool(block.name, block.input, this.uiInstance);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result
          });
        }
      }

      // Send tool results back
      this.messages.push({ role: 'user', content: toolResults });

      // Get next response
      response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8096,
        messages: this.messages,
        tools: toolsToUse
      });
    }

    // Extract final text response
    const assistantContent = response.content;
    this.messages.push({ role: 'assistant', content: assistantContent });

    const textBlock = assistantContent.find(block => block.type === 'text');
    return textBlock?.text || 'No response';
  }
}
