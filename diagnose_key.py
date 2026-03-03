
import json
import os
from google.oauth2 import service_account
from google.auth.transport.requests import Request

def validate_key():
    key_path = "serviceAccountKey.json"
    if not os.path.exists(key_path):
        print("❌ serviceAccountKey.json not found.")
        return

    try:
        with open(key_path, 'r') as f:
            data = json.load(f)
        
        print("✅ JSON is valid.")
        
        # Check basic fields
        required = ["type", "project_id", "private_key", "client_email"]
        missing = [k for k in required if k not in data]
        if missing:
            print(f"❌ Missing fields: {missing}")
            return

        print(f"🔹 Project ID: {data.get('project_id')}")
        print(f"🔹 Client Email: {data.get('client_email')}")
        
        # Check Private Key Format
        pk = data['private_key']
        if "-----BEGIN PRIVATE KEY-----" not in pk:
            print("❌ private_key missing header.")
            return
        if "-----END PRIVATE KEY-----" not in pk:
            print("❌ private_key missing footer.")
            return
        
        # Try to create credentials
        print("\n🔄 Attempting to sign a JWT...")
        creds = service_account.Credentials.from_service_account_file(key_path)
        
        # Force a refresh to check validity
        try:
           creds.refresh(Request())
           print("✅ Credentials refreshed successfully. The key is VALID and working! 🚀")
        except Exception as e:
           print(f"❌ Credential Refresh Failed: {e}")

    except json.JSONDecodeError as e:
        print(f"❌ JSON Decode Error: {e}")
    except Exception as e:
        print(f"❌ unexpected error: {e}")

if __name__ == "__main__":
    validate_key()
