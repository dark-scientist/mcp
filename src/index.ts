#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import chalk from 'chalk';
import { chromium, Browser, Page } from 'playwright';

interface ThoughtData {
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;
}

interface RewriteRule {
  type: "header" | "body" | "default";
  action: "find_replace" | "add" | "replace" | "remove" | "append" | "enable";
  pattern?: string;
  replacement?: string;
  headerName?: string;
  headerValue?: string;
  path?: string;
  condition?: string;
  description: string;
  priority: number;
}

interface NetworkRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  status?: number;
  responseHeaders?: Record<string, string>;
  body?: string;
  isPrivateAPI: boolean;
  isDeviceIP: boolean;
  error?: string;
}

interface ConsoleError {
  type: string;
  message: string;
  url?: string;
  lineNumber?: number;
  isMimeType: boolean;
  isBootstrapJS: boolean;
}

class OTDeviceDebugThinkingServer {
  private thoughtHistory: ThoughtData[] = [];
  private branches: Record<string, ThoughtData[]> = {};
  private disableThoughtLogging: boolean;
  private browser: Browser | null = null;
  private page: Page | null = null;
  
  private debugContext = {
    deviceUrl: '',
    deviceIP: '',
    deviceHostname: '',
    currentStep: '',
    
    // Step 1: Enable default rules (automatic)
    defaultRulesEnabled: false,
    
    // Step 2: Page loading analysis
    pageLoadStatus: '', // 'not_loaded' | 'partially_loaded' | 'fully_loaded'
    
    // Step 3: Resource analysis
    brokenImages: [] as string[],
    brokenLinks: [] as string[],
    deviceIPReferences: [] as string[],
    
    // Step 4: WebSocket analysis
    websocketIssues: [] as string[],
    
    // Step 5: Redirect analysis
    redirects: [] as any[],
    
    // Step 6: Network and console error analysis
    networkRequests: [] as NetworkRequest[],
    consoleErrors: [] as ConsoleError[],
    
    // Step 7: Curl analysis
    curlResults: {} as any,
    
    // Generated rules
    rewriteRules: [] as RewriteRule[],
    
    // Issues found
    issues: [] as string[]
  };

  constructor() {
    this.disableThoughtLogging = (process.env.DISABLE_THOUGHT_LOGGING || "").toLowerCase() === "true";
  }

  private validateThoughtData(input: unknown): ThoughtData {
    const data = input as Record<string, unknown>;

    if (!data.thought || typeof data.thought !== 'string') {
      throw new Error('Invalid thought: must be a string');
    }
    if (!data.thoughtNumber || typeof data.thoughtNumber !== 'number') {
      throw new Error('Invalid thoughtNumber: must be a number');
    }
    if (!data.totalThoughts || typeof data.totalThoughts !== 'number') {
      throw new Error('Invalid totalThoughts: must be a number');
    }
    if (typeof data.nextThoughtNeeded !== 'boolean') {
      throw new Error('Invalid nextThoughtNeeded: must be a boolean');
    }

    return {
      thought: data.thought,
      thoughtNumber: data.thoughtNumber,
      totalThoughts: data.totalThoughts,
      nextThoughtNeeded: data.nextThoughtNeeded,
      isRevision: data.isRevision as boolean | undefined,
      revisesThought: data.revisesThought as number | undefined,
      branchFromThought: data.branchFromThought as number | undefined,
      branchId: data.branchId as string | undefined,
      needsMoreThoughts: data.needsMoreThoughts as boolean | undefined,
    };
  }

  private formatThought(thoughtData: ThoughtData): string {
    const { thoughtNumber, totalThoughts, thought, isRevision, revisesThought, branchFromThought, branchId } = thoughtData;

    let prefix = '';
    let context = '';

    if (isRevision) {
      prefix = chalk.yellow('🔄 OT Debug Revision');
      context = ` (revising step ${revisesThought})`;
    } else if (branchFromThought) {
      prefix = chalk.green('🌿 OT Debug Branch');
      context = ` (from step ${branchFromThought}, ID: ${branchId})`;
    } else {
      prefix = chalk.blue('🔧 OT Debug Step');
      context = '';
    }

    const header = `${prefix} ${thoughtNumber}/${totalThoughts}${context}`;
    const border = '─'.repeat(Math.max(header.length, thought.length) + 4);

    return `
┌${border}┐
│ ${header} │
├${border}┤
│ ${thought.padEnd(border.length - 2)} │
└${border}┘`;
  }

  private isDeviceIPOrHostname(url: string): boolean {
    if (!this.debugContext.deviceUrl) return false;
    
    try {
      const urlObj = new URL(url);
      const deviceUrlObj = new URL(this.debugContext.deviceUrl);
      
      // Check if hostname matches device hostname
      if (urlObj.hostname === deviceUrlObj.hostname) return true;
      
      // Check for private IP ranges
      const ipRegex = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/;
      return ipRegex.test(urlObj.hostname);
    } catch {
      return false;
    }
  }

