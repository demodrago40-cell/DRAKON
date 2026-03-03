import requests
import sys

BASE_URL = "http://127.0.0.1:5000"

def verify_limit():
    print("Verifying Limit Enforcement...")
    session = requests.Session()
    session.cookies.clear()
    
    # 1. Send 5 messages (allowed)
    for i in range(1, 6):
        print(f"Sending message {i}...")
        res = session.post(BASE_URL + "/chat", json={
            "message": f"Test message {i}",
            "model": "drakon"
        })
        if res.status_code != 200:
            print(f"FAILED: Message {i} returned {res.status_code}")
            sys.exit(1)
            
    # 2. Send 6th message (should fail)
    print("Sending message 6 (should fail)...")
    res = session.post(BASE_URL + "/chat", json={
        "message": "Test message 6",
        "model": "drakon"
    })
    
    if res.status_code == 403:
        print("SUCCESS: Message 6 returned 403 Forbidden.")
        data = res.json()
        if data.get('error') == 'LIMIT_REACHED':
            print("SUCCESS: Error code is LIMIT_REACHED.")
        else:
            print(f"FAILED: Unexpected error code: {data.get('error')}")
            sys.exit(1)
    else:
        print(f"FAILED: Message 6 returned {res.status_code} (Expected 403)")
        sys.exit(1)
        
    print("Limit Enforcement Verification Passed!")

if __name__ == "__main__":
    verify_limit()
