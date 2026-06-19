# Ports in Use by Applications

**Location of this master copy:** `C:\Users\yinka\Desktop\Ports in Use by Applications.md`

**Purpose:** This document helps you avoid port conflicts. Every application (web server, API, or local dev server) in your `Documents` folder is listed with the port(s) it is currently configured to use.

**Rule:** Never start two apps on the same port. Before creating or changing any new project, check this list. Update this file (and the copies inside each app folder) whenever you change a port.

**Recommendation:** Use less common high ports for your personal projects (e.g. 4500, 9876, 3456, 5500) so they don't collide with common defaults (3000, 5000, 8000, 8080).

**Last updated:** 2026-06-19 (AssurCoop ports corrected)

## Applications and Their Ports

| Application              | Folder Path                                      | Port(s)                  | Type / Notes                                                                 | How it is started / Key files |
|--------------------------|--------------------------------------------------|--------------------------|-----------------------------------------------------------------------------|--------------------------------|
| UltraLifeNavigator      | `C:\Users\yinka\Documents\UltraLifeNavigator`   | **4500**                | Private life vision + daily goals + accountability tool (FastAPI). Supports `PORT` env var override. | `uvicorn app.main:app --reload --port 4500`<br>or `.\start.ps1`<br>or `python app/main.py`<br>README.md, start.ps1, app/main.py |
| StoryTeller             | `C:\Users\yinka\Documents\StoryTeller`          | **9000** (main)<br>9000-9010 (kill range in launcher) | Big story-to-video + Image Studio + Video tools app (FastAPI). The launcher kills anything on 9000 before starting. | `uvicorn ... --port 9000`<br>`StoryTeller.exe` or `Start_StoryTeller.bat`<br>README.md, backend/launch scripts, docs |
| SimpleFreshApp          | `C:\Users\yinka\Documents\SimpleFreshApp`       | **9876**                | Simple daily thoughts / notes web app (Python).                            | Runs on PORT=9876 defined in code. See README for address. |
| AssurCoop               | `C:\Users\yinka\Documents\AssurCoop`            | **3457** (main app)<br>**3456** (legacy statement server) | **Assurance Cooperative Manager** — Node.js ledger, member portal, PDF statements. Primary: `npm start` or `PeerFinanceManager.exe`. Legacy 3456: `npm run statements:legacy-server` only. | `npm start` → port 3457. `peer-finance-manager/server.js`, `package.json` |
| ehr-backend             | `C:\Users\yinka\Documents\ehr-backend`          | **5000** (or env PORT)  | Node/Express backend for EHR system.                                       | `node server.js` or nodemon. server.js sets `const PORT = process.env.PORT || 5000` |
| CarePower               | `C:\Users\yinka\Documents\CarePower`            | **5000** (frontend)<br>**5001** (API/backend) | Fullstack React frontend + backend. Uses concurrently to run both.        | `npm start` from root (see package.json scripts with PORT=5000/5001) |
| EHR-Africa              | `C:\Users\yinka\Documents\EHR-Africa`           | **5500**                | EHR UI / framework (often served with Python http.server or VS Code Live Server). | Typical: `python -m http.server 5500` or equivalent. See READMEs and HOW-TO-USE. |
| FlexxForms              | `C:\Users\yinka\Documents\FlexxForms`           | **3000** (frontend)<br>**4000** (backend) | Forms / React + backend project. Vite dev server on 3000 proxies API to 4000. | `npm run dev` (frontend on 3000). See vite.config.js and README. |
| Float                   | `C:\Users\yinka\Documents\Float`                | **4000** (main API)<br>**3010** (admin hub/web)<br>3002, 3003, 3004+ (various demo sandboxes: merchant, bank, etc.) | Large multi-service fintech demo / sandbox system (API, admin, multiple merchant/bank demo storefronts). Complex launchers and scripts. | Multiple: `npm run start:dev -w @float/api`, launch exes, docker, specific ps1 scripts that set PORT. See README.md and scripts/ folder. |
| ZipTransact             | `C:\Users\yinka\Documents\ZipTransact`          | **3001** (API default)<br>3002, 3004, 3005+ (other services in monorepo) | NestJS API + other services (monorepo).                                    | API: `const port = Number(process.env["API_PORT"] ?? 3001)` in apps/api/src/main.ts. See root README for other demo ports. |
| AutoPartsHubNigeria     | `C:\Users\yinka\Documents\AutoPartsHubNigeria`  | **8000**                | Static HTML/JS + Firebase auto parts site. No real backend server — just a local file server for development. | `python -m http.server 8000`<br>or `npx http-server`<br>or `php -S localhost:8000`<br>(recommended in its README.md) |

### Leftover / Old Folders to Clean Up
- **UltrLifeNavigator** (old spelling, different from current)  
  Path: `C:\Users\yinka\Documents\UltrLifeNavigator`  
  Port: **8010**  
  This appears to be an earlier unfinished attempt. It is safe to delete the whole folder if you no longer need it.

### Non-Web / Desktop / Script Tools (No Fixed Server Port)
These live in Documents but are local GUI or CLI tools — they do not run a persistent web server on a port:
- Interest Calculator (`C:\Users\yinka\Documents\Interest Calculator`) — Tkinter desktop app.
- Transcriber (`C:\Users\yinka\Documents\Transcriber`) — Local OCR / transcription GUI tool.
- Statementer (`C:\Users\yinka\Documents\Statementer`) — Statement parsing / processing scripts.

### Other Notes
- Many large Node projects (node_modules folders) contain example ports (e.g. 4318 for OpenTelemetry, 5432 for Postgres examples). These are **not** the apps' own ports — ignore them.
- Common default ports you should avoid for new personal apps: 3000, 5000, 8000, 8080, 3001 (they are used by many frameworks and the projects above).
- Good safe ports seen here: 4500, 9876, 3456, 5500, 3010.

## How to Keep This Document Up to Date
1. Whenever you change a port in code / scripts / README of any app, update this master file on your Desktop.
2. Copy the updated .md file into the root folder of that application (and any others if you changed multiple).
3. Re-run a similar scan (or ask Grok) after big changes or when adding new projects.
4. Quick manual search commands you can run yourself in PowerShell:
   - For Python apps: `Select-String -Path "C:\Users\yinka\Documents\*\*\*.py" -Pattern "uvicorn.*port|port\s*=\s*\d+" -Context 0`
   - For launchers: look in `*.ps1`, `*.bat`, `README*.md` for `--port`, `PORT=`, `localhost:`
   - For Node: check `package.json` "scripts" and `main.ts` / `server.js` for `listen` or `PORT`.

## How to Run an App on a Different Port (temporary)
- Most uvicorn/FastAPI: add `--port 4600` to the command.
- Most Node: `PORT=4600 npm run dev`
- Update the permanent default in the files listed in the table above, then update this document.

Keep one copy of this file on your Desktop and one inside each active application's folder. This way you can always check before you start something new.

Enjoy your projects without port fights!