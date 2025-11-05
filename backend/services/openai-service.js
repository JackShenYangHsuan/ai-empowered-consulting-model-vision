/**
 * OpenAI Service
 * 
 * Wrapper for OpenAI API calls.
 * 
 * Design decisions:
 * - Centralized error handling
 * - Token usage tracking
 * - Retry logic for rate limits
 * - Streaming support for future
 */

const OpenAI = require('openai');

class OpenAIService {
    constructor(apiKey, model = 'gpt-4o-mini', config = null) {
        this.apiKey = apiKey;
        this.model = model;
        this.client = null;
        this.config = config;

        if (apiKey) {
            this.client = new OpenAI({ apiKey });
        }
    }

    /**
     * Initialize or update API key
     */
    initialize(apiKey, model, config = null) {
        this.apiKey = apiKey;
        this.model = model || this.model;
        this.client = new OpenAI({ apiKey });
        if (config) {
            this.config = config;
        }
    }

    /**
     * Check if service is configured
     */
    isConfigured() {
        return !!this.client;
    }

    /**
     * Check if OpenAI is enabled in settings
     */
    isEnabled() {
        if (!this.config) return true; // If no config provided, assume enabled for backwards compatibility
        const settings = this.config.settings || {};
        const openaiSettings = settings.apis?.openai || {};
        return openaiSettings.enabled !== false;
    }

    /**
     * Chat completion
     */
    async chat({ systemPrompt, messages, maxTokens = 2000, temperature = 0.7, mcpServers = [] }) {
        if (!this.isConfigured()) {
            throw new Error('OpenAI service not configured. Please set API key in settings.');
        }

        if (!this.isEnabled()) {
            throw new Error('OpenAI is disabled in settings. Please enable it to use AI agents.');
        }

        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🤖 OPENAI SERVICE CHAT CALLED`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📦 MCP Servers Received: ${Array.isArray(mcpServers) ? mcpServers.length : 'NOT AN ARRAY'}`);
        if (Array.isArray(mcpServers)) {
            console.log(`📦 MCP Servers Data:`, JSON.stringify(mcpServers, null, 2));
        }

