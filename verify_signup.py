import requests
import sys
import uuid
import json

BASE_URL = "http://127.0.0.1:5000"

def verify_signup_page():
    print("Verifying Signup Page...")
    session = requests.Session()
    
    # 1. Check if Signup Page exists (GET)
    print("Checking GET /signup...")
    res = session.get(BASE_URL + "/signup")
    if res.status_code == 404:
        print("FAILED: /signup route not found (404). This is expected before the fix.")
        return False
    elif res.status_code != 200:
        print(f"FAILED: Unexpected status code {res.status_code}")
        return False
    else:
        print("SUCCESS: Signup page loaded.")

    # 2. Check Signup Logic (POST)
    print("Checking POST /signup...")
    unique_email = f"test_user_{uuid.uuid4()}@example.com"
    payload = {
        "email": unique_email,
        "password": "password123"
    }
    
    try:
        res = session.post(BASE_URL + "/signup", json=payload)
        
        if res.status_code in [200, 201]:
             data = res.json()
             if data.get('status') == 'success' or data.get('redirect_url'):
                 print("SUCCESS: Signup successful.")
                 return True
             else:
                 print(f"FAILED: Signup response indicates failure: {data}")
                 return False
        else:
             print(f"FAILED: Signup POST failed with status {res.status_code}")
             print(f"Response: {res.text}")
             return False
             
    except Exception as e:
        print(f"FAILED: Exception during POST: {e}")
        return False

if __name__ == "__main__":
    if verify_signup_page():
        print("Signup Verification Passed!")
        sys.exit(0)
    else:
        print("Signup Verification Failed!")
        sys.exit(1)
