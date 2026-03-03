
import requests
import json

try:
    print("Testing connection to http://localhost:11434/v1/models...")
    resp = requests.get("http://localhost:11434/v1/models", timeout=5)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        print("Models found:")
        print(json.dumps(resp.json(), indent=2))
    else:
        print(f"Error: {resp.text}")
except Exception as e:
    print(f"Connection failed: {e}")

try:
    print("\nTesting connection to http://localhost:11434/api/tags (Standard Ollama API)...")
    resp = requests.get("http://localhost:11434/api/tags", timeout=5)
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        print("Models found (Standard API):")
        print(json.dumps(resp.json(), indent=2))
except Exception as e:
    print(f"Connection failed: {e}")
