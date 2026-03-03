import requests
import time

BASE_URL = "http://127.0.0.1:5000"
TEST_EMAIL = "testdrakon@yopmail.com" # Use yopmail for testing if possible or a dummy email
TEST_PASS = "TestPass123!"

print("Testing Signup OTP Flow...")

# 1. Initiate Signup
print(f"1. Sending signup request for {TEST_EMAIL}...")
try:
    res = requests.post(
        f"{BASE_URL}/signup", 
        json={"email": TEST_EMAIL, "password": TEST_PASS},
        timeout=10
    )
    
    print(f"Status: {res.status_code}")
    print(f"Response: {res.json()}")
    
    if res.status_code == 200 and res.json().get('status') == 'otp_required':
        print("✅ Signup initiated successfully. OTP required.")
        
        # In a real scenario we would check the email. 
        # Here we will just prompt the user to check server logs for the generated OTP (if we logged it, or we can just assume it worked if the email sent).
    else:
        print("❌ Signup initiation failed.")
        exit(1)
        
except Exception as e:
    print(f"Error: {e}")
