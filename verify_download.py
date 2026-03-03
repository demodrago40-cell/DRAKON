import requests

def verify_routes():
    base_url = "http://127.0.0.1:5000"
    
    # 1. Check if /download exists (should be 302 to login if not authenticated)
    try:
        print(f"Checking {base_url}/download...")
        r = requests.get(f"{base_url}/download", allow_redirects=False, timeout=5)
        print(f"Status: {r.status_code}")
        if r.status_code == 302 and '/login' in r.headers['Location']:
            print("SUCCESS: /download redirects to login for unauthenticated user.")
        elif r.status_code == 200:
             print("WARNING: /download allowed access without login? Or maybe you are logged in browser context (not this script).")
        else:
            print(f"FAILURE: Unexpected status code {r.status_code}")
            
    except Exception as e:
        print(f"Error connecting to app: {e}")
        print("Ensure app.py is running.")

if __name__ == "__main__":
    verify_routes()
