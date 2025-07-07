<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# Legacy Device Debugger MCP Server

This is an MCP server project specifically designed for debugging legacy devices behind proxies in OT (Operational Technology) environments. The server automates the process of identifying and fixing proxy-related issues through custom header rewrite rules.

## Project Context

- **Domain**: Legacy OT device proxy debugging
- **Primary Use Case**: Support teams debugging proxy issues without involving dev teams
- **Key Technologies**: Playwright for browser automation, MCP SDK for tool interfaces
- **Target Environment**: Industrial/OT networks with legacy devices

## Key Features

1. **Automated Page Analysis**: Uses Playwright to load and analyze device web interfaces
2. **Custom Header Rewrite Rules**: Generates appropriate proxy configuration rules
3. **Systematic Debugging Workflow**: Follows established debugging procedures
4. **Network Error Detection**: Identifies 404/500 errors and connection issues
5. **Device IP/Hostname Detection**: Automatically detects problematic URL patterns

## Debugging Workflow

The server implements this systematic debugging approach:
1. Enable default rules and analyze basic page loading
2. Check for partial content loading issues
3. Identify broken images and links pointing to device IP
4. Detect WebSocket connection problems
5. Check for redirects to device IP/hostname
6. Perform curl-like header analysis
7. Generate appropriate rewrite rules

## MCP Tools Available

- `analyze-device-page`: Complete page analysis with issue detection
- `curl-analysis`: HTTP header analysis similar to curl commands
- `generate-rewrite-rules`: Create specific rewrite rules for common issues
- `debug-workflow`: Run the complete debugging workflow

## Code Guidelines

- Use TypeScript with strict type checking
- Follow the established debugging workflow patterns
- Generate actionable rewrite rules in the correct format
- Include proper error handling for network operations
- Use Playwright for browser automation and network monitoring

You can find more info and examples at https://modelcontextprotocol.io/llms-full.txt
