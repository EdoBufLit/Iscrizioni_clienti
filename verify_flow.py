import requests
import re
import os
import time

BASE_URL = "http://localhost:8000"
ORG_SLUG = "my-association"
EMAIL_LOG_FILE = "email_log.txt"

def get_token_from_log(purpose="registration"):
    # Read the log file backwards or search for the last occurrence
    if not os.path.exists(EMAIL_LOG_FILE):
        print("Email log file not found!")
        return None

    with open(EMAIL_LOG_FILE, "r") as f:
        content = f.read()

    # Regex to find link
    # ... login: http://localhost:8000/member/auth?token=...
    # ... registration: http://localhost:8000/join/continue?token=...

    if purpose == "registration":
        pattern = r"token=([a-zA-Z0-9_-]+)"
        matches = re.findall(pattern, content)
        if matches:
            return matches[-1]
    elif purpose == "login":
        pattern = r"token=([a-zA-Z0-9_-]+)"
        matches = re.findall(pattern, content)
        if matches:
            return matches[-1]

    return None

def create_dummy_files():
    with open("dummy_id.pdf", "wb") as f:
        f.write(b"%PDF-1.4\nThis is a dummy ID document.")
    with open("dummy_fc.pdf", "wb") as f:
        f.write(b"%PDF-1.4\nThis is a dummy Fiscal Code document.")

def run_verification():
    create_dummy_files()

    # Start Session
    s = requests.Session()

    print(f"1. GET /join/{ORG_SLUG}")
    r = s.get(f"{BASE_URL}/join/{ORG_SLUG}")
    assert r.status_code == 200
    assert "Join My Awesome Association" in r.text
    print("   Success")

    print(f"2. POST /join/{ORG_SLUG}")
    email = f"testuser_{int(time.time())}@example.com"
    data = {
        "first_name": "Test",
        "last_name": "User",
        "email": email,
        "phone": "1234567890",
        "fiscal_code": "ABCDEF12G34H567I",
        "accept_statute": "true",
        "accept_privacy": "true"
    }
    r = s.post(f"{BASE_URL}/join/{ORG_SLUG}", data=data)
    assert r.status_code == 200
    assert "Registration Started" in r.text
    print("   Success")

    print("3. Retrieve Token from Log")
    time.sleep(1) # Wait for file write
    token = get_token_from_log("registration")
    assert token is not None
    print(f"   Token found: {token}")

    print(f"4. GET /join/continue?token={token}")
    r = s.get(f"{BASE_URL}/join/continue?token={token}")
    assert r.status_code == 200
    assert "Complete Your Registration" in r.text
    print("   Success")

    print(f"5. POST /join/continue (Upload)")
    files = {
        "id_document": ("dummy_id.pdf", open("dummy_id.pdf", "rb"), "application/pdf"),
        "fiscal_code_document": ("dummy_fc.pdf", open("dummy_fc.pdf", "rb"), "application/pdf")
    }
    r = s.post(f"{BASE_URL}/join/continue", data={"token": token}, files=files)
    if r.status_code != 200:
        print(f"Failed Status: {r.status_code}")
        print(r.text)
    assert r.status_code == 200
    assert "Registration Complete" in r.text
    print("   Success")

    print(f"6. GET /member/login")
    r = s.get(f"{BASE_URL}/member/login")
    assert r.status_code == 200
    print("   Success")

    print(f"7. POST /member/login")
    r = s.post(f"{BASE_URL}/member/login", data={"email": email})
    assert r.status_code == 200
    print("   Success")

    print("8. Retrieve Login Token")
    time.sleep(1)
    # We need to clear the file or just grab the last one. get_token_from_log grabs the last one.
    token = get_token_from_log("login")
    assert token is not None
    print(f"   Token found: {token}")

    print(f"9. GET /member/auth?token={token}")
    r = s.get(f"{BASE_URL}/member/auth?token={token}")
    # It redirects
    assert r.url.endswith("/member/portal")
    print("   Success")

    print(f"10. GET /member/portal")
    r = s.get(f"{BASE_URL}/member/portal")
    assert r.status_code == 200
    assert "ACTIVE" in r.text
    assert "dummy_id.pdf" in r.text
    print("   Success")

    print("VERIFICATION COMPLETE")

if __name__ == "__main__":
    try:
        run_verification()
    except Exception as e:
        print(f"Verification Failed: {e}")
        exit(1)