        try {
            const activeMCPs = mcpServers.filter(mcp => mcp && (mcp.url || mcp.endpoint));
            console.log(`\n✅ Active MCPs after filtering: ${activeMCPs.length}`);

            // If MCPs are available, use function calling to integrate them
            if (activeMCPs.length > 0) {
                console.log(`\n🔌 MCP INTEGRATION ACTIVE - ENTERING MCP MODE`);
                console.log(`📡 ${activeMCPs.length} MCP server(s) available to AI:`);
                activeMCPs.forEach((mcp, i) => {
                    const label = mcp.label || mcp.name || 'Unknown';
                    const url = mcp.url || mcp.endpoint || '';
                    console.log(`   ${i + 1}. ${label} - ${url}`);
                });

                // Detect if there are any document URLs in the messages that need parsing
                const allMessageContent = messages.map(m => m.content || '').join(' ') + ' ' + systemPrompt;
                // Match PDFs, Word docs, Google Docs, etc.
                const hasDocumentUrl = /https?:\/\/[^\s]+\.(?:pdf|docx?)|https?:\/\/(?:docs|drive)\.google\.com\/(?:document|file)/i.test(allMessageContent);

                console.log(`\n🔍 DOCUMENT URL DETECTION:`);
                console.log(`   → Message content length: ${allMessageContent.length}`);
                console.log(`   → Content preview: ${allMessageContent.substring(0, 500)}...`);
                console.log(`   → Has document URL: ${hasDocumentUrl}`);

                // Convert MCP servers to OpenAI function definitions
                const functions = activeMCPs.map(mcp => ({
                    name: `mcp_${(mcp.label || mcp.name || 'server').toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                    description: `CRITICAL: Use this function to parse and extract real content from documents. This ${mcp.label || mcp.name} server retrieves actual document text and data. ALWAYS call this when a document URL is mentioned in the task. Extract the EXACT URL from the user's task/message and pass it to this function.`,
                    parameters: {
                        type: 'object',
                        properties: {
                            action: {
                                type: 'string',
                                description: 'Always use "parse_document" to extract document content',
                                enum: ['parse_document']
                            },
                            url: {
                                type: 'string',
                                description: 'The EXACT URL of the document from the user\'s task (must be a real URL like https://example.com/file.pdf, NOT a placeholder)',
                            }
                        },
                        required: ['action', 'url']
                    }
                }));

                console.log(`\n📋 MCP FUNCTION DEFINITIONS:`);
                functions.forEach((func, i) => {
                    console.log(`   ${i + 1}. Function: ${func.name}`);
                    console.log(`      Description: ${func.description.substring(0, 100)}...`);
                    console.log(`      Required params: ${func.parameters.required.join(', ')}`);
                });

                // Format messages
                const formattedMessages = [
                    { role: 'system', content: systemPrompt },
                    ...messages
                ];

                console.log(`\n💬 MESSAGES BEING SENT:`);
                console.log(`   → System prompt: ${systemPrompt.substring(0, 200)}...`);
                console.log(`   → User messages: ${messages.length}`);

                // First API call with function definitions
                console.log(`\n📞 Making OpenAI call with ${functions.length} MCP function(s) available...`);

                // If document URL detected, FORCE the function call
                const callOptions = {
                    model: this.model,
                    messages: formattedMessages,
                    functions: functions,
                    max_tokens: maxTokens,
                    temperature
                };

                // Force function call if document URL is present
                if (hasDocumentUrl && functions.length > 0) {
                    console.log(`⚡ Document URL detected - FORCING MCP function call: ${functions[0].name}`);
                    callOptions.function_call = { name: functions[0].name };
                } else {
                    callOptions.function_call = 'auto';
                }

                let response = await this.client.chat.completions.create(callOptions);

                // Check if AI wants to call a function
                const firstMessage = response.choices[0].message;

                if (firstMessage.function_call) {
                    console.log(`\n🎯 MCP FUNCTION CALL DETECTED:`);
                    console.log(`   Function: ${firstMessage.function_call.name}`);
                    console.log(`   Arguments: ${firstMessage.function_call.arguments}`);

                    // Parse function call
                    const functionName = firstMessage.function_call.name;
                    const functionArgs = JSON.parse(firstMessage.function_call.arguments);

                    // Find the corresponding MCP server
                    const mcpIndex = functions.findIndex(f => f.name === functionName);
                    if (mcpIndex >= 0) {
                        const mcp = activeMCPs[mcpIndex];

                        // Call the actual MCP server
                        console.log(`📡 Calling MCP server: ${mcp.label || mcp.name}`);
                        const mcpResult = await this.callMCPServer(mcp, functionArgs);

                        // Check if MCP call failed
                        if (mcpResult.success === false || mcpResult.error) {
                            console.log(`❌ MCP call returned error, skipping synthesis`);
                            // Don't send error back to OpenAI - just return it directly to user
                            return `I encountered an issue while trying to parse the document:\n\n${mcpResult.error}\n\n${mcpResult.suggestion || ''}`;
                        }

                        console.log(`✅ MCP server responded with ${JSON.stringify(mcpResult).length} characters`);

                        // Add function call and result to conversation
                        formattedMessages.push(firstMessage);
                        formattedMessages.push({
                            role: 'function',
                            name: functionName,
                            content: JSON.stringify(mcpResult)
                        });

                        // Second API call with function result
                        console.log(`📞 Sending MCP result back to OpenAI for synthesis...`);
                        response = await this.client.chat.completions.create({
                            model: this.model,
                            messages: formattedMessages,
                            max_tokens: maxTokens,
                            temperature
                        });
                    }
                }

                console.log(`\n✅ MCP MODE: Returning response`);
                return response.choices[0].message.content;
            } else {
                console.log(`\n⚠️ NO MCP MODE: activeMCPs.length = ${activeMCPs.length}`);
            }

            // Standard chat completion without MCP
            console.log(`\n📞 STANDARD MODE: Making regular OpenAI call (no MCPs)`);
            const formattedMessages = [
                { role: 'system', content: systemPrompt },
                ...messages
            ];

            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: formattedMessages,
                max_tokens: maxTokens,
                temperature
            });

            console.log(`✅ STANDARD MODE: Returning response`);
            return response.choices[0].message.content;

        } catch (error) {
            console.error('OpenAI API error:', error);

            if (error.status === 429) {
                throw new Error('Rate limit exceeded. Please try again in a moment.');
            } else if (error.status === 401) {
                throw new Error('Invalid API key. Please check your settings.');
            } else {
                throw new Error(`OpenAI error: ${error.message}`);
            }
        }
    }

    /**
     * Call an MCP server using JSON-RPC 2.0 format
     */
    async callMCPServer(mcp, args) {
        const url = mcp.url || mcp.endpoint;

        try {
            console.log(`\n📡 CALLING MCP SERVER:`);
            console.log(`   → Server: ${mcp.label || mcp.name}`);
            console.log(`   → Endpoint: ${url}`);
            console.log(`   → Method: ${args.action || 'parse_document'}`);
            console.log(`   → Document URL: ${args.url}`);
            console.log(`   → Options:`, JSON.stringify(args.options || {}));

            // Convert Google Docs URLs to exportable format
            let fileUrl = args.url;
            if (fileUrl.includes('docs.google.com/document')) {
                // Extract document ID
                const match = fileUrl.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
                if (match) {
                    const docId = match[1];
                    fileUrl = `https://docs.google.com/document/d/${docId}/export?format=pdf`;
                    console.log(`   → Converted Google Docs URL to: ${fileUrl}`);
                }
            }

            // Prepare JSON-RPC 2.0 request payload for MCP
            const payload = {
                jsonrpc: '2.0',
                method: 'tools/call',
                params: {
                    name: args.action || 'parse_document',
                    arguments: {
                        file_url: fileUrl,
                        ...(args.options || {})
                    }
                },
                id: Date.now()
            };

            console.log(`   → JSON-RPC 2.0 payload:`, JSON.stringify(payload, null, 2));

            // Make HTTP request to MCP server
            const fetch = require('node-fetch');
            const startTime = Date.now();

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...(mcp.headers || {})
                },
                body: JSON.stringify(payload),
                timeout: 60000 // 60 second timeout
            });

            const duration = Date.now() - startTime;
            console.log(`   → Response status: ${response.status} ${response.statusText} (${duration}ms)`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`   → Error response:`, errorText);
                throw new Error(`MCP server returned ${response.status}: ${errorText || response.statusText}`);
            }

            const data = await response.json();
            console.log(`   → Response data size: ${JSON.stringify(data).length} characters`);
            console.log(`   → Full response:`, JSON.stringify(data, null, 2));

            // Check for JSON-RPC error
            if (data.error) {
                console.error(`   → JSON-RPC Error: ${data.error.code} - ${data.error.message}`);
                throw new Error(`MCP server error: ${data.error.message} (code: ${data.error.code})`);
            }

            // Extract result from JSON-RPC response
            const result = data.result || data;
            console.log(`   → Parsed result:`, JSON.stringify(result).substring(0, 300) + '...');

            console.log(`✅ MCP call successful!\n`);
            return result;

        } catch (error) {
            console.error(`\n❌ MCP CALL FAILED:`);
            console.error(`   → Error: ${error.message}`);
            console.error(`   → Stack:`, error.stack);

            // Return a user-friendly error message instead of throwing
            // This allows the AI to continue and inform the user about the issue
            return {
                success: false,
                error: `Unable to parse document: ${error.message.includes('Failed to download') ? 'Document is not publicly accessible or URL is invalid' : 'Document format not supported or file is corrupted'}`,
                suggestion: error.message.includes('Failed to download')
                    ? 'Please ensure the document is publicly accessible (e.g., set Google Doc to "Anyone with link can view")'
                    : 'Please try a different PDF file or verify the document is not corrupted'
            };
        }
    }

    /**
     * Test API connection
     */
    async test() {
        try {
            const response = await this.chat({
                systemPrompt: 'You are a helpful assistant.',
                messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
                maxTokens: 10
            });
            return { success: true, message: response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = OpenAIService;
