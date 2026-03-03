import requests
import json

def check_ollama():
    print("Checking Ollama Connection...")
    
    # Test 1: OpenAI compatible endpoint
    url_v1 = "http://127.0.0.1:11434/v1/models"
    try:
        print(f"Testing {url_v1}...")
        resp = requests.get(url_v1, timeout=5)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print("Response keys:", data.keys())
            if 'data' in data:
                print(f"Found {len(data['data'])} models via /v1/models")
                print("First model:", data['data'][0] if data['data'] else "None")
        else:
            print("Response:", resp.text)
    except Exception as e:
        print(f"Failed to connect to {url_v1}: {e}")

    print("-" * 20)

    # Test 2: Native Ollama endpoint
    url_native = "http://127.0.0.1:11434/api/tags"
    try:
        print(f"Testing {url_native}...")
        resp = requests.get(url_native, timeout=5)
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            print("Response keys:", data.keys())
            if 'models' in data:
                print(f"Found {len(data['models'])} models via /api/tags")
                print("First model:", data['models'][0] if data['models'] else "None")
        else:
            print("Response:", resp.text)
    except Exception as e:
        print(f"Failed to connect to {url_native}: {e}")

    print("-" * 20)

    # Test 3: Localhost hostname
    url_localhost = "http://localhost:11434/api/tags"
    try:
        print(f"Testing {url_localhost}...")
        resp = requests.get(url_localhost, timeout=5)
        print(f"Status: {resp.status_code}")
    except Exception as e:
        print(f"Failed to connect to {url_localhost}: {e}")

if __name__ == "__main__":
    check_ollama()
