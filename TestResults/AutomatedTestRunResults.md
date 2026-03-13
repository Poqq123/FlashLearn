# FlashLearn Automated Test Run Results

Date recorded: March 12, 2026

## Environment

```text
$ python3 --version
Python 3.9.6

$ node --version
v24.14.0
```

## 1. Python Syntax Compilation

```text
$ PYTHONPYCACHEPREFIX=/tmp/flashlearn-pycache python3 -m py_compile main.py backend/__init__.py backend/app/__init__.py backend/app/main.py
(no output; command exited successfully)
```

## 2. JavaScript Syntax Checks

```text
$ node --check frontend/shared/js/app-core.js
(no output; command exited successfully)

$ node --check frontend/pages/login/login.js
(no output; command exited successfully)

$ node --check frontend/pages/study/study.js
(no output; command exited successfully)

$ node --check frontend/pages/quiz/quiz.js
(no output; command exited successfully)

$ node --check frontend/pages/quiz/collection.js
(no output; command exited successfully)

$ node --check frontend/pages/quiz/study-session.js
(no output; command exited successfully)

$ node --check frontend/pages/profile/profile.js
(no output; command exited successfully)
```

## 3. Required File Presence Check

```text
$ python3 - <<'PY'
from pathlib import Path
required = [
    'index.html',
    'home.html',
    'login.html',
    'profile.html',
    'quiz.html',
    'frontend/pages/study/index.html',
    'frontend/pages/quiz/quiz.html',
    'frontend/pages/quiz/collection.html',
    'frontend/pages/quiz/study-session.html',
    'frontend/pages/profile/profile.html',
    'frontend/pages/login/login.html',
    'frontend/shared/js/app-core.js',
    'backend/app/main.py',
]
missing = [path for path in required if not Path(path).exists()]
print('Required files checked:', len(required))
if missing:
    print('Missing files:')
    for item in missing:
        print('-', item)
    raise SystemExit(1)
print('All required files are present.')
PY
Required files checked: 13
All required files are present.
```

## 4. Automated Deployment / Hosting Checks

Deployment/build verification for the hosted application was confirmed through GitHub Pages and Render platform logs.

Deployment targets referenced by the project:

```text
Frontend deployment URL:
https://poqq123.github.io/FlashLearn

Backend deployment URL:
https://flashcardapp-pwic.onrender.com
```

### GitHub Pages frontend deployment

Verified from GitHub Actions logs dated March 12, 2026:

```text
Created deployment for 3bfc808b355243b6eda7a3fdc021623b412498e8
Reported success!
Evaluated environment url: https://poqq123.github.io/FlashLearn/
```

Additional workflow evidence:

```text
CONCLUSION: success
```

### Render backend deployment / startup

Verified from Render logs dated March 13, 2026:

```text
==> Running 'uvicorn main:app --host 0.0.0.0 --port $PORT'
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:10000
INFO:     34.83.77.94:0 - "GET / HTTP/1.1" 200 OK
==> Your service is live
Available at your primary URL https://flashcardapp-pwic.onrender.com
```


## 5. Attempted Backend Runtime Smoke Test

```text
$ python3 - <<'PY'
import os
import tempfile
from fastapi.testclient import TestClient

tmpdir = tempfile.mkdtemp(prefix='flashlearn-test-')
os.environ['DATABASE_URL'] = f"sqlite:///{tmpdir}/smoke.db"

from backend.app.main import app

client = TestClient(app)
response = client.get('/')
print('GET / ->', response.status_code, response.json())
unauth = client.get('/cards')
print('GET /cards without auth ->', unauth.status_code, unauth.json())
PY
Traceback (most recent call last):
  File "<stdin>", line 3, in <module>
ModuleNotFoundError: No module named 'fastapi'
```
