import sys
import websocket
import urllib.parse
import os
import json
import datetime
import requests
import logging
import time
import hashlib
import secrets
import tempfile
import uuid
import subprocess
import random
import logging
import time
import subprocess
import shutil
import uuid
import smtplib
from collections import OrderedDict
from email.mime.text import MIMEText
from functools import wraps
import hashlib
import json
import re
import io
import base64
import threading
from typing import List, Dict, Union

# Gmail API imports
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


# File Processing
import fitz  # PyMuPDF for high-fidelity PDF extraction
from docx import Document as DocxDocument
from PIL import Image

from flask import Flask, render_template, request, jsonify, session, Response, stream_with_context, redirect, url_for, flash, Blueprint, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv
from openai import OpenAI
import firebase_admin
from firebase_admin import credentials, firestore

# --- Configuration & Setup ---

import warnings

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')

# Suppress PyTorch DataLoader pin_memory UserWarning on CPU-only machines
warnings.filterwarnings("ignore", message=".*pin_memory.*")

# Determine base path for bundled resources (PyInstaller support)
if getattr(sys, 'frozen', False):
    BASE_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Ensure generated images directory exists
os.makedirs(os.path.join(BASE_DIR, 'static', 'generated'), exist_ok=True)

class Config:
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024 # 50 MB max file upload size
    SECRET_KEY = os.getenv('SECRET_KEY', secrets.token_hex(32))
    PERMANENT_SESSION_LIFETIME = datetime.timedelta(days=30)
    FIREBASE_WEB_API_KEY = os.getenv('FIREBASE_WEB_API_KEY', '')
    GROK_API_KEY = os.getenv('GROK_API_KEY', '')
    OLLAMA_API_URL = os.getenv('OLLAMA_API_URL', "http://127.0.0.1:11434/v1")
    
    # ComfyUI
    COMFY_URL = "http://127.0.0.1:8188"
    COMFY_PATH = "D:/IMG_GEN/ComfyUI_windows_portable"
    
    # Database
    SQLALCHEMY_DATABASE_URI = 'sqlite:///drakon.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    SESSION_COOKIE_SAMESITE = 'Lax'
    FIREBASE_AUTH_URL = "https://identitytoolkit.googleapis.com/v1/accounts"

    # Email Config
    CONTACT_EMAIL = os.getenv('CONTACT_EMAIL', 'kanasagrayug@gmail.com')
    CONTACT_PASSWORD = os.getenv('CONTACT_PASSWORD', 'njsg soev ugda absw')

def get_gmail_service():
    """Initializes and returns the Gmail API service using token.json."""
    creds = None
    token_path = os.path.join(BASE_DIR, 'token.json')
    if os.path.exists(token_path):
        creds = Credentials.from_authorized_user_file(token_path, ['https://www.googleapis.com/auth/gmail.send'])
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Save the refreshed credentials
            with open(token_path, 'w') as token:
                token.write(creds.to_json())
        else:
            raise Exception("No valid Gmail API credentials found. Run generate_token.py first.")
            
    return build('gmail', 'v1', credentials=creds)

def send_email_via_gmail_api(recipient, subject, body, reply_to=None):
    """Sends an email using the Gmail Google API to bypass port blocks."""
    from email.message import EmailMessage
    
    msg = EmailMessage()
    msg.set_content(body)
    msg['To'] = recipient
    msg['From'] = Config.CONTACT_EMAIL
    msg['Subject'] = subject
    if reply_to:
        msg['Reply-To'] = reply_to
        
    encoded_message = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    create_message = {'raw': encoded_message}
    
    try:
        service = get_gmail_service()
        send_message = (service.users().messages().send(userId="me", body=create_message).execute())
        logging.info(f"Email sent via Gmail API: {send_message['id']}")
        return True
    except HttpError as error:
        logging.error(f"An error occurred sending email via Gmail API: {error}")
        return False

db = SQLAlchemy()

# Initialize Firebase Admin SDK
firestore_db = None
try:
    cred_path = os.path.join(BASE_DIR, 'serviceAccountKey.json')
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred)
        firestore_db = firestore.client()
        logging.info("Firebase initialized successfully")
    else:
        logging.warning("serviceAccountKey.json not found. Firebase features disabled.")
except Exception as e:
    logging.error(f"Firebase initialization failed: {e}")

# --- Database Models ---

class Chat(db.Model):
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.String(100), nullable=False)
    title = db.Column(db.String(200))
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    messages = db.relationship('Message', backref='chat', cascade='all, delete-orphan')

