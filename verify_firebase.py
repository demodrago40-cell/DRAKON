
import firebase_admin
from firebase_admin import credentials, firestore
import os

print("firebase-admin imported successfully")
try:
    if os.path.exists("serviceAccountKey.json"):
        cred = credentials.Certificate("serviceAccountKey.json")
        try:
             firebase_admin.get_app()
        except ValueError:
             firebase_admin.initialize_app(cred)
             
        print("Firebase initialized successfully")
        
        db = firestore.client()
        print("Firestore client initialized successfully")
        
        # Try a write operation to verify permissions
        doc_ref = db.collection('test_connection').document('status')
        doc_ref.set({'connected': True, 'timestamp': firestore.SERVER_TIMESTAMP})
        print("✅ Write operation successful! Backend is connected.")
        
    else:
        print("❌ serviceAccountKey.json not found")
except Exception as e:
    print(f"❌ Error: {e}")
