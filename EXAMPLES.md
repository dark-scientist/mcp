# Legacy Device Debugging Examples

## Example 1: BMS Device with Hardcoded IP References

### Initial Issue
Customer reports that their BMS (Building Management System) device `rtp-acl-bms` is not working properly through the proxy. Some images and JavaScript files are not loading.

### Debug Command
```
Please run the complete debug workflow for http://rtp-acl-bms:8080
```

### Expected Analysis Results
```
# Complete Debug Workflow for http://rtp-acl-bms:8080

## Step 1: Basic Page Analysis
- Status: loaded
- Issues Found: 3
- Rewrite Rules Generated: 4

## Step 2: Header Analysis (Curl-like)
- Status Code: 200
- Headers Issues: 1

## Step 3: Detailed Issues
1. Found 2 network errors
2. Resource loading from device IP/hostname: http://rtp-acl-bms/static/jquery.min.js
3. Resource loading from device IP/hostname: http://rtp-acl-bms/images/logo.png

## Step 4: Recommendations
1. Check browser developer console for detailed errors
2. Add header rewrite rule for Location header

## Step 5: Required Rewrite Rules

### Rule 1: BODY FIND_REPLACE
- Pattern: `rtp-acl-bms/static/jquery.min.js`
- Replacement: `{{DEVICE_EXTERNAL_FQDN}}/static/jquery.min.js`

### Rule 2: BODY FIND_REPLACE
- Pattern: `rtp-acl-bms/images/logo.png`
- Replacement: `{{DEVICE_EXTERNAL_FQDN}}/images/logo.png`

### Rule 3: HEADER ADD
- Header: `X-Forwarded-Host`
- Value: `{{DEVICE_EXTERNAL_FQDN}}`

### Rule 4: HEADER ADD
- Header: `X-Forwarded-Proto`
- Value: `https`

## Step 6: Next Steps for Support Team
1. Apply the generated rewrite rules to the proxy configuration
2. Test the device again after applying rules
3. If issues persist, escalate to DevOps team with this analysis
4. Obtain device credentials from customer for direct testing
```

## Example 2: PLC Device with WebSocket Issues

### Initial Issue
Customer reports that their PLC device has real-time monitoring that doesn't work through the proxy.

### Debug Command
```
Please analyze this legacy device: http://192.168.1.55:8080
```

### Expected Analysis Results
```
# Device Analysis Results

**Status:** loaded

## Issues Found:
1. Found 1 network errors
2. WebSocket connections detected - may need special handling
3. Resource loading from device IP/hostname: ws://192.168.1.55:8080/websocket

## Recommendations:
1. Check WebSocket proxy configuration
2. Check browser developer console for detailed errors

## Suggested Rewrite Rules:
1. **BODY FIND_REPLACE**
   - Pattern: `192.168.1.55:8080/websocket`
   - Replacement: `{{DEVICE_EXTERNAL_FQDN}}/websocket`

2. **BODY FIND_REPLACE**
   - Pattern: `ws://192.168.1.55:8080`
   - Replacement: `wss://{{DEVICE_EXTERNAL_FQDN}}`

3. **HEADER ADD**
   - Header: `X-Forwarded-Host`
   - Value: `{{DEVICE_EXTERNAL_FQDN}}`

4. **HEADER ADD**
   - Header: `X-Forwarded-Proto`
   - Value: `https`
```

## Example 3: Generate Specific Rewrite Rules

### Command
```
Generate rewrite rules for css_js_loading issue on http://192.168.1.100:8080 with problem pattern "192.168.1.100" and target path "/static/app.js"
```

### Expected Results
```
# Generated Rewrite Rules for css_js_loading

## Rule 1: BODY FIND_REPLACE
- **Pattern:** `192.168.1.100/static/app.js`
- **Replacement:** `{{DEVICE_EXTERNAL_FQDN}}/static/app.js`

## Rule 2: HEADER ADD
- **Header:** `X-Forwarded-Host`
- **Value:** `{{DEVICE_EXTERNAL_FQDN}}`

## Rule 3: HEADER ADD
- **Header:** `X-Forwarded-Proto`
- **Value:** `https`
```

## Common Proxy Configuration Implementation

### For Apache HTTP Server
```apache
# Header rewrite rules
RequestHeader set X-Forwarded-Host "device.company.com"
RequestHeader set X-Forwarded-Proto "https"

# Body content rewrite
LoadModule substitute_module modules/mod_substitute.so
<Location /device/>
    SetOutputFilter SUBSTITUTE
    Substitute "s|192\.168\.1\.100|device.company.com|g"
    Substitute "s|http://device\.company\.com|https://device.company.com|g"
</Location>
```

### For NGINX
```nginx
# Proxy configuration
location /device/ {
    proxy_pass http://192.168.1.100:8080/;
    proxy_set_header X-Forwarded-Host "device.company.com";
    proxy_set_header X-Forwarded-Proto "https";
    
    # Body content rewrite
    sub_filter '192.168.1.100' 'device.company.com';
    sub_filter 'http://device.company.com' 'https://device.company.com';
    sub_filter_once off;
}
```

### For HAProxy
```haproxy
# Backend configuration
backend device_backend
    server device 192.168.1.100:8080 check
    http-request set-header X-Forwarded-Host "device.company.com"
    http-request set-header X-Forwarded-Proto "https"
```

## Troubleshooting Guide

### Issue: Page loads but resources fail
**Diagnosis:** Check for 404 errors in browser developer console
**Solution:** Apply body rewrite rules for resource paths

### Issue: WebSocket connections fail
**Diagnosis:** Check for WebSocket upgrade errors
**Solution:** 
- Ensure WebSocket proxy support is enabled
- Apply protocol upgrade rules (ws:// to wss://)
- Check proxy timeout settings

### Issue: Infinite redirects
**Diagnosis:** Device redirects to its own IP/hostname
**Solution:** Add Location header rewrite rules

### Issue: Mixed content warnings
**Diagnosis:** HTTP resources loaded in HTTPS context
**Solution:** Apply protocol upgrade rules (HTTP to HTTPS)

### Issue: Authentication problems
**Diagnosis:** Device authentication breaks through proxy
**Solution:** 
- Check authentication header forwarding
- May need custom authentication handling
- Escalate to DevOps team for complex auth scenarios