  private isPrivateAPICall(url: string): boolean {
    return url.includes('/private-api/') || 
           url.includes('/api/private/') || 
           url.includes('/internal/') ||
           url.toLowerCase().includes('private');
  }

  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--ignore-certificate-errors', '--ignore-ssl-errors']
      });
    }
    if (!this.page) {
      const context = await this.browser.newContext({
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      this.page = await context.newPage();
      
      // Set up network monitoring
      this.page.on('request', (request) => {
        const networkRequest: NetworkRequest = {
          url: request.url(),
          method: request.method(),
          headers: request.headers(),
          isPrivateAPI: this.isPrivateAPICall(request.url()),
          isDeviceIP: this.isDeviceIPOrHostname(request.url())
        };
        this.debugContext.networkRequests.push(networkRequest);
      });

      this.page.on('response', async (response) => {
        const request = this.debugContext.networkRequests.find(r => r.url === response.url());
        if (request) {
          request.status = response.status();
          request.responseHeaders = response.headers();
          
          if (response.status() >= 400) {
            request.error = `HTTP ${response.status()}`;
          }
        }
      });

      this.page.on('console', (msg) => {
        const consoleError: ConsoleError = {
          type: msg.type(),
          message: msg.text(),
          url: msg.location()?.url,
          lineNumber: msg.location()?.lineNumber,
          isMimeType: msg.text().toLowerCase().includes('mime type'),
          isBootstrapJS: msg.text().toLowerCase().includes('bootstrap.js')
        };
        
        if (msg.type() === 'error' || consoleError.isMimeType || consoleError.isBootstrapJS) {
          this.debugContext.consoleErrors.push(consoleError);
        }
      });
    }
  }

  private async step1_EnableDefaultRules(): Promise<void> {
    if (this.debugContext.defaultRulesEnabled) return;
    
    this.debugContext.currentStep = "Step 1: Enable Default Rules";
    this.debugContext.defaultRulesEnabled = true;
    
    // Add default rules first as per OT workflow - always the first step
    this.debugContext.rewriteRules.push(
      {
        type: "default",
        action: "enable",
        description: "Enable default proxy rules - ALWAYS FIRST STEP",
        priority: 1
      },
      {
        type: "header",
        action: "add",
        headerName: "X-Forwarded-Host",
        headerValue: "{{DEVICE_EXTERNAL_FQDN}}",
        description: "Add forwarded host header for proper routing",
        priority: 2
      },
      {
        type: "header", 
        action: "add",
        headerName: "X-Forwarded-Proto",
        headerValue: "https",
        description: "Add forwarded protocol header for HTTPS",
        priority: 3
      },
      {
        type: "header",
        action: "replace",
        headerName: "Host",
        pattern: ".*",
        replacement: "{{DEVICE_INTERNAL_IP}}",
        description: "Replace host header with device internal IP",
        priority: 4
      }
    );
    
    this.debugContext.issues.push("Default rules enabled - baseline proxy configuration applied");
  }

  private async step2_AnalyzePageLoading(): Promise<void> {
    if (!this.debugContext.deviceUrl || !this.page) return;
    
    this.debugContext.currentStep = "Step 2: Analyze Page Loading Status";
    
    try {
      const response = await this.page.goto(this.debugContext.deviceUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });

      if (!response) {
        this.debugContext.pageLoadStatus = 'not_loaded';
        this.debugContext.issues.push("CRITICAL: Web page is not loaded at all - no response from device");
        return;
      }

      // Check for 400 hostname invalid error - common OT issue
      if (response.status() === 400) {
        this.debugContext.pageLoadStatus = 'not_loaded';
        this.debugContext.issues.push("ERROR 400 hostname invalid - device requires specific hostname");
        
        // Add hostname requirement rule
        this.debugContext.rewriteRules.push({
          type: "header",
          action: "add",
          headerName: "Host",
          headerValue: this.debugContext.deviceHostname || "{{DEVICE_HOSTNAME}}",
          description: "Fix hostname requirement for device (Error 400)",
          priority: 10
        });
        
        // Also add real IP requirement
        this.debugContext.rewriteRules.push({
          type: "header",
          action: "add",
          headerName: "X-Real-IP",
          headerValue: "{{DEVICE_REAL_IP}}",
          description: "Add real IP address for device authentication",
          priority: 11
        });
        return;
      }

      // Check for basic content
      const pageContent = await this.page.evaluate(() => {
        return {
          hasBody: !!document.body,
          bodyLength: document.body?.innerHTML.length || 0,
          hasLoginForm: !!(document.querySelector('input[type="password"]') || 
                           document.querySelector('[name="username"]') || 
                           document.querySelector('[name="password"]') ||
                           document.querySelector('.login') ||
                           document.querySelector('#login')),
          pageTitle: document.title,
          hasTryAgainMessage: document.body?.textContent?.toLowerCase().includes('try again') || false
        };
      });

      // Analyze page loading status
      if (!pageContent.hasBody || pageContent.bodyLength < 100) {
        this.debugContext.pageLoadStatus = 'not_loaded';
        this.debugContext.issues.push("Web page is not loaded at all - no content detected");
      } else if (!pageContent.hasLoginForm && response.status() !== 200) {
        this.debugContext.pageLoadStatus = 'partially_loaded';
        this.debugContext.issues.push("Web page is partially loaded - missing login elements");
      } else if (pageContent.hasLoginForm) {
        this.debugContext.pageLoadStatus = 'fully_loaded';
        this.debugContext.issues.push("Web page loaded successfully with login form detected");
      } else {
        this.debugContext.pageLoadStatus = 'fully_loaded';
      }

      // Check for "Try again" message - common after device upgrade
      if (pageContent.hasTryAgainMessage) {
        this.debugContext.issues.push("LOGIN ISSUE: 'Try again' message detected - common after device upgrade");
        this.debugContext.issues.push("RECOMMENDATION: Apply comprehensive rewrite rules and check for Alpha weblink requirement");
      }

    } catch (error) {
      this.debugContext.pageLoadStatus = 'not_loaded';
      this.debugContext.issues.push(`Page loading failed with error: ${error}`);
    }
  }

  private async step3_AnalyzeResources(): Promise<void> {
    if (!this.page) return;
    
    this.debugContext.currentStep = "Step 3: Analyze Resources (Images, Links, Static Files)";
    
    try {
      // Comprehensive resource analysis
      const resourceAnalysis = await this.page.evaluate(() => {
        const images = Array.from(document.querySelectorAll('img'));
        const links = Array.from(document.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>);
        const scripts = Array.from(document.querySelectorAll('script[src]') as NodeListOf<HTMLScriptElement>);
        const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]') as NodeListOf<HTMLLinkElement>);
        
        return {
          brokenImages: images
            .filter(img => !img.complete || img.naturalWidth === 0)
            .map(img => img.src),
          allImages: images.map(img => img.src).filter(src => src),
          
          deviceIPLinks: links
            .map(link => link.href)
            .filter(href => href && (href.includes('192.168.') || href.includes('10.') || href.includes('172.') || href.includes('127.'))),
          
          scriptSources: scripts
            .map(script => script.src)
            .filter(src => src && (src.includes('192.168.') || src.includes('10.') || src.includes('172.') || src.includes('127.') || !src.startsWith('http'))),
          
          stylesheetSources: stylesheets
            .map(link => link.href)
            .filter(href => href && (href.includes('192.168.') || href.includes('10.') || href.includes('172.') || href.includes('127.') || !href.startsWith('http'))),
          
          // Check for static resources pointing to device
          staticResources: [
            ...Array.from(document.querySelectorAll('[src]')).map(el => (el as HTMLElement).getAttribute('src')),
            ...Array.from(document.querySelectorAll('[href]')).map(el => (el as HTMLElement).getAttribute('href'))
          ].filter(src => src && (src.includes('/static/') || src.includes('/assets/') || src.includes('/js/') || src.includes('/css/')))
        };
      });

      // Process broken images
      this.debugContext.brokenImages = resourceAnalysis.brokenImages.filter(src => this.isDeviceIPOrHostname(src));
      
      if (this.debugContext.brokenImages.length > 0) {
        this.debugContext.issues.push(`RESOURCE ISSUE: Found ${this.debugContext.brokenImages.length} broken images pointing to device IP/hostname`);
        
        // Generate specific rules for each broken image
        this.debugContext.brokenImages.forEach(imgSrc => {
          try {
            const urlObj = new URL(imgSrc);
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: `${urlObj.hostname}${urlObj.pathname}`,
              replacement: `{{DEVICE_EXTERNAL_FQDN}}${urlObj.pathname}`,
              description: `Fix broken image resource: ${urlObj.pathname}`,
              priority: 20
            });
          } catch {
            // Handle relative URLs
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: imgSrc,
              replacement: imgSrc.replace(/^https?:\/\/[^\/]+/, "{{DEVICE_EXTERNAL_FQDN}}"),
              description: `Fix broken image: ${imgSrc}`,
              priority: 20
            });
          }
        });
      }

      // Process device IP links
      this.debugContext.brokenLinks = resourceAnalysis.deviceIPLinks;
      
      if (this.debugContext.brokenLinks.length > 0) {
        this.debugContext.issues.push(`LINK ISSUE: Found ${this.debugContext.brokenLinks.length} links pointing to device IP - links not working`);
        
        // Generate rules for device IP links
        this.debugContext.brokenLinks.forEach(link => {
          try {
            const urlObj = new URL(link);
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: `${urlObj.hostname}${urlObj.pathname}`,
              replacement: `{{DEVICE_EXTERNAL_FQDN}}${urlObj.pathname}`,
              description: `Fix device IP link: ${urlObj.pathname}`,
              priority: 21
            });
          } catch {
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: link,
              replacement: link.replace(/^https?:\/\/[^\/]+/, "{{DEVICE_EXTERNAL_FQDN}}"),
              description: `Fix device IP link: ${link}`,
              priority: 21
            });
          }
        });
      }

      // Process static resources (JS, CSS, etc.)
      const staticResources = [...resourceAnalysis.scriptSources, ...resourceAnalysis.stylesheetSources];
      if (staticResources.length > 0) {
        this.debugContext.issues.push(`STATIC RESOURCE ISSUE: Found ${staticResources.length} static resources that may need rewriting`);
        
        staticResources.forEach(resource => {
          if (resource.includes('/static/') || resource.includes('/assets/')) {
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: resource,
              replacement: resource.replace(/^https?:\/\/[^\/]+/, "{{DEVICE_EXTERNAL_FQDN}}"),
              description: `Fix static resource path: ${resource}`,
              priority: 22
            });
          }
        });
      }

    } catch (error) {
      this.debugContext.issues.push(`Resource analysis failed: ${error}`);
    }
  }

  private async step4_AnalyzeWebSocket(): Promise<void> {
    this.debugContext.currentStep = "Analyze WebSocket Connections";
    
    // Check if page uses WebSocket
    if (!this.page) return;
    
    try {
      const hasWebSocket = await this.page.evaluate(() => {
        return document.documentElement.innerHTML.includes('WebSocket') || 
               document.documentElement.innerHTML.includes('ws://') ||
               document.documentElement.innerHTML.includes('wss://');
      });

      if (hasWebSocket) {
        this.debugContext.websocketIssues.push("WebSocket connections detected");
        this.debugContext.issues.push("WebSocket connections detected - may need special proxy handling");
        
        // Generate WebSocket rules
        const deviceUrl = new URL(this.debugContext.deviceUrl);
        const commonPorts = [8080, 8081, 8443, 9001];
        
        commonPorts.forEach(port => {
          this.debugContext.rewriteRules.push({
            type: "body",
            action: "find_replace", 
            pattern: `ws://${deviceUrl.hostname}:${port}`,
            replacement: `wss://{{DEVICE_EXTERNAL_FQDN}}:${port}`,
            description: `Fix WebSocket connection on port ${port}`,
            priority: 30
          });
        });
      }
    } catch (error) {
      this.debugContext.issues.push(`WebSocket analysis failed: ${error}`);
    }
  }

  private async step5_AnalyzeRedirects(): Promise<void> {
    this.debugContext.currentStep = "Analyze Redirects";
    
    // Check network requests for redirects
    const redirects = this.debugContext.networkRequests.filter(req => 
      req.status && req.status >= 300 && req.status < 400
    );

    this.debugContext.redirects = redirects;
    
    if (redirects.length > 0) {
      this.debugContext.issues.push(`Found ${redirects.length} redirects - potential for redirect loops`);
      
      redirects.forEach(redirect => {
        if (redirect.responseHeaders?.location) {
          const location = redirect.responseHeaders.location;
          const portMatch = location.match(/:(\d+)/);
          
          if (portMatch) {
            const redirectPort = portMatch[1];
            this.debugContext.issues.push(`Device redirects to port ${redirectPort} - consider onboarding with this port`);
          }
          
          // Generate redirect fix rule
          this.debugContext.rewriteRules.push({
            type: "header",
            action: "replace",
            headerName: "Location",
            pattern: location,
            replacement: location.replace(/https?:\/\/[^\/]+/, "{{DEVICE_EXTERNAL_FQDN}}"),
            description: `Fix redirect to: ${location}`,
            priority: 40
          });
        }
      });
    }
  }

  private async step6_AnalyzeNetworkAndConsole(): Promise<void> {
    this.debugContext.currentStep = "Step 6: Analyze Network Failures and Console Errors";
    
    // Analyze network errors (404, 500) - critical for OT debugging
    const networkErrors = this.debugContext.networkRequests.filter(req => 
      req.status && req.status >= 400
    );

    if (networkErrors.length > 0) {
      this.debugContext.issues.push(`NETWORK ERRORS: Found ${networkErrors.length} network errors (404/500)`);
      
      networkErrors.forEach(error => {
        if (error.status === 404) {
          this.debugContext.issues.push(`404 ERROR: ${error.url} - resource not found`);
        } else if (error.status === 500) {
          this.debugContext.issues.push(`500 ERROR: ${error.url} - server error`);
        }
        
        // Fix static files from device IP
        if (error.isDeviceIP && (error.url.includes('/static/') || error.url.includes('/assets/') || error.url.includes('/js/') || error.url.includes('/css/'))) {
          try {
            const urlObj = new URL(error.url);
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: `${urlObj.hostname}${urlObj.pathname}`,
              replacement: `{{DEVICE_EXTERNAL_FQDN}}${urlObj.pathname}`,
              description: `Fix ${error.status} error for static resource: ${urlObj.pathname}`,
              priority: 50
            });
          } catch {
            // Handle malformed URLs
            this.debugContext.rewriteRules.push({
              type: "body",
              action: "find_replace",
              pattern: error.url,
              replacement: error.url.replace(/^https?:\/\/[^\/]+/, "{{DEVICE_EXTERNAL_FQDN}}"),
              description: `Fix ${error.status} error for: ${error.url}`,
              priority: 50
            });
          }
        }
      });
    }

    // Analyze console errors - critical for MIME type and bootstrap.js issues
    const mimeTypeErrors = this.debugContext.consoleErrors.filter(err => err.isMimeType);
    const bootstrapErrors = this.debugContext.consoleErrors.filter(err => err.isBootstrapJS);

    if (mimeTypeErrors.length > 0) {
      this.debugContext.issues.push(`MIME TYPE ISSUE: ${mimeTypeErrors.length} MIME type mismatch errors detected in console`);
      
      // Add Content-Type header fix
      this.debugContext.rewriteRules.push({
        type: "header",
        action: "add",
        headerName: "Content-Type",
        headerValue: "application/javascript",
        condition: "path ends with .js",
        description: "Fix MIME type mismatch for JavaScript files",
        priority: 60
      });
      
      // Also add CSS MIME type fix
      this.debugContext.rewriteRules.push({
        type: "header",
        action: "add",
        headerName: "Content-Type",
        headerValue: "text/css",
        condition: "path ends with .css",
        description: "Fix MIME type mismatch for CSS files",
        priority: 61
      });
    }

    if (bootstrapErrors.length > 0) {
      this.debugContext.issues.push(`BOOTSTRAP.JS ISSUE: Bootstrap.js HTTPS protocol issue detected (Reference: DSD-3756)`);
      this.debugContext.issues.push("ROOT CAUSE: Device configured as HTTP but accessed via HTTPS through RA portal");
      
      // Apply the exact fix from DSD-3756
      this.debugContext.rewriteRules.push({
        type: "body",
        action: "find_replace",
        pattern: "https",
        replacement: "spdy", 
        path: "bootstrap.js",
        description: "Fix bootstrap.js HTTPS protocol issue (DSD-3756) - Critical OT fix",
        priority: 70
      });
      
      this.debugContext.issues.push("NOTE: If bootstrap.js file is updated, this rule may need adjustment");
      this.debugContext.issues.push("ALTERNATIVE: If HTTPS is properly configured on device, onboard as HTTPS and remove this rule");
    }

    // Analyze private API calls - need JSON body rewrite
    const privateAPICalls = this.debugContext.networkRequests.filter(req => req.isPrivateAPI);
    if (privateAPICalls.length > 0) {
      this.debugContext.issues.push(`PRIVATE API ISSUE: Found ${privateAPICalls.length} private API calls - may need JSON body rewrite`);
      
      privateAPICalls.forEach(apiCall => {
        // Add JSON body rewrite for private API calls
        this.debugContext.rewriteRules.push({
          type: "body",
          action: "find_replace",
          pattern: "{{DEVICE_IP}}",
          replacement: "{{DEVICE_EXTERNAL_FQDN}}",
          path: apiCall.url.includes('/private-api/') ? '/private-api/*' : '/api/private/*',
          description: `JSON body rewrite for private API: ${apiCall.url}`,
          priority: 75
        });
      });
      
      this.debugContext.issues.push("IMPORTANT: Enable JSON body rewrite for private API endpoints");
    }

    // Check for common OT device console patterns
    this.debugContext.consoleErrors.forEach(error => {
      if (error.message.toLowerCase().includes('websocket')) {
        this.debugContext.issues.push(`WEBSOCKET CONSOLE ERROR: ${error.message}`);
      }
      if (error.message.toLowerCase().includes('cors')) {
        this.debugContext.issues.push(`CORS ERROR: ${error.message} - may need header rules`);
      }
      if (error.message.toLowerCase().includes('certificate')) {
        this.debugContext.issues.push(`SSL CERTIFICATE ERROR: ${error.message}`);
      }
    });
  }

  private async step7_PerformCurlAnalysis(): Promise<void> {
    this.debugContext.currentStep = "Step 7: Perform Detailed Curl Analysis";
    
    try {
      // Simulate curl -kv analysis
      const response = await fetch(this.debugContext.deviceUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'curl/7.68.0',
          'Accept': '*/*'
        }
      });

      this.debugContext.curlResults = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        url: response.url
      };

      this.debugContext.issues.push(`CURL ANALYSIS: HTTP ${response.status} ${response.statusText}`);

      // Analyze response headers for common OT issues
      const headers = this.debugContext.curlResults.headers;

      // Check Location header for redirects
      const locationHeader = headers['location'];
      if (locationHeader) {
        this.debugContext.issues.push(`REDIRECT DETECTED: Location header points to ${locationHeader}`);
        
        if (this.isDeviceIPOrHostname(locationHeader)) {
          this.debugContext.issues.push(`REDIRECT ISSUE: Location header contains device IP/hostname`);
          
          // Add Location header rewrite rule
          this.debugContext.rewriteRules.push({
            type: "header",
            action: "replace",
            headerName: "Location", 
            pattern: locationHeader,
            replacement: locationHeader.replace(/https?:\/\/[^\/]+/, "{{DEVICE_EXTERNAL_FQDN}}"),
            description: "Fix Location header hostname reference",
            priority: 80
          });
        }

        // Extract port from redirect for onboarding recommendation
        const portMatch = locationHeader.match(/:(\d+)/);
        if (portMatch) {
          const redirectPort = portMatch[1];
          this.debugContext.issues.push(`PORT RECOMMENDATION: Device redirects to port ${redirectPort} - consider onboarding with this port`);
          
          // Common OT device ports
          if (['443', '8443', '8501', '8080', '80'].includes(redirectPort)) {
            this.debugContext.issues.push(`KNOWN PORT: Port ${redirectPort} is a common OT device port`);
          }
        }
      }

      // Check for hostname requirements in Server header
      const serverHeader = headers['server'];
      if (serverHeader && (serverHeader.includes('hostname') || serverHeader.includes('Host'))) {
        this.debugContext.issues.push(`HOSTNAME REQUIREMENT: Server header indicates hostname requirement: ${serverHeader}`);
        
        this.debugContext.rewriteRules.push({
          type: "header",
          action: "add",
          headerName: "Host",
          headerValue: "{{DEVICE_HOSTNAME}}",
          description: "Server requires specific hostname",
          priority: 81
        });
      }

      // Check for authentication headers
      const wwwAuth = headers['www-authenticate'];
      if (wwwAuth) {
        this.debugContext.issues.push(`AUTHENTICATION: ${wwwAuth}`);
        if (wwwAuth.includes('realm')) {
          const realmMatch = wwwAuth.match(/realm="([^"]+)"/);
          if (realmMatch) {
            this.debugContext.issues.push(`AUTH REALM: ${realmMatch[1]}`);
          }
        }
      }

      // Check for CSP headers that might block resources
      const csp = headers['content-security-policy'];
      if (csp) {
        this.debugContext.issues.push(`CSP DETECTED: Content Security Policy may block proxy resources`);
        if (csp.includes('localhost') || csp.includes('127.0.0.1') || csp.includes('192.168.')) {
          this.debugContext.issues.push(`CSP ISSUE: Policy contains local references that may cause issues`);
        }
      }

      // Check for HSTS
      const hsts = headers['strict-transport-security'];
      if (hsts) {
        this.debugContext.issues.push(`HSTS DETECTED: ${hsts} - may affect HTTP to HTTPS transitions`);
      }

      // Check Set-Cookie for domain issues
      const setCookie = headers['set-cookie'];
      if (setCookie) {
        if (setCookie.includes('domain=') && this.isDeviceIPOrHostname(setCookie)) {
          this.debugContext.issues.push(`COOKIE DOMAIN ISSUE: Set-Cookie contains device domain - may need rewrite`);
          
          this.debugContext.rewriteRules.push({
            type: "header",
            action: "replace",
            headerName: "Set-Cookie",
            pattern: "domain=[^;]+",
            replacement: "domain={{DEVICE_EXTERNAL_FQDN}}",
            description: "Fix cookie domain reference",
            priority: 82
          });
        }
      }

      // Check for X-Frame-Options that might affect embedding
      const xFrame = headers['x-frame-options'];
      if (xFrame && (xFrame.includes('DENY') || xFrame.includes('SAMEORIGIN'))) {
        this.debugContext.issues.push(`X-FRAME-OPTIONS: ${xFrame} - may prevent iframe embedding in RA portal`);
      }

    } catch (error) {
      this.debugContext.issues.push(`Curl analysis failed: ${error}`);
      this.debugContext.issues.push("RECOMMENDATION: Try accessing device directly via jbox browser for manual analysis");
    }
  }

  private async closeBrowser(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  public async processLegacyDeviceDebug(input: unknown): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
    try {
      const validatedInput = this.validateThoughtData(input);
      const thought = validatedInput.thought;

      // Extract device URL from thought
      const urlMatch = thought.match(/https?:\/\/[^\s]+/);
      if (urlMatch && !this.debugContext.deviceUrl) {
        this.debugContext.deviceUrl = urlMatch[0];
        const urlObj = new URL(this.debugContext.deviceUrl);
        this.debugContext.deviceIP = urlObj.hostname;
        this.debugContext.deviceHostname = urlObj.hostname;
      }

      if (validatedInput.thoughtNumber > validatedInput.totalThoughts) {
        validatedInput.totalThoughts = validatedInput.thoughtNumber;
      }

      this.thoughtHistory.push(validatedInput);

      if (validatedInput.branchFromThought && validatedInput.branchId) {
        if (!this.branches[validatedInput.branchId]) {
          this.branches[validatedInput.branchId] = [];
        }
        this.branches[validatedInput.branchId].push(validatedInput);
      }

      // Execute the OT debugging workflow steps based on thought content
      if (thought.toLowerCase().includes('start') || thought.toLowerCase().includes('initialize')) {
        await this.initBrowser();
        await this.step1_EnableDefaultRules();
      }
      else if (thought.toLowerCase().includes('page load') || thought.toLowerCase().includes('login page')) {
        await this.step2_AnalyzePageLoading();
      }
      else if (thought.toLowerCase().includes('images') || thought.toLowerCase().includes('links') || thought.toLowerCase().includes('resources')) {
        await this.step3_AnalyzeResources();
      }
      else if (thought.toLowerCase().includes('websocket') || thought.toLowerCase().includes('ws://')) {
        await this.step4_AnalyzeWebSocket();
      }
      else if (thought.toLowerCase().includes('redirect') || thought.toLowerCase().includes('port')) {
        await this.step5_AnalyzeRedirects();
      }
      else if (thought.toLowerCase().includes('network') || thought.toLowerCase().includes('console') || thought.toLowerCase().includes('error')) {
        await this.step6_AnalyzeNetworkAndConsole();
      }
      else if (thought.toLowerCase().includes('curl') || thought.toLowerCase().includes('header')) {
        await this.step7_PerformCurlAnalysis();
      }
      else if (thought.toLowerCase().includes('finish') || thought.toLowerCase().includes('complete')) {
        await this.closeBrowser();
      }

      if (!this.disableThoughtLogging) {
        const formattedThought = this.formatThought(validatedInput);
        console.error(formattedThought);
      }

      // Build comprehensive response
      const responseData = {
        thoughtNumber: validatedInput.thoughtNumber,
        totalThoughts: validatedInput.totalThoughts,
        nextThoughtNeeded: validatedInput.nextThoughtNeeded,
        currentStep: this.debugContext.currentStep,
        deviceUrl: this.debugContext.deviceUrl,
        pageLoadStatus: this.debugContext.pageLoadStatus,
        issuesFound: this.debugContext.issues.length,
        rewriteRules: this.debugContext.rewriteRules.length,
        networkRequests: this.debugContext.networkRequests.length,
        consoleErrors: this.debugContext.consoleErrors.length,
        brokenImages: this.debugContext.brokenImages.length,
        brokenLinks: this.debugContext.brokenLinks.length,
        redirects: this.debugContext.redirects.length
      };

      // Include full report on final thought
      if (!validatedInput.nextThoughtNeeded) {
        const fullReport = this.generateFinalReport();
        (responseData as any).fullReport = fullReport;
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify(responseData, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
            status: 'failed'
          }, null, 2)
        }],
        isError: true
      };
    }
  }

  private generateFinalReport(): any {
    // Sort rules by priority
    const sortedRules = this.debugContext.rewriteRules.sort((a, b) => a.priority - b.priority);
    
    return {
      summary: {
        deviceUrl: this.debugContext.deviceUrl,
        deviceIP: this.debugContext.deviceIP,
        deviceHostname: this.debugContext.deviceHostname,
        pageLoadStatus: this.debugContext.pageLoadStatus,
        totalIssues: this.debugContext.issues.length,
        totalRules: sortedRules.length,
        stepsCompleted: this.thoughtHistory.length,
        debuggingWorkflow: "OT Production Workflow - 7 Steps Completed"
      },
      
      issuesFound: this.debugContext.issues,
      
      rewriteRulesForRAPortal: {
        defaultRules: sortedRules.filter(r => r.type === 'default'),
        headerRewrites: sortedRules.filter(r => r.type === 'header'),
        bodyRewrites: sortedRules.filter(r => r.type === 'body'),
        totalRules: sortedRules.length,
        priorityOrder: "Apply rules in priority order (1 = highest priority)"
      },
      
      networkAnalysis: {
        totalRequests: this.debugContext.networkRequests.length,
        errors404: this.debugContext.networkRequests.filter(r => r.status === 404).length,
        errors500: this.debugContext.networkRequests.filter(r => r.status === 500).length,
        privateAPICalls: this.debugContext.networkRequests.filter(r => r.isPrivateAPI).length,
        deviceIPRequests: this.debugContext.networkRequests.filter(r => r.isDeviceIP).length,
        recommendJSONBodyRewrite: this.debugContext.networkRequests.filter(r => r.isPrivateAPI).length > 0
      },
      
      consoleAnalysis: {
        totalErrors: this.debugContext.consoleErrors.length,
        mimeTypeErrors: this.debugContext.consoleErrors.filter(e => e.isMimeType).length,
        bootstrapJSErrors: this.debugContext.consoleErrors.filter(e => e.isBootstrapJS).length,
        websocketErrors: this.debugContext.consoleErrors.filter(e => e.message.includes('websocket')).length
      },
      
      resourceAnalysis: {
        brokenImages: this.debugContext.brokenImages.length,
        brokenLinks: this.debugContext.brokenLinks.length,
        redirectsDetected: this.debugContext.redirects.length
      },
      
      otSpecificFindings: {
        hostnameRequirement: this.debugContext.issues.some(i => i.includes('hostname')),
        realIPRequirement: this.debugContext.issues.some(i => i.includes('Real IP')),
        bootstrapJSIssue: this.debugContext.issues.some(i => i.includes('bootstrap.js')),
        mimeTypeIssue: this.debugContext.issues.some(i => i.includes('MIME type')),
        redirectIssue: this.debugContext.issues.some(i => i.includes('redirect')),
        tryAgainError: this.debugContext.issues.some(i => i.includes('Try again')),
        error400Hostname: this.debugContext.issues.some(i => i.includes('400 hostname'))
      },
      
      immediateActions: [
        "1. FIRST: Apply generated rewrite rules to RA portal device configuration in priority order",
        "2. Test device access via RA portal after applying rules",
        "3. If page shows 'Try again' error: Apply all header and body rewrite rules",
        "4. If Error 400 hostname invalid: Ensure Host header rewrite is applied",
        "5. If bootstrap.js errors: Apply https→spdy replacement rule (DSD-3756 fix)",
        "6. If MIME type errors: Apply Content-Type header rules",
        "7. If private API calls detected: Enable JSON body rewrite",
        "8. If redirect issues: Consider onboarding with suggested port"
      ],
      
      troubleshootingSteps: [
        "1. Enable default rules (completed automatically)",
        "2. Look for network failure and console errors (completed)",
        "3. Check using curl analysis (completed)",
        "4. If issues persist: Access device directly via jbox browser",
        "5. Deploy browser service (iotium/qa padma-firefox) on iNode for local testing",
        "6. Onboard browser as HTTP device on port 5800 for local access",
        "7. Use F12 developer tools to analyze request/response in jbox browser"
      ],
      
      escalationPath: [
        "1. If login still fails after applying rules: Create Alpha weblink DOSD ticket",
        "2. Tag issue as 'proxy-aware' in JIRA for future reference",
        "3. If complex issues found: Get DevOps team involvement",
        "4. Check previous history: https://neeve.atlassian.net/issues/?jql=labels%20%3D%20proxy-aware%20ORDER%20BY%20created%20DESC"
      ],
      
      customerRequirements: [
        "1. Obtain temporary access credentials to the device",
        "2. Get any fixed hostname assigned to the device",
        "3. Understand how customer accesses device directly within network",
        "4. Get device firmware/software version information",
        "5. Determine if recent device upgrade caused the issue"
      ],
      
      commonOTDevicePorts: {
        "443": "HTTPS - most common for secure devices",
        "8443": "Alternative HTTPS port",
        "8501": "Common for industrial devices",
        "8080": "HTTP alternative",
        "80": "Standard HTTP",
        note: "If redirects detected, try onboarding with the redirect port"
      }
    };
  }
}

