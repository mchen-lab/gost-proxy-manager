# GOST v3 Migration Plan

## UI Restructure
#### [MODIFY] [App.tsx](file:///Users/xiaoyuchen/workspace/ci/news_workspace/gost-proxy-manager/src/App.tsx)
- Remove `ProxyTester` visible component.
- Move `SystemStatus` to top of main content area.
- Add "Test Connectivity" button to Header.
- Ensure `LogViewer` takes remaining vertical space.

#### [MODIFY] [SystemStatus.tsx](file:///Users/xiaoyuchen/workspace/ci/news_workspace/gost-proxy-manager/src/components/SystemStatus.tsx)
- Adjust styling to fit a horizontal top bar layout (if needed) or keep as card but full width.

## Verification Plan

We are upgrading from GOST v2 to **GOST v3** (`go-gost/gost`) to align with the user's local environment and leverage the latest features.

## Why?
- User has `brew install gost` which installs v3.
- v3 has a new, robust API (though more complex).
- v2 is older; v3 is the future-proof path.

## Changes Required

### 1. Dockerfile
- **Base Image**: Change `gogost/gost:latest` (v2) -> `go-gost/gost:latest` (v3).
- **Binary Path**: Verify path in new image (usually `/bin/gost`).

### 2. Backend Logic (`src/server/index.ts`)
- **API Endpoint**:
    - v2: `POST /api/config/chains` (dynamic config via ad-hoc chains).
    - v3: `POST /api/config` (global config) or individual object APIs.
    - **Strategy**: We will use the **Config Generator** approach: generate a full v3 config object and `PUT` it to `/api/config` (or POST to `chains`).
- **Payload Structure**:
    - **v2**:
      ```json
      { "name": "chain", "hops": [ ... ] }
      ```
    - **v3**:
      ```json
      {
        "services": [{
          "name": "proxy-service",
          "addr": ":8080",
          "handler": { "type": "http", "chain": "upstream-chain" },
          "listener": { "type": "tcp" }
        }],
        "chains": [{
          "name": "upstream-chain",
          "hops": [{
            "name": "hop-0",
            "nodes": [ ... ]
          }]
        }]
      }
      ```
    - **Node Selector**: `hops[0].selector.strategy` (Round/Random/FIFO).
    - **Failover**: Configured in `hops` settings.

### 3. GostManager (`src/server/gostManager.ts`)
- **Launch Arguments**: v3 starts differently.
    - v2: `gost -L :8080 -F ...`
    - v3: `gost -L :8080` (or just `gost` and let API configure it? No, we need a base service).
    - **Plan**: Start `gost` with **API enabled** (`-L :18080`) and **no initial service**, then push config via API? OR start with base arguments.
    - **Command**: `gost -L http://:8080 -L :18080` (v3 syntax might be slightly differnet for metrics/api).
    - **API Flag**: v3 uses `--apiAddr :18080` or service definition.
    - **Research**: v3 enables API via `gost -L :18080?access_log=true`? No, v3 usually separates API.
    - **CLI**: `gost -L :8080?chain=upstream-chain` ...
    - **Refined Plan**: Start `gost` with just the **API service** enabled via CLI, then create the Proxy Service via API.
    - **Command**: `gost -L http://:18080` (API service).

### 4. Local Dev (`restart.sh`)
- Use the locally installed `gost` (v3).
- No need for `setup_gost_v2.sh`.

## Steps
1.  **Verify v3 launch command**: Test `gost -L :18080` locally (it acts as HTTP proxy AND api? No, API is special service in v3).
    - *Correction*: v3 API is a service handler type `api`.
    - Command: `gost -L="api://:18080"`
2.  **Update `GostManager`**: Change default args to launch API service.
3.  **Update `index.ts`**: Rewrite `updateGostChain`.
    - Create `Service` (listen :8080).
    - Create `Chain` (upstream nodes).
4.  **Frontend**: No changes needed (API contract remains same).
