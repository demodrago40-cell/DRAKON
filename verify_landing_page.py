import requests
import sys

BASE_URL = "http://127.0.0.1:5000"

def verify_landing_page():
    print("Verifying Landing Page...")
    try:
        session = requests.Session()
        # Ensure we are a guest (no cookies)
        session.cookies.clear()
        
        res = session.get(BASE_URL + "/")
        if res.status_code != 200:
            print(f"FAILED: Status code {res.status_code}")
            sys.exit(1)
            
        content = res.text
        
        if 'id="landing-page"' in content:
            print("SUCCESS: Landing Page container found.")
        else:
            print("FAILED: Landing Page container NOT found.")
            sys.exit(1)
            
        if 'aurora.js' in content:
            print("SUCCESS: aurora.js script import found.")
        else:
            print("FAILED: aurora.js script import NOT found.")
            sys.exit(1)
            
        print("Landing Page Verification Passed!")
        
    except Exception as e:
        print(f"FAILED: Exception {e}")
        sys.exit(1)

if __name__ == "__main__":
    verify_landing_page()