const LEGACY_DEVICE_DEBUG_THINKING_TOOL: Tool = {
  name: "legacydevicedebugthinking",
  description: `A comprehensive sequential thinking tool for debugging legacy OT devices behind proxies following the exact production workflow used by support teams.

This tool implements the precise OT debugging sequence from the production environment:

STEP 1: Enable default rules (automatic on initialization)
STEP 2: Analyze page loading status (not loaded / partially loaded / fully loaded)
STEP 3: Analyze resources (broken images pointing to device IP, broken links)
STEP 4: Analyze WebSocket connections and proxy requirements
STEP 5: Analyze redirects and port issues (curl-based analysis)
STEP 6: Analyze network failures (404/500) and console errors (MIME type, bootstrap.js)
STEP 7: Perform detailed curl analysis for request/response headers

The tool detects and handles these specific OT device issues:
- Hostname requirements (Error 400 hostname invalid) → Host header rewrite
- Real IP address requirements → X-Real-IP header addition
- Bootstrap.js HTTPS protocol issues → https→spdy replacement (DSD-3756)
- MIME type mismatches → Content-Type header fixes
- Private API calls requiring JSON body rewrite → Body rewrite with JSON
- Device IP/hostname references in resources → Body find/replace rules
- Redirect loops and wrong port onboarding → Location header rewrites
- WebSocket proxy configuration issues → WebSocket-specific rules
- "Try again" errors after device upgrades → Comprehensive rule application

Generates production-ready rewrite rules with ALL action types:
- HEADER REWRITE: find_replace, add, replace, remove, append
- BODY REWRITE: find_replace for device IP/hostname references
- JSON BODY REWRITE: Special handling for private-api calls
- DEFAULT RULES: Enable baseline proxy configuration

Production workflow triggers:
- "Start debugging for http://device-url" → Initialize browser + enable default rules
- "Check page loading" → Analyze login page, detect "Try again" errors, check 400 hostname invalid
- "Analyze images and links" → Find broken resources pointing to device IP/hostname
- "Check WebSocket" → Detect WebSocket connections and generate proxy rules
- "Check redirects" → Analyze port redirects, suggest correct onboarding ports
- "Check network and console errors" → Find 404/500 errors, MIME type issues, bootstrap.js problems
- "Perform curl analysis" → Detailed header analysis for Location header issues
- "Generate final report" → Complete analysis with all rules and recommendations

Automatic detection includes:
- Device hostname/IP pattern matching
- Private API endpoint identification (/private-api/, /api/private/, /internal/)
- Bootstrap.js protocol conflicts
- MIME type mismatch patterns
- WebSocket connection requirements
- Redirect loop detection
- Static resource loading failures

Perfect for OT support teams following established troubleshooting procedures.
Generates actionable rewrite rules for immediate application to RA portal.
Follows the exact workflow: Enable defaults → Check loading → Analyze resources → Check WebSocket → Check redirects → Network/console errors → Curl analysis.`,
  inputSchema: {
    type: "object",
    properties: {
      thought: {
        type: "string",
        description: "Your current debugging step description (include device URL to start debugging)"
      },
      nextThoughtNeeded: {
        type: "boolean",
        description: "Whether another debugging step is needed"
      },
      thoughtNumber: {
        type: "integer",
        description: "Current debugging step number",
        minimum: 1
      },
      totalThoughts: {
        type: "integer",
        description: "Estimated total debugging steps needed",
        minimum: 1
      },
      isRevision: {
        type: "boolean",
        description: "Whether this revises previous analysis"
      },
      revisesThought: {
        type: "integer",
        description: "Which debugging step is being reconsidered",
        minimum: 1
      },
      branchFromThought: {
        type: "integer",
        description: "Branching point step number",
        minimum: 1
      },
      branchId: {
        type: "string",
        description: "Branch identifier for alternative analysis"
      },
      needsMoreThoughts: {
        type: "boolean",
        description: "If more debugging steps are needed"
      }
    },
    required: ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"]
  }
};

const server = new Server(
  {
    name: "ot-device-debug-thinking-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const debugThinkingServer = new OTDeviceDebugThinkingServer();

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [LEGACY_DEVICE_DEBUG_THINKING_TOOL],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "legacydevicedebugthinking") {
    return debugThinkingServer.processLegacyDeviceDebug(request.params.arguments);
  }

  return {
    content: [{
      type: "text",
      text: `Unknown tool: ${request.params.name}`
    }],
    isError: true
  };
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OT Device Debug Thinking MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
