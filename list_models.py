import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('GEMINI_API_KEY')
if not api_key:
    print("Error: GEMINI_API_KEY not found in environment.")
else:
    genai.configure(api_key=api_key)
    try:
        with open('available_models.txt', 'w') as f:
            f.write("Listing available models:\n")
            for m in genai.list_models():
                f.write(f"{m.name}\n")
        print("Models written to available_models.txt")
    except Exception as e:
        print(f"Error listing models: {e}")
