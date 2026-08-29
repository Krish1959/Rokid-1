# Rokid-1
Interractive Ship Inspection &amp; Documentation Tester-1
## File Stucture 
ship-inspector-app/                  ← repo root (Render's "Root Directory" points here)
```
│
├── package.json                     ← REQUIRED — tells Render how to install/run
├── package-lock.json                ← optional but recommended (commit if you have it locally)
├── server.js                        ← REQUIRED — Express app entry point
├── systemPrompt.js                  ← REQUIRED — InspectBot rules, imported by server.js
├── render.yaml                      ← REQUIRED only if using "New → Blueprint" deploy
├── .gitignore                       ← REQUIRED — keeps secrets/junk out of the repo
├── .env.example                     ← commit this (template only, no real key)
├── README.md                        ← optional but recommended
│
├── public/                          ← REQUIRED — static frontend, served as-is
│   ├── index.html
│   ├── style.css
│   └── app.js
│
└── data/                            ← REQUIRED as empty scaffolding (see notes below)
    ├── uploads/
    │   └── .gitkeep                 ← placeholder so Git tracks the empty folder
    └── logs/
        └── .gitkeep                 ← placeholder so Git tracks the empty folder
```

