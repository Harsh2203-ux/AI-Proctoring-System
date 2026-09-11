"""
Integration tests for authentication, registration, and authorization.
Requires running backend (http://localhost:8000) and MongoDB.
"""
import os
import sys
import json
import urllib.request
import urllib.error
import urllib.parse

BASE = "http://localhost:8000"


def req(method: str, path: str, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(name: str, condition: bool, detail: str = ""):
    status = "✓ PASS" if condition else "✗ FAIL"
    print(f"  {status}  {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        sys.exit(1)


print("\n══════════════════════════════════════════════════")
print("  AI Proctoring System — Auth Integration Tests")
print("══════════════════════════════════════════════════\n")

# ── T1: Admin demo login ───────────────────────────────────────────────────────
print("T1  Admin demo login")
status, data = req("POST", "/api/auth/login", {"email": "admin@demo.com", "password": "Admin@1234"})
check("HTTP 200", status == 200, str(status))
check("Has access_token", "access_token" in data)
check("Role is admin", data.get("user", {}).get("role") == "admin")
admin_token = data["access_token"]

# ── T2: Student demo login ─────────────────────────────────────────────────────
print("\nT2  Student demo login")
status, data = req("POST", "/api/auth/login", {"email": "student@demo.com", "password": "Student@1234"})
check("HTTP 200", status == 200, str(status))
check("Has access_token", "access_token" in data)
check("Role is student", data.get("user", {}).get("role") == "student")
student_token = data["access_token"]

# ── T3: New student registration ───────────────────────────────────────────────
print("\nT3  New student registration")
import time
ts = str(int(time.time()))[-6:]
status, data = req("POST", "/api/auth/register/student", {
    "full_name": f"Test Student {ts}",
    "email": f"teststudent{ts}@test.com",
    "student_id": f"STU-TEST-{ts}",
    "password": "Test@1234",
    "confirm_password": "Test@1234",
})
check("HTTP 201", status == 201, str(status))
check("Has user_id", "user_id" in data, str(data))

# Login with newly registered account
status2, data2 = req("POST", "/api/auth/login", {
    "email": f"teststudent{ts}@test.com",
    "password": "Test@1234",
})
check("New account can login", status2 == 200, str(status2))

# ── T4: Duplicate student email ────────────────────────────────────────────────
print("\nT4  Duplicate student email rejected")
status, data = req("POST", "/api/auth/register/student", {
    "full_name": "Dup Student",
    "email": f"teststudent{ts}@test.com",  # same email as T3
    "student_id": f"STU-DUP-{ts}",
    "password": "Test@1234",
    "confirm_password": "Test@1234",
})
check("HTTP 409/422", status in (409, 422, 400), str(status))
check("Error mentions email", "email" in str(data).lower() or "already" in str(data).lower(), str(data))

# ── T5: Duplicate student ID ───────────────────────────────────────────────────
print("\nT5  Duplicate student ID rejected")
status, data = req("POST", "/api/auth/register/student", {
    "full_name": "Dup Student 2",
    "email": f"unique{ts}@test.com",
    "student_id": f"STU-TEST-{ts}",  # same student_id as T3
    "password": "Test@1234",
    "confirm_password": "Test@1234",
})
check("HTTP 409/422/400", status in (409, 422, 400), str(status))
check("Error mentions student_id", "student" in str(data).lower() or "already" in str(data).lower(), str(data))

# ── T6: Invalid admin registration code ───────────────────────────────────────
print("\nT6a  Admin registration rejected with wrong code")
ts2 = str(int(time.time() * 1000))[-6:]
status, data = req("POST", "/api/auth/register/admin", {
    "full_name": f"Test Admin {ts2}",
    "email": f"testadmin{ts2}@test.com",
    "admin_id": f"ADM-TEST-{ts2}",
    "password": "Admin@1234",
    "confirm_password": "Admin@1234",
    "registration_code": "wrongcode",
})
check("HTTP 403", status == 403, str(status))
check("Error mentions registration code", "registration code" in str(data).lower(), str(data))

# ── T6b: New admin registration with correct code ─────────────────────────────
print("\nT6b  New admin registration with valid code")
ADMIN_CODE = os.environ.get("ADMIN_REGISTRATION_CODE", "")
if not ADMIN_CODE:
    print("  ⚠  ADMIN_REGISTRATION_CODE not set in environment — skipping T6b")
else:
    ts2b = str(int(time.time() * 1000))[-5:]
    status, data = req("POST", "/api/auth/register/admin", {
        "full_name": f"Test Admin {ts2b}",
        "email": f"testadmin{ts2b}@test.com",
        "admin_id": f"ADM-TST-{ts2b}",
        "password": "Admin@1234",
        "confirm_password": "Admin@1234",
        "registration_code": ADMIN_CODE,
    })
    check("HTTP 201", status == 201, str(status))
    check("Has user_id", "user_id" in data, str(data))

# ── T7: Password mismatch ──────────────────────────────────────────────────────
print("\nT7  Password mismatch rejected")
status, data = req("POST", "/api/auth/register/student", {
    "full_name": "Mismatch Test",
    "email": f"mismatch{ts}@test.com",
    "student_id": f"STU-MM-{ts}",
    "password": "Test@1234",
    "confirm_password": "Different@9",
})
check("HTTP 422/400", status in (400, 422), str(status))

# ── T8: Student accessing admin endpoint ───────────────────────────────────────
print("\nT8  Student cannot access admin endpoint")
status, data = req("GET", "/api/admin/dashboard/stats", token=student_token)
check("HTTP 403", status == 403, str(status))
check("Error message present", "detail" in data, str(data))

# ── T9: Admin accessing admin endpoint ────────────────────────────────────────
print("\nT9  Admin can access admin endpoint")
status, data = req("GET", "/api/admin/dashboard/stats", token=admin_token)
check("HTTP 200", status == 200, str(status))
check("Has total_exams", "total_exams" in data, str(data))

# ── T10: Invalid login ─────────────────────────────────────────────────────────
print("\nT10  Invalid credentials rejected")
status, data = req("POST", "/api/auth/login", {"email": "nobody@nowhere.com", "password": "WrongPass@1"})
check("HTTP 401", status == 401, str(status))
check("Safe error message", "Invalid email or password" in str(data), str(data))

# ── T11: No token → 401 ────────────────────────────────────────────────────────
print("\nT11  Unauthenticated request rejected")
status, data = req("GET", "/api/students/profile")
check("HTTP 401/403", status in (401, 403), str(status))

print("\n══════════════════════════════════════════════════")
print("  All tests passed ✓")
print("══════════════════════════════════════════════════\n")
