# Legacy Device Debugger MCP Server

An MCP (Model Context Protocol) server specifically designed for debugging legacy devices behind proxies in OT (Operational Technology) environments. This server helps support teams identify and fix proxy-related issues independently using custom header rewrite rules, eliminating the need to escalate to development teams.

## Overview

Legacy devices in OT environments often have issues working behind proxies due to hardcoded IP addresses, hostname references, and outdated web technologies. This MCP server automates the debugging process and generates appropriate rewrite rules to fix these issues.

## Features

### 🔍 **Automated Page Analysis**
- Loads device web interfaces using Playwright
- Detects network errors, console errors, and loading issues
- Identifies broken resources and problematic URL patterns
- Checks for WebSocket connection problems

### 🛠️ **Custom Header Rewrite Rules Generation**
- Automatically generates proxy configuration rules
- Supports various rule types: header manipulation, body rewriting, redirects
- Handles common issues like device IP references and broken links

### 📋 **Systematic Debugging Workflow**
- Follows established OT debugging procedures
- Provides step-by-step analysis and recommendations
- Generates actionable results for support teams

### 🌐 **Network Analysis**
- Performs curl-like header analysis
- Detects redirects to device IP/hostname
- Identifies CSP and other proxy-blocking headers

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd legacy-device-debugger-mcp

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Build the project
npm run build
```

## Usage

### As an MCP Server

Add to your MCP client configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "legacy-device-debugger": {
      "command": "node",
      "args": ["/absolute/path/to/legacy-device-debugger-mcp/build/index.js"]
    }
  }
}
```

### Available Tools

#### 1. `analyze-device-page`
Comprehensive analysis of a device's web interface.

**Parameters:**
- `deviceUrl` (string): URL of the legacy device's web interface
- `timeout` (number, optional): Timeout in milliseconds (default: 30000)

**Example:**
```
Please analyze this legacy device: http://192.168.1.100:8080
```

#### 2. `curl-analysis`
HTTP header analysis similar to curl commands.

**Parameters:**
- `deviceUrl` (string): URL of the legacy device

**Example:**
```
Perform curl analysis on http://192.168.1.100:8080
```

#### 3. `generate-rewrite-rules`
Generate specific rewrite rules for common issues.

**Parameters:**
- `issueType`: Type of issue (device_ip_references, broken_links, image_loading, etc.)
- `deviceUrl`: Device URL
- `problemPattern` (optional): Specific pattern causing issues
- `targetPath` (optional): Specific path needing rewriting

**Example:**
```
Generate rewrite rules for broken_links issue on http://192.168.1.100:8080
```

#### 4. `debug-workflow`
Complete debugging workflow following OT best practices.

**Parameters:**
- `deviceUrl`: URL of the legacy device
- `deviceIP` (optional): Device IP address if known
- `deviceHostname` (optional): Device hostname if known

**Example:**
```
Run complete debug workflow for http://rtp-acl-bms:8080
```

## Debugging Workflow

The server follows this systematic approach:

1. **Enable Default Rules & Basic Analysis**
   - Check if web page loads at all
   - Identify partial loading issues
   - Detect broken images and resources

2. **Network Error Detection**
   - Monitor 404/500 errors
   - Check for connection failures
   - Identify requests to device IP/hostname

3. **Header Analysis**
   - Perform curl-like analysis
   - Check response headers for problematic patterns
   - Identify redirects and CSP issues

4. **Generate Rewrite Rules**
   - Create appropriate proxy configuration
   - Handle common patterns like device IP references
   - Generate header manipulation rules

5. **Provide Recommendations**
   - Actionable steps for support teams
   - Escalation guidance if needed
   - Direct access testing procedures

## Common Use Cases

### 1. Device References Hardcoded IPs
**Issue:** Device web interface references its own IP address in resources
**Solution:** Body rewrite rules to replace IP with external FQDN

### 2. Broken CSS/JS Loading
**Issue:** Stylesheets and scripts fail to load through proxy
**Solution:** Header rewrite rules and resource path corrections

### 3. WebSocket Connection Issues
**Issue:** WebSocket connections bypass proxy or fail
**Solution:** Protocol upgrade rules and hostname rewriting

### 4. Redirect to Device IP
**Issue:** Device redirects users to its internal IP
**Solution:** Location header rewrite rules

## Rewrite Rule Types

### Header Rules
```json
{
  "type": "header",
  "action": "add|replace|remove|append",
  "headerName": "X-Forwarded-Host",
  "headerValue": "{{DEVICE_EXTERNAL_FQDN}}"
}
```

### Body Rules
```json
{
  "type": "body",
  "action": "find_replace",
  "pattern": "rtp-acl-bms/static/jquery.min.js",
  "replacement": "{{DEVICE_EXTERNAL_FQDN}}/static/jquery.min.js"
}
```

### Redirect Rules
```json
{
  "type": "redirect",
  "action": "replace",
  "pattern": "{{DEVICE_IP}}",
  "replacement": "{{DEVICE_EXTERNAL_FQDN}}"
}
```

## Development

### Project Structure
```
├── src/
│   └── index.ts          # Main MCP server implementation
├── build/                # Compiled JavaScript
├── .vscode/
│   └── mcp.json         # MCP server configuration
├── .github/
│   └── copilot-instructions.md
└── README.md
```

### Building
```bash
npm run build
```

### Testing
```bash
# Test the server directly
npm run dev

# Test with MCP client
node build/index.js
```

## Configuration Variables

The server uses these placeholder variables in generated rules:

- `{{DEVICE_EXTERNAL_FQDN}}`: External FQDN for the device
- `{{DEVICE_INTERNAL_IP}}`: Internal IP address of the device
- `{{DEVICE_IP}}`: Generic device IP placeholder

## Troubleshooting

### Common Issues

1. **Playwright Installation**
   ```bash
   npx playwright install chromium
   ```

2. **Permission Errors**
   ```bash
   chmod +x build/index.js
   ```

3. **Module Resolution**
   Ensure `package.json` has `"type": "module"`

### Debug Mode
Set environment variable for verbose logging:
```bash
DEBUG=1 node build/index.js
```

## Contributing

1. Follow the established debugging workflow patterns
2. Add appropriate error handling for network operations
3. Generate actionable rewrite rules in the correct format
4. Include comprehensive documentation

## License

ISC License - see LICENSE file for details.

## Support

For issues with legacy device debugging:
1. Use the complete debug workflow first
2. Check generated rewrite rules
3. Test with direct device access
4. Escalate to DevOps team with analysis results