class Message(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    chat_id = db.Column(db.String(36), db.ForeignKey('chat.id'), nullable=False)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

# --- Services (Refactored & Optimized) ---

# --- Helper Functions ---
MAX_FILE_CHARS = 16000  # Safety limit for LLM context window to prevent API timeouts or local crashes

import pytesseract

if getattr(sys, 'frozen', False):
    tesseract_dir = os.path.join(sys._MEIPASS, 'tesseract')
else:
    tesseract_dir = os.path.join(BASE_DIR, 'tesseract')

pytesseract.pytesseract.tesseract_cmd = os.path.join(tesseract_dir, 'tesseract.exe')
os.environ["TESSDATA_PREFIX"] = os.path.join(tesseract_dir, 'tessdata')

def extract_text_from_file(file) -> str:
    """Extracts text from PDF, DOCX, or text-based files with high fidelity."""
    filename = file.filename.lower()
    content = ""
    file_size = 0
    
    try:
        # ALWAYS SEEK TO 0 BEFORE READING 
        if hasattr(file, 'seek'):
            file.seek(0)
            
        if filename.endswith('.pdf'):
            pdf_bytes = file.read()
            file_size = len(pdf_bytes)
            logging.info(f"Processing PDF '{filename}' (size: {file_size} bytes)")
            
            try:
                # Use PyMuPDF (fitz) for perfect layout preservation and text reading
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                reader = None # Load lazily only if a large image is found
                
                for page in doc:
                    # 1. Get native text: preserves paragraphs and natural reading order
                    text = page.get_text("text") 
                    if text.strip():
                        content += text.strip() + "\n\n"
                    
                    # 2. Extract embedded images and run OCR on them
                    for img_index, img in enumerate(page.get_images(full=True)):
                        xref = img[0]
                        width = img[2]
                        height = img[3]
                        
                        # Skip tiny images (layout lines, dots, 1x1 pixels) to save massive OCR processing time
                        if width < 50 or height < 50:
                            continue
                            
                        try:
                            base_image = doc.extract_image(xref)
                            image_bytes = base_image["image"]
                            
                            # Run OCR on the embedded image
                            img = Image.open(io.BytesIO(image_bytes))
                            img_text = pytesseract.image_to_string(img).strip()
                            if img_text:
                                content += f"\n\n[Image Text]: {img_text}\n\n"
                        except Exception as img_err:
                            logging.warning(f"Failed to extract/OCR embedded image {xref} in '{filename}': {img_err}")

                doc.close()
            except Exception as pdf_err:
                logging.warning(f"PyMuPDF failed to read PDF stream '{filename}': {pdf_err}. Attempting OCR fallback.")
            
            # If the PDF is a completely scanned image (no native text) or extraction failed, use EasyOCR Fallback on entire pages
            if not content.strip():
                logging.info(f"[{filename}] No extractable text found. Initiating Tesseract OCR fallback.")
                try:
                    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                    for i, page in enumerate(doc):
                        try:
                            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                            img_bytes = pix.tobytes("png")
                            img = Image.open(io.BytesIO(img_bytes))
                            img_text = pytesseract.image_to_string(img).strip()
                            if img_text:
                                content += img_text + "\n\n"
                        except Exception as page_err:
                            logging.error(f"OCR failed on page {i} of '{filename}': {page_err}")
                    doc.close()
                except Exception as ocr_err:
                    logging.error(f"Failed to open PDF for OCR '{filename}': {ocr_err}")
                    
            if not content.strip():
                # Provide a clean fallback message if nothing works
                logging.warning(f"[{filename}] Completely unreadable PDF.")
                return "[No readable text found in PDF]"
            
        elif filename.endswith('.docx'):
            file_bytes = file.read()
            file_size = len(file_bytes)
            file.seek(0)
            logging.info(f"Processing DOCX '{filename}' (size: {file_size} bytes)")
            
            doc = DocxDocument(file)
            for para in doc.paragraphs:
                if para.text.strip():
                    content += para.text.strip() + "\n\n"
        else:
            # Try decoding as utf-8, fallback to latin-1
            file_bytes = file.read()
            file_size = len(file_bytes)
            file.seek(0)
            logging.info(f"Processing Text File '{filename}' (size: {file_size} bytes)")
            try:
                content = file.read().decode('utf-8')
            except UnicodeDecodeError:
                file.seek(0)
                content = file.read().decode('latin-1')
    except Exception as e:
        logging.error(f"Error extracting text from {filename}: {e}")
        return f"[Error extracting text from {filename}]"
    
    content = content.strip()
    
    # Safety truncation for very large files
    if len(content) > MAX_FILE_CHARS:
        content = content[:MAX_FILE_CHARS] + f"\n\n[... Truncated — file exceeded {MAX_FILE_CHARS} characters. Only the first portion is shown.]"
        logging.warning(f"Truncated '{filename}' from {len(content)} to {MAX_FILE_CHARS} chars")
    
    logging.info(f"Successfully extracted {len(content)} chars from '{filename}'")
    return content

def encode_image_file(file) -> str:
    """Encodes an image file to base64 string."""
    try:
        return base64.b64encode(file.read()).decode('utf-8')
    except Exception as e:
        logging.error(f"Error encoding image: {e}")
        return ""

class AuthService:
    """Handles Authentication logic."""
    @staticmethod
    def login(email, password):
        if not Config.FIREBASE_WEB_API_KEY:
            return False, "Firebase API key missing."
        
        url = f"{Config.FIREBASE_AUTH_URL}:signInWithPassword?key={Config.FIREBASE_WEB_API_KEY}"
        payload = {"email": email, "password": password, "returnSecureToken": True}
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            data = response.json()
            if response.status_code == 200:
                return True, data
            
            error_map = {
                "EMAIL_EXISTS": "Account already exists.",
                "INVALID_LOGIN_CREDENTIALS": "Invalid email or password.",
                "USER_DISABLED": "Account disabled."
            }
            msg = data.get("error", {}).get("message", "Unknown error")
            return False, error_map.get(msg, f"Auth Error: {msg}")
        except Exception as e:
            logging.error(f"Auth failed: {e}")
            return False, "Authentication service unreachable."

    @staticmethod
    def signup(email, password):
        if not Config.FIREBASE_WEB_API_KEY:
            return False, "Firebase API key missing."
        
        url = f"{Config.FIREBASE_AUTH_URL}:signUp?key={Config.FIREBASE_WEB_API_KEY}"
        payload = {"email": email, "password": password, "returnSecureToken": True}
        
        try:
            response = requests.post(url, json=payload, timeout=10)
            data = response.json()
            if response.status_code == 200:
                return True, data
            
            error_map = {
                "EMAIL_EXISTS": "Account already exists.",
                "OPERATION_NOT_ALLOWED": "Password sign-in disabled.",
                "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Try again later."
            }
            msg = data.get("error", {}).get("message", "Unknown error")
            return False, error_map.get(msg, f"Signup Error: {msg}")
        except Exception as e:
            logging.error(f"Signup failed: {e}")
            return False, "Authentication service unreachable."

class DatabaseService:
    """Handles all Database interactions to keep logic clean."""
    
    @staticmethod
    def create_chat(user_id, title="New Chat"):
        chat_id = str(uuid.uuid4())
        new_chat = Chat(id=chat_id, user_id=user_id, title=title)
        
        # Note: We do NOT inject system prompt into DB anymore to avoid duplication
        
        try:
            db.session.add(new_chat)
            db.session.commit()
            return chat_id
        except Exception as e:
            db.session.rollback()
            logging.error(f"Create chat error: {e}")
            return None

    @staticmethod
    def get_user_chats(user_id):
        return Chat.query.filter_by(user_id=user_id).order_by(Chat.updated_at.desc()).all()

    @staticmethod
    def get_chat_history(chat_id, limit=30):
        # Optimized query: Fetch last N USER/ASSISTANT messages directly
        # Exclude system messages (prevents duplication)
        msgs = Message.query.filter(Message.chat_id == chat_id)\
            .filter(Message.role != 'system')\
            .order_by(Message.created_at.desc())\
            .limit(limit)\
            .all()
        return list(reversed(msgs))

    @staticmethod
    def save_message(chat_id, role, content):
        try:
            chat = Chat.query.get(chat_id)
            if not chat: return False
            
            msg = Message(chat_id=chat_id, role=role, content=content)
            chat.updated_at = datetime.datetime.utcnow()
            db.session.add(msg)
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            logging.error(f"Save message error: {e}")
            return False

    @staticmethod
    def check_chat_ownership(chat_id, user_id):
        return Chat.query.filter_by(id=chat_id, user_id=user_id).first()

    @staticmethod
    def delete_chat(chat_id, user_id):
        chat = Chat.query.filter_by(id=chat_id, user_id=user_id).first()
        if chat:
            db.session.delete(chat)
            db.session.commit()
            return True
        return False
    
    @staticmethod
    def clear_user_chats(user_id):
        try:
            Chat.query.filter_by(user_id=user_id).delete()
            db.session.commit()
            return True
        except:
            db.session.rollback()
            return False

class ComfyService:
    """Manages ComfyUI Process and Generation."""
    _process = None

    @classmethod
    def is_running(cls):
        try:
            requests.get(Config.COMFY_URL, timeout=1)
            return True
        except:
            return False

    @classmethod
    def start(cls):
        if cls._process is None or cls._process.poll() is not None:
            logging.info("Starting ComfyUI...")
            try:
                cls._process = subprocess.Popen(
                    ["run_nvidia_gpu.bat"], cwd=Config.COMFY_PATH, shell=True
                )
                # Wait for startup
                for _ in range(40):
                    if cls.is_running(): return True
                    time.sleep(1)
            except Exception as e:
                logging.error(f"ComfyUI start failed: {e}")
                return False
        return cls.is_running()

    @staticmethod
    def generate_image(prompt):
        # 1. Prepare Workflow
        try:
            with open(os.path.join(BASE_DIR, "juggernaut_workflow.json"), "r") as f:
                workflow = json.loads(f.read().replace("PROMPT_TEXT", prompt))
            
            # Randomize seed
            if "5" in workflow and "inputs" in workflow["5"]:
                workflow["5"]["inputs"]["seed"] = random.randint(1, 10**12)
            
            prompt_id = str(uuid.uuid4())
            payload = {"prompt": workflow, "client_id": prompt_id}
            
            # 2. WebSocket Connection
            ws = websocket.WebSocket()
            ws.connect(f"ws://127.0.0.1:8188/ws?clientId={prompt_id}")
            
            # 3. Send Prompt
            res = requests.post(f"{Config.COMFY_URL}/prompt", json=payload)
            if res.status_code != 200: raise Exception(f"ComfyUI Error: {res.text}")
            
            track_id = res.json().get("prompt_id")
            
            # 4. Listen for Completion
            while True:
                out = ws.recv()
                if isinstance(out, str):
                    msg = json.loads(out)
                    if msg['type'] == 'executing' and msg['data']['node'] is None and msg['data']['prompt_id'] == track_id:
                        break
                    if msg['type'] == 'execution_success' and msg['data']['prompt_id'] == track_id:
                        break
            ws.close()
            
            # 5. Get Results
            hist = requests.get(f"{Config.COMFY_URL}/history/{track_id}").json()
            images = []
            if track_id in hist:
                outputs = hist[track_id].get("outputs", {})
                for out in outputs.values():
                    for img in out.get("images", []):
                        qs = urllib.parse.urlencode({
                            "filename": img["filename"], 
                            "subfolder": img.get("subfolder",""), 
                            "type": img.get("type","output")
                        })
                        images.append(f"/view?{qs}")
            
            return images
        except Exception as e:
            logging.error(f"Generation failed: {e}")
            raise e

PROMPT_CACHE_FILE = os.path.join(BASE_DIR, 'system_prompt_cache.json')
REMOTE_PROMPT_URL = "https://demodrago40-cell.github.io/DRAKON-Prompt/prompt.json"

DEFAULT_SYSTEM_PROMPT = """You are DRAKON — a world-class Universal Intelligence Agent.
Attempting to connect to the remote instruction cache..."""

def load_system_prompt():
    """Fetch remote prompt, fallback to local cache, then hardcoded default."""
    try:
        resp = requests.get(REMOTE_PROMPT_URL, timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            with open(PROMPT_CACHE_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f)
            return data.get('system_prompt', DEFAULT_SYSTEM_PROMPT)
    except Exception as e:
        logging.warning(f"Failed to fetch remote prompt: {e}")

    try:
        if os.path.exists(PROMPT_CACHE_FILE):
            with open(PROMPT_CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data.get('system_prompt', DEFAULT_SYSTEM_PROMPT)
    except Exception as e:
        logging.warning(f"Failed to read local prompt cache: {e}")

    return DEFAULT_SYSTEM_PROMPT

class DrakonAI:
    """Core AI Logical Engine."""
    
    def __init__(self):
        self.system_prompt = load_system_prompt()
        self.stats = {'requests': 0, 'cache_hits': 0, 'errors': 0, 'success': 0}
        self.cache = OrderedDict()
        self.client = None
        self.ollama_client = None
        
        # Init Clients
        try:
            self.client = OpenAI(api_key=Config.GROK_API_KEY, base_url="https://api.groq.com/openai/v1")
            logging.info("DRAKON (Groq) Ready.")
        except: logging.error("Groq Init Failed")
            
        try:
            self.ollama_client = OpenAI(api_key="ollama", base_url=Config.OLLAMA_API_URL)
            logging.info("DRAKON (Ollama) Ready.")
        except: logging.error("Ollama Init Failed")

    def _get_cache(self, key):
        if key in self.cache:
            self.cache.move_to_end(key)
            return self.cache[key]
        return None

    def _set_cache(self, key, value):
        self.cache[key] = value
        if len(self.cache) > 100: self.cache.popitem(last=False)

    def handle_meta_questions(self, prompt: str):
        q = prompt.lower().strip()
        if q in ["who are you", "who r you", "what are you", "who are u"]:
            return "I am DRAKON, an AI coding assistant built into Drakon. I help with programming, debugging, system design, and technical problem-solving."
        if "what can you do" in q or "what do you do" in q:
            return "I can write and debug code, explain technical concepts, design systems, and help with software development tasks."
        if "what model" in q or "which model" in q:
            return "I am powered by large language models running via Groq and local Ollama backends."
        if q in ["hi", "hello", "hey", "hii", "helo"]:
            return "Hello! How can I help you with coding today?"
        return None

    def _sanitize_response(self, text):
        # Remove flowery intros
        starts = [
            r'^Ah,?\s+(a user|hello|greetings|welcome).*?[\.\!]\s*',
            r'^How may I (assist|help|serve) you.*?[\.\!]\s*',
            r'^(Greetings|Salutations|Hello there).*?[\.\!]\s*',
        ]
        for p in starts: text = re.sub(p, '', text, flags=re.IGNORECASE)
        # Convert star bullet lines to hyphen bullets
        text = re.sub(r'^(\s*)\*\s+', r'\1- ', text, flags=re.MULTILINE)
        # Remove excessive emoji clusters (allow up to 4 for engagement)
        text = re.sub(r'([\U0001F300-\U0001F9FF]){5,}', lambda m: m.group(0)[:4], text)
        return text.lstrip()

    def get_available_models(self, auto_start=True):
        import shutil
        
        # 1. Base Models
        models = []
        is_desktop = os.environ.get('DRAKON_DESKTOP_MODE') == 'true' or getattr(sys, 'frozen', False)
        
        if not is_desktop:
            models = [
                {"id": "drakon", "name": "✨ Drakon Pro (Cloud)", "provider": "groq"},
                {"id": "drakon-fast", "name": "⚡ Drakon Fast (Cloud)", "provider": "groq"},
            ]
        
        # Guest check
        if 'user_id' not in session:
             return [models[0]] if models else [{"id": "ollama-placeholder", "name": "⚠️ Guest Login Required for Local Models", "provider": "ollama"}]

        # 2. Check for Render Environment
        # Render (and other cloud envs) likely won't have Ollama installed.
        # We should skip auto-start to prevent timeouts/errors.
        is_render = os.environ.get('RENDER') or os.environ.get('railway') or os.environ.get('VERCEL')
        if is_render:
            logging.info("Running in Cloud Environment (Render/Railway). Skipping Ollama auto-start.")
            # We can still try to connect just in case they have a sidecar, but don't auto-start.
            auto_start = False

        ollama_connected = False
        
        # 3. Try to connect to existing Ollama instance
        for base_url in [Config.OLLAMA_API_URL, Config.OLLAMA_API_URL.replace("127.0.0.1", "localhost")]:
            try:
                # Short timeout to not block page load
                resp = requests.get(f"{base_url}/models", timeout=1)
                if resp.status_code == 200:
                    data = resp.json().get('data', [])
                    logging.info(f"Ollama connected! Models found: {len(data)}")
                    has_high_perf = any('hushiyar' in m['id'].lower() for m in data)
                    for m in data:
                        model_info = {"id": m['id'], "name": f"🖥️ {m['id']} (Local)", "provider": "ollama"}
                        if not has_high_perf and 'hushiyar' not in m['id'].lower():
                            model_info['disabled'] = True
                            model_info['disabledReason'] = 'High-performance AI model (Hushiyar) required to unlock other models.'
                        models.append(model_info)
                    
                    if not has_high_perf:
                        models.append({
                            "id": "aryanvala/hushiyar-alpha:latest", 
                            "name": "🖥️ aryanvala/hushiyar-alpha:latest (Local)", 
                            "provider": "ollama",
                            "disabled": True,
                            "disabledReason": "Please download this model first via terminal: ollama run aryanvala/hushiyar-alpha:latest"
                        })
                        for m in models:
                            if m['id'] in ['drakon', 'drakon-fast']:
                                m['disabled'] = True
                                m['disabledReason'] = "Local Hushiyar model must be downloaded to unlock."
                    
                    # Update client to use the working URL
                    if base_url != Config.OLLAMA_API_URL:
                        try:
                            self.ollama_client = OpenAI(api_key="ollama", base_url=base_url)
                        except: pass
                    ollama_connected = True
                    break
            except:
                continue
        
        # 4. Auto-Start Ollama (Local Only)
        if not ollama_connected and auto_start:
            logging.info("Attempting to auto-start Ollama...")
            try:
                # Define potential paths for Ollama executable
                ollama_paths = []
                
                # A. Check Environment Variable OLLAMA_PATH
                custom_path = os.environ.get('OLLAMA_PATH')
                if custom_path and os.path.exists(custom_path):
                    logging.info(f"Found Ollama via OLLAMA_PATH: {custom_path}")
                    ollama_paths.append(custom_path)
                    
                # B. Check System PATH using shutil.which
                system_path = shutil.which("ollama")
                if system_path:
                    logging.info(f"Found Ollama in PATH: {system_path}")
                    ollama_paths.append(system_path)
                
                # C. Check common Windows paths (Fallback)
                if os.name == 'nt':
                    user_profile = os.environ.get('USERPROFILE', '')
                    local_app_data = os.environ.get('LOCALAPPDATA', '')
                    
                    possible_paths = [
                        os.path.join(local_app_data, 'Programs', 'Ollama', 'ollama.exe'),
                        os.path.join(user_profile, 'AppData', 'Local', 'Programs', 'Ollama', 'ollama.exe'),
                        "C:\\Program Files\\Ollama\\ollama.exe"
                    ]
                    
                    for p in possible_paths:
                        if os.path.exists(p) and p not in ollama_paths:
                            logging.info(f"Found Ollama at default location: {p}")
                            ollama_paths.append(p)

                # Fix OLLAMA_MODELS path if incorrect (common user error where it points to parent)
                current_models_path = os.environ.get('OLLAMA_MODELS')
                if current_models_path:
                    potential_fix = os.path.join(current_models_path, 'models')
                    if os.path.exists(potential_fix) and os.path.exists(os.path.join(potential_fix, 'blobs')):
                        logging.info(f"Correcting OLLAMA_MODELS path from {current_models_path} to {potential_fix}")
                        os.environ['OLLAMA_MODELS'] = potential_fix

                # Try to start
                started = False
                if not ollama_paths:
                     logging.warning("No Ollama executable found in OLLAMA_PATH, PATH, or default locations.")
                
                for cmd in ollama_paths:
                    try:
                        logging.info(f"Trying to start Ollama with command: {cmd}")
                        # Use CREATE_NO_WINDOW to hide the console window on Windows
                        flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                        subprocess.Popen([cmd, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
                        started = True
                        break
                    except FileNotFoundError:
                        continue
                    except Exception as e:
                        logging.error(f"Error starting with {cmd}: {e}")
                
                if not started:
                    logging.error("Could not start 'ollama'. Please ensure it is installed or set OLLAMA_PATH.")

                # Wait for startup with retries (up to 5 seconds to be snappy)
                # If it takes longer, the user can refresh
                for attempt in range(5):
                    time.sleep(1)
                    for base_url in [Config.OLLAMA_API_URL, Config.OLLAMA_API_URL.replace("127.0.0.1", "localhost")]:
                        try:
                            resp = requests.get(f"{base_url}/models", timeout=1)
                            if resp.status_code == 200:
                                data = resp.json().get('data', [])
                                logging.info(f"Ollama auto-started! Models: {len(data)}")
                                has_high_perf = any('hushiyar' in m['id'].lower() for m in data)
                                for m in data:
                                    model_info = {"id": m['id'], "name": f"🖥️ {m['id']} (Local)", "provider": "ollama"}
                                    if not has_high_perf and 'hushiyar' not in m['id'].lower():
                                        model_info['disabled'] = True
                                        model_info['disabledReason'] = 'High-performance AI model (Hushiyar) required to unlock other models.'
                                    models.append(model_info)
                                
                                if not has_high_perf:
                                    models.append({
                                        "id": "aryanvala/hushiyar-alpha:latest", 
                                        "name": "🖥️ aryanvala/hushiyar-alpha:latest (Local)", 
                                        "provider": "ollama",
                                        "disabled": True,
                                        "disabledReason": "Please download this model first via terminal: ollama run aryanvala/hushiyar-alpha:latest"
                                    })
                                    for m in models:
                                        if m['id'] in ['drakon', 'drakon-fast']:
                                            m['disabled'] = True
                                            m['disabledReason'] = "Local Hushiyar model must be downloaded to unlock."
                                
                                try:
                                    self.ollama_client = OpenAI(api_key="ollama", base_url=base_url)
                                except: pass
                                
                                ollama_connected = True
                                break
                        except: pass
                    if ollama_connected: break
                        
            except Exception as e:
                logging.error(f"Failed to auto-start Ollama: {e}")
        
        if not ollama_connected and not is_render:
            models.append({"id": "ollama-placeholder", "name": "⚠️ Ollama Not Running (Click to Retry)", "provider": "ollama"})
        
        return models

    def stream_chat(self, prompt, chat_id, user_id, model_id='drakon', images=None):
        self.stats['requests'] += 1
        
        # Check Desktop Mode Restriction
        is_desktop = os.environ.get('DRAKON_DESKTOP_MODE') == 'true' or getattr(sys, 'frozen', False)
        if is_desktop and model_id in ['drakon', 'drakon-fast']:
            yield "⚠️ **Cloud Models are Disabled in Desktop Mode.**\n\nPlease select a local model from the model selector to ensure 100% privacy."
            return

        # 1. Identity / Meta Interception
        meta = self.handle_meta_questions(prompt)
        if meta:
            DatabaseService.save_message(chat_id, "assistant", meta)
            yield meta
            return

        # 2. Select Provider
        provider = 'groq'
        model = "llama-3.3-70b-versatile"
        extra = {}
        client = self.client
        
        # Handle Images (Override model selection)
        if images and len(images) > 0:
            if model_id == 'drakon' or model_id == 'drakon-fast':
                # Force Cloud Vision
                model = "llama-3.2-90b-vision-preview"
                provider = 'groq'
            else:
                # Use selected local model (assuming it supports vision if user selected it, or force llava)
                provider = 'ollama'
                client = self.ollama_client
                # If generic local model, switch to llava?
                if 'llava' not in model_id and 'vision' not in model_id:
                     model = 'llava' # Default local vision
                else:
                     model = model_id

        if model_id == 'ollama-placeholder':
            # Try to refresh models? Or just tell user
            yield "⚠️ **Ollama is not running or unreachable.**\n\nPlease make sure Ollama is installed and running on your machine (default port 11434).\n\nIf it is running, try refreshing the page or checking your firewall settings."
            return

        if model_id == 'drakon-fast':
            model = "llama-3.1-8b-instant"
        elif model_id != 'drakon':
            provider = 'ollama'
            model = model_id
            client = self.ollama_client
            # If we switched to localhost in get_available_models, self.ollama_client might still point to 127.0.0.1
            # We should ideally update Config or client, but per-request client creation is expensive.
            # Let's hope client library handles redirects or we need to update Config.
            # Actually, standard OpenAI client might need correct base_url.
            
            # Simple retry logic for client if needed
            extra = {"keep_alive": "30m"}

        if not client:
            yield "⚠️ Model provider not available."
            return

        # 3. Prepare Context
        # Check cache
        cache_key = hashlib.md5(f"{chat_id}:{prompt}".encode()).hexdigest()
        cached = self._get_cache(cache_key)
        if cached:
            self.stats['cache_hits'] += 1
            DatabaseService.save_message(chat_id, "assistant", cached)
            yield cached
            return

        # Fetch history
        history = DatabaseService.get_chat_history(chat_id, limit=30)
        messages = [{"role": "system", "content": self.system_prompt}]
        for m in history:
            messages.append({"role": m.role, "content": m.content})
        
        logging.info(f"[STREAM-DEBUG] History messages: {len(history)}, prompt length: {len(prompt)}")
        if history:
            logging.info(f"[STREAM-DEBUG] Last history content length: {len(history[-1].content)}, matches prompt: {history[-1].content == prompt}")
        
        # Ensure current prompt is ALWAYS the last message
        # (Handles guests where msg isn't saved to DB, and ensures file content is included)
        if not history or history[-1].content != prompt:
            messages.append({"role": "user", "content": prompt})
            logging.info(f"[STREAM-DEBUG] Appended prompt to messages")
        
        # Log final message count and last user message length
        user_msgs = [m for m in messages if m['role'] == 'user']
        if user_msgs:
            logging.info(f"[STREAM-DEBUG] Total messages: {len(messages)}, last user msg length: {len(user_msgs[-1]['content'])}")

        
        # 4. Stream & buffer
        try:
            logging.info(f"Generating: {model} ({provider})")
            stream = client.chat.completions.create(
                model=model, messages=messages, stream=True, temperature=0.6, extra_body=extra
            )
            
            full_response = ""
            buffer = ""
            flushed = False
            BUFFER_SIZE = 200

            for chunk in stream:
                content = chunk.choices[0].delta.content
                if content:
                    if not flushed:
                        buffer += content
                        if len(buffer) >= BUFFER_SIZE or '\n' in content:
                            sanitized = self._sanitize_response(buffer)
                            full_response += sanitized
                            yield sanitized
                            flushed = True
                    else:
                        full_response += content
                        yield content
            
            # Flush remaining
            if not flushed and buffer:
                sanitized = self._sanitize_response(buffer)
                full_response = sanitized
                yield sanitized

            self._set_cache(cache_key, full_response)
            DatabaseService.save_message(chat_id, "assistant", full_response)
            self.stats['success'] += 1

        except Exception as e:
            self.stats['errors'] += 1
            logging.error(f"Stream error: {e}")
            yield f"⚠️ Error: {str(e)}"

# --- Application Factory & Routes ---

main_bp = Blueprint('main', __name__)
landing_bp = Blueprint('landing', __name__)
drakon = DrakonAI()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json:
                return jsonify({'error': 'Unauthorized'}), 401
            return redirect(url_for('main.login'))
        return f(*args, **kwargs)
    return decorated

@main_bp.route('/health')
def health():
    return jsonify({"status": "healthy"}), 200

@main_bp.route('/')
def index():
    # Desktop App specific logic
    is_desktop = os.environ.get('DRAKON_DESKTOP_MODE') == 'true' or getattr(sys, 'frozen', False)
    if is_desktop:
        if 'user_id' not in session:
            session['user_id'] = 'desktop_user'
            session['username'] = 'Desktop User'
    
    user = session.get('username')
    is_guest = 'user_id' not in session
    
    # Initialize guest prompt count if not exists
    if is_guest and 'guest_prompt_count' not in session:
        session['guest_prompt_count'] = 0
        
    prompt_count = session.get('guest_prompt_count', 0) if is_guest else 0
    
    # Check for show_landing query param or logic
    show_landing = is_guest # Default to showing landing only for guests on root
    
    return render_template('index.html', user=user, is_guest=is_guest, prompt_count=prompt_count, show_landing=show_landing)

@landing_bp.route('/landing')
def index():
    """Explicit landing page route"""
    user = session.get('username')
    is_guest = 'user_id' not in session
    prompt_count = session.get('guest_prompt_count', 0) if is_guest else 0
    return render_template('index.html', user=user, is_guest=is_guest, prompt_count=prompt_count, show_landing=True)

@landing_bp.route('/features')
def features():
    return render_template('features.html')

@landing_bp.route('/about')
def about():
    return render_template('about.html')

@landing_bp.route('/learnmore')
def learnmore():
    return render_template('learnmore.html')

@landing_bp.route('/promo')
def promo():
    return render_template('promo.html')

@main_bp.route('/login', methods=['GET', 'POST'])
def login():
    if 'user_id' in session:
        target_url = '/' if os.environ.get('DRAKON_DESKTOP_MODE') == 'true' else '/download'
        if request.is_json:
            return jsonify({'status': 'success', 'url': target_url, 'redirect_url': target_url})
        return redirect(target_url)

    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        success, res = AuthService.login(data.get('email'), data.get('password'))
        if success:
            session.permanent = True
            session['user_id'] = res['email']
            session['uid'] = res['localId']
            
            # If desktop mode, go to index. If web, go to download.
            target_url = '/' if os.environ.get('DRAKON_DESKTOP_MODE') == 'true' else '/download'
            
            return jsonify({'status': 'success', 'url': target_url, 'redirect_url': target_url}) if request.is_json else redirect(target_url)
        
        return jsonify({'status': 'error', 'message': res, 'error': res}), 400 if request.is_json else flash(res, 'danger')
        
    return render_template('login.html')

# --- OTP Signup Logic ---
pending_signups = {}

def generate_otp():
    return str(random.randint(100000, 999999))

def send_otp_email(email, otp):
    subject = "DRAKON - Email Verification"
    body = f"Your DRAKON account verification code is: {otp}\n\nThis code will expire in 10 minutes."
    return send_email_via_gmail_api(email, subject, body)

@main_bp.route('/api/verify-otp', methods=['POST'])
def verify_otp():
    data = request.get_json()
    email = data.get('email')
    otp = data.get('otp')
    
    if email not in pending_signups:
        return jsonify({'status': 'error', 'message': 'No pending signup found for this email or session expired.'}), 400
        
    signup_data = pending_signups[email]
    
    if datetime.datetime.now() > signup_data['expires']:
        del pending_signups[email]
        return jsonify({'status': 'error', 'message': 'OTP has expired. Please sign up again.'}), 400
        
    if signup_data['otp'] != otp:
        return jsonify({'status': 'error', 'message': 'Invalid verification code.'}), 400
        
    # OTP is valid, proceed with Firebase signup
    password = signup_data['password']
    success, res = AuthService.signup(email, password)
    
    if success:
        # Cleanup
        del pending_signups[email]
        
        session.permanent = True
        session['user_id'] = res['email']
        session['uid'] = res['localId']
        
        # NEW: Store user in Firestore Database
        try:
            if firestore_db is not None:
                user_ref = firestore_db.collection('users').document(res['localId'])
                user_ref.set({
                    'email': res['email'],
                    'created_at': firestore.SERVER_TIMESTAMP,
                    'auth_provider': 'email_otp'
                })
                logging.info(f"Successfully stored new user {res['email']} in Firestore.")
        except Exception as e:
            logging.error(f"Failed to store user in Firestore: {e}")
        
        target_url = '/' if os.environ.get('DRAKON_DESKTOP_MODE') == 'true' else '/download'
        return jsonify({'status': 'success', 'url': target_url, 'redirect_url': target_url})
    
    return jsonify({'status': 'error', 'message': res, 'error': res}), 400

@main_bp.route('/api/resend-otp', methods=['POST'])
def resend_otp():
    data = request.get_json()
    email = data.get('email')
    
    if email not in pending_signups:
        return jsonify({'status': 'error', 'message': 'No pending signup found.'}), 400
        
    otp = generate_otp()
    pending_signups[email]['otp'] = otp
    pending_signups[email]['expires'] = datetime.datetime.now() + datetime.timedelta(minutes=10)
    
    if send_otp_email(email, otp):
        return jsonify({'status': 'success', 'message': 'New OTP sent to your email.'})
    else:
        return jsonify({'status': 'error', 'message': 'Failed to send verification email.'}), 500

@main_bp.route('/signup', methods=['GET', 'POST'])
def signup():
    if 'user_id' in session:
        target_url = '/' if os.environ.get('DRAKON_DESKTOP_MODE') == 'true' else '/download'
        return redirect(target_url)

    if request.method == 'POST':
        data = request.get_json() if request.is_json else request.form
        email = data.get('email')
        password = data.get('password')
        
        import datetime
        otp = generate_otp()
        pending_signups[email] = {
            'otp': otp,
            'password': password,
            'expires': datetime.datetime.now() + datetime.timedelta(minutes=10)
        }
        
        if send_otp_email(email, otp):
            if request.is_json:
                return jsonify({'status': 'otp_required', 'message': 'Verification code sent to your email.'})
            else:
                return render_template('signup.html', otp_required=True, email=email)
        else:
            return jsonify({'status': 'error', 'message': 'Failed to send verification email. Please try again later.'}), 500

    return render_template('signup.html')

@main_bp.route('/download')
@login_required
def download():
    return render_template('download.html')

@main_bp.route('/download/exe')
@login_required
def download_exe():
    user_id = session.get('user_id', 'unknown')
    
    try:
        # 1. Update total download count
        stats_ref = firestore_db.collection('analytics').document('downloads')
        if not stats_ref.get().exists:
            stats_ref.set({'count': 0})
        else:
            stats_ref.update({'count': firestore.Increment(1)})
        
        # 2. Log individual download event
        firestore_db.collection('download_logs').add({
            'user_id': user_id,
            'timestamp': firestore.SERVER_TIMESTAMP
        })
        logging.info(f"Download tracked for user: {user_id}")
    except Exception as e:
        logging.error(f"Failed to track download: {e}")

    # Redirect to GitHub Release artifact
    return redirect('https://github.com/Yugpatel009/DRAKON-USE/releases/tag/V.1.0')

@main_bp.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('main.login'))

@main_bp.route('/api/chats', methods=['GET'])
@login_required
def get_chats():
    chats = DatabaseService.get_user_chats(session['user_id'])
    return jsonify([{"id": c.id, "title": c.title, "updated_at": c.updated_at.isoformat()} for c in chats])

@main_bp.route('/api/chat/new', methods=['POST'])
@login_required
def create_chat():
    data = request.get_json() or {}
    cid = DatabaseService.create_chat(session['user_id'], data.get('title', 'New Chat'))
    return jsonify({'id': cid, 'title': data.get('title', 'New Chat')}) if cid else (jsonify({'error': 'Failed'}), 500)

@main_bp.route('/api/contact', methods=['POST'])
def contact():
    try:

        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid JSON provided'}), 400

        name = data.get('name')
        email = data.get('email')
        message = data.get('message')
        
        if not name or not message or not email:
            return jsonify({'error': 'Name, email, and message are required'}), 400

        receiver_email = Config.CONTACT_EMAIL  # Send to self/admin

        subject = f"New Contact Request from {name}"
        body = f"Name: {name}\nEmail: {email}\n\nMessage:\n{message}"
        
        success = send_email_via_gmail_api(receiver_email, subject, body, reply_to=email)

        if success:
            return jsonify({'success': True, 'message': 'Email sent successfully!'})
        else:
            return jsonify({'error': 'Failed to send email via API.'}), 500
    except Exception as e:
        logging.error(f"Email send failed: {e}")
        return jsonify({'error': f'Failed to send email. Error: {str(e)}'}), 500

@main_bp.route('/api/chat/<chat_id>', methods=['GET'])
@login_required
def get_chat(chat_id):
    if not DatabaseService.check_chat_ownership(chat_id, session['user_id']):
        return jsonify({'error': 'Not found'}), 404
    # Note: excluding system prompt is implicit as we don't save it to DB anymore
    msgs = [{"role": m.role, "content": m.content} for m in DatabaseService.get_chat_history(chat_id, 1000)]
    return jsonify(msgs)

@main_bp.route('/api/chat/<chat_id>', methods=['DELETE'])
@login_required
def delete_chat(chat_id):
    if DatabaseService.delete_chat(chat_id, session['user_id']):
        return jsonify({'status': 'deleted'})
    return jsonify({'error': 'Not found'}), 404

@main_bp.route('/api/models')
def get_models():
    return jsonify(drakon.get_available_models())

@main_bp.route('/chat', methods=['POST'])
def chat():
    # Handle multipart/form-data for file uploads
    content_type = request.content_type or ''
    
    if content_type.startswith('multipart/form-data'):
        msg = request.form.get('message', '')
        chat_id = request.form.get('chat_id')
        model = request.form.get('model', 'drakon')
        user_id = request.form.get('user_id')
        files = request.files.getlist('files')
    else:
        data = request.get_json()
        msg = data.get('message', '')
        chat_id = data.get('chat_id')
        model = data.get('model', 'drakon')
        user_id = session.get('user_id')
        files = []

    if not msg and not files: return jsonify({'error': 'Empty'}), 400
    
    # Guest Logic
    if 'user_id' not in session:
        count = session.get('guest_prompt_count', 0)
        logging.info(f"Guest prompt count: {count}/5")
        if count >= 5:
            logging.info("Guest limit reached. Returning 403.")
            return jsonify({'error': 'LIMIT_REACHED', 'message': 'You have reached the free limit. Please login to continue.'}), 403
        
        session['guest_prompt_count'] = count + 1
        model = 'drakon' # Enforce default model for guests
        user_id = 'guest'
    else:
        # If multipart, user_id might be passed, but session is safer source of truth
        user_id = session['user_id']
    
    if not chat_id:
        if 'user_id' in session:
            chat_id = DatabaseService.create_chat(user_id, msg[:30] if msg else "File Upload")
        else:
            chat_id = "guest_chat_" + str(uuid.uuid4())

    # --- File Processing ---
    attached_images = []
    file_context = ""
    
    if files:
        logging.info(f"[FILE-DEBUG] Processing {len(files)} file(s): {[f.filename for f in files]}")
        for file in files:
            fname = file.filename
            fname_lower = fname.lower()
            
            if fname_lower.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')):
                try:
                    # Attempt OCR on the image first to append text context
                    file.seek(0)
                    img_bytes = file.read()
                    img = Image.open(io.BytesIO(img_bytes))
                    text = pytesseract.image_to_string(img).strip()
                    if text:
                        file_context += f"\n\n[ATTACHED IMAGE TEXT: {fname}]\n{text}\n[END OF IMAGE TEXT]"
                        logging.info(f"[FILE-DEBUG] OCR extracted {len(text)} chars from {fname}")
                except Exception as e:
                    logging.error(f"OCR failed for {fname}: {e}")

                file.seek(0) # Reset pointer so it can be base64 encoded
                encoded_image = encode_image_file(file)
                if encoded_image:
                    attached_images.append(encoded_image)
                    logging.info(f"[FILE-DEBUG] Image encoded: {fname}")
            else:
                text = extract_text_from_file(file)
                logging.info(f"[FILE-DEBUG] extract_text_from_file({fname}) returned {len(text) if text else 0} chars")
                
                if text and text.startswith('[IMAGE_PDF_MARKER'):
                    logging.info(f"[FILE-DEBUG] PDF {fname} is image-only. Converting pages to images for Vision Model.")
                    try:
                        file.seek(0)
                        pdf_bytes = file.read()
                        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                        for i in range(min(5, len(doc))): # Process up to 5 pages
                            pix = doc[i].get_pixmap(matrix=fitz.Matrix(2, 2))
                            img_bytes = pix.tobytes("jpeg")
                            b64_img = base64.b64encode(img_bytes).decode('utf-8')
                            attached_images.append(b64_img)
                            file_context += f"\n\n[ATTACHED PDF PAGE {i+1} AS IMAGE]"
                        doc.close()
                        text = f"[System Note: The attached PDF '{fname}' was scanned as {min(5, len(doc))} images. Read the images to answer the user's question.]"
                        logging.info(f"[FILE-DEBUG] Successfully converted {min(5, len(doc))} PDF pages to images.")
                    except Exception as img_err:
                        logging.error(f"Failed to convert PDF to images: {img_err}")
                        text = f"[Error converting PDF to images: {img_err}]"

                if text and not text.startswith('[Error'):
                    file_context += f"\n\n[ATTACHED FILE: {fname}]\n{text}\n[END OF FILE: {fname}]"
                else:
                    logging.warning(f"[FILE-DEBUG] FAILED to extract text from {fname}")
    
    logging.info(f"[FILE-DEBUG] file_context length: {len(file_context)}, msg before append: {len(msg) if msg else 0}")
    
    # Append file context to message with clear instructions
    if file_context:
        user_question = (msg or '').strip()
        if user_question:
            msg = f"{user_question}\n\nThe user has attached the following file(s). Use the content below to answer their question:{file_context}"
        else:
            msg = f"The user has attached the following file(s). Provide a clear and comprehensive summary of the content:{file_context}"
        logging.info(f"[FILE-DEBUG] Final msg length after file append: {len(msg)}")


    # Save User Message
    if 'user_id' in session:
        # Note: We currently don't save image data to DB to save space, only text
        DatabaseService.save_message(chat_id, "user", msg)
    
    # Check for images -> Switch to Vision Model
    if attached_images:
        # Force vision model if not already selected (e.g. if user is on drakon/text model)
        # Priority: llama-3.2-90b-vision (Cloud/Groq) or llava (Local)
        
        # If using local ollama, use llava or llama3.2-vision
        if model not in ['drakon', 'drakon-fast']:
             # User selected a local model. Let's see if we should override or trust them.
             # Ideally we check if model supports vision. For now, assume user knows best OR force a known vision model if generic.
             pass
        else:
             # Default cloud vision model
             model = 'llama-3.2-90b-vision-preview' 

    return Response(
        stream_with_context(drakon.stream_chat(msg, chat_id, user_id, model, images=attached_images)),
        mimetype='text/plain'
    )

@main_bp.route('/generate-image', methods=['POST'])
@login_required
def generate_image():
    if not ComfyService.start():
        return jsonify({"error": "ComfyUI failed to start"}), 500
    try:
        prompt = request.get_json().get('prompt', '').strip()
        if not prompt: return jsonify({'error': 'No prompt'}), 400
        
        images = ComfyService.generate_image(prompt)
        if images:
            return jsonify({'success': True, 'image': images[0], 'images': images, 'prompt': prompt})
        return jsonify({'error': 'No images generated'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@main_bp.route("/view")
def proxy_view():
    try:
        resp = requests.get(f"{Config.COMFY_URL}/view", params=request.args, stream=True)
        return Response(stream_with_context(resp.iter_content(chunk_size=1024)), 
                        status=resp.status_code, content_type=resp.headers.get("content-type"))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@main_bp.route('/reset', methods=['POST'])
@login_required
def reset():
    DatabaseService.clear_user_chats(session['user_id'])
    return jsonify({'status': 'reset'})

def create_app():
    template_dir = os.path.join(BASE_DIR, 'templates')
    static_dir = os.path.join(BASE_DIR, 'static')
            
    app = Flask(__name__, template_folder=template_dir, static_folder=static_dir)
    app.config.from_object(Config)
    CORS(app)
    db.init_app(app)
    with app.app_context(): db.create_all()
    app.register_blueprint(main_bp)
    app.register_blueprint(landing_bp)
    
    # Pre-loading OCR no longer required for lightweight Tesseract
    return app

app = create_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
